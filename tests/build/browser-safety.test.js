// Guards of the browser specs (the maintainer's mouse and keyboard are never captured by a test): the Playwright
// configurations run headless with one worker; every spec takes its `test` from tests/browser/fixtures.mjs (which traps
// the real capture APIs and asserts the page's emulated pointer lock); Start is only ever clicked through its start()
// helper, which asserts the emulation first; no spec asks for fullscreen, a real lock or a keyboard lock.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/paths');

const specs = [];
for (const dir of ['tests/browser', 'tests/perf']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) if (f.endsWith('.spec.mjs')) specs.push(path.join(dir, f));
}

test('the Playwright configurations run headless, one worker, no retries', () => {
  const cfg = fs.readFileSync(path.join(ROOT, 'playwright.config.mjs'), 'utf8');
  assert.match(cfg, /headless: true/);
  assert.match(cfg, /workers: 1/);
  assert.match(cfg, /retries: 0/);
  assert.doesNotMatch(cfg, /headless: false/);
  const perf = fs.readFileSync(path.join(ROOT, 'playwright.perf.config.mjs'), 'utf8');
  assert.match(perf, /\.\.\.base/);
  assert.doesNotMatch(perf, /headless/);
});

test('the CI scope (the tests whose title does not end with @gpu) keeps the browser-only proofs', () => {
  const tagged = [];
  const ci = [];
  for (const f of specs.filter((s) => s.startsWith(path.join('tests', 'browser')))) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of text.matchAll(/\btest\(\s*'((?:[^'\\]|\\.)+)',\s*async\b/g))
      (/ @gpu$/.test(m[1]) ? tagged : ci).push(m[1]);
    assert.ok(!/@gpu(?!')/.test(text.replace(/^\s*\/\/.*$/gm, '')), f + ': @gpu only at the end of a title');
  }
  for (const want of [
    /^G5: /,
    /^boots with the pointer lock emulated/,
    /^beforeunload: /,
    /^export \(revision 16\)/,
    /^getGamepads is the page emulation under WebDriver/,
    /^HOTAS on: an emulated vJoy stick/,
  ])
    assert.ok(
      ci.some((t) => want.test(t)),
      'in the CI scope: ' + want,
    );
  assert.ok(tagged.length >= 10 && ci.length >= 6, `${tagged.length} tagged, ${ci.length} in the CI scope`);
  const fixture = fs.readFileSync(path.join(ROOT, 'tests', 'browser', 'fixtures.mjs'), 'utf8');
  assert.match(fixture, /expect\(refused, 'no content security policy violation'\)\.toEqual\(\[\]\)/);
});

test('every spec uses the safety fixture; Start only through start(); no real capture API anywhere', () => {
  assert.ok(specs.length >= 7, 'specs found: ' + specs.length);
  for (const f of specs) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(text, /from '(\.\.\/browser\/|\.\/)fixtures\.mjs'/, f + ' imports the safety fixture');
    assert.doesNotMatch(text, /from '@playwright\/test'/, f + ' bypasses the fixture');
    assert.doesNotMatch(
      text,
      /locator\(\s*['"`]#start['"`]\s*\)\s*\.\s*(click|dblclick|press|tap|dispatchEvent)|\.(click|dblclick|tap)\(\s*['"`]#start/,
      f + ' clicks Start without the emulation check',
    );
    assert.doesNotMatch(
      text,
      /__LB_REAL_POINTER_LOCK__|requestFullscreen|keyboard\.lock|unadjustedMovement/,
      f + ' asks for a real capture',
    );
    assert.doesNotMatch(text, /REAL_GAMEPADS|realGamepads/i, f + ' asks for the real joysticks');
  }
  const fixture = fs.readFileSync(path.join(ROOT, 'tests', 'browser', 'fixtures.mjs'), 'utf8');
  assert.match(fixture, /addInitScript\(installTraps\)/, 'traps installed before any page script');
  assert.match(fixture, /emulated: window\.__LB_EMULATED_POINTER_LOCK__ === true/);
  // The joystick read is asserted emulated at the same time, so before any Start click too.
  assert.match(
    fixture,
    /gamepadsEmulated:\s*Object\.getOwnPropertyDescriptor\(navigator, 'getGamepads'\)\?\.writable === false &&\s*Array\.isArray\(window\.__LB_EMULATED_GAMEPADS__\)/,
  );
  assert.match(fixture, /emulated: true,\s*gamepadsEmulated: true,/);
  assert.match(
    fixture,
    /await assertEmulatedPointerLock\(page\);\s*await page\.locator\('#start'\)\.click\(\);/,
    'the emulation is asserted right before Start',
  );
  // The real joystick read is trapped too, and must never be called.
  assert.match(fixture, /Navigator\.prototype\.getGamepads = function \(\) \{\s*calls\.gamepads\+\+;/);
  assert.equal(
    (fixture.match(/keyboardLock: 0,\s*gamepads: 0,?\s*\}/g) || []).length,
    3,
    'zero trapped reads expected',
  );
});

test('the page answers navigator.getGamepads with its own emulation under WebDriver, with no way to opt out', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
  const shim =
    /if\(typeof navigator!=='undefined'&&navigator\.webdriver===true\)\{\s*const pads=\[\];emulatedGamepads=\(\)=>pads\.slice\(0,8\);\s*try\{Object\.defineProperty\(navigator,'getGamepads',/;
  assert.match(app, shim);
  // The only read goes through joyRead, which refuses anything but the emulation under WebDriver.
  assert.equal((app.match(/navigator\.getGamepads\(\)/g) || []).length, 1, 'one read site');
  assert.match(
    app,
    /if\(navigator\.webdriver===true&&navigator\.getGamepads!==emulatedGamepads\)\{joy\.error='api';return \[\];\}/,
  );
  for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter((n) => n.endsWith('.js')))
    assert.doesNotMatch(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'),
      /REAL_GAMEPADS|addEventListener\('gamepad/i,
      f,
    );
});
