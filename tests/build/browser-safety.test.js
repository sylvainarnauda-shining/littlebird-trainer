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
  }
  const fixture = fs.readFileSync(path.join(ROOT, 'tests', 'browser', 'fixtures.mjs'), 'utf8');
  assert.match(fixture, /addInitScript\(installTraps\)/, 'traps installed before any page script');
  assert.match(fixture, /emulated: window\.__LB_EMULATED_POINTER_LOCK__ === true/);
  assert.match(
    fixture,
    /await assertEmulatedPointerLock\(page\);\s*await page\.locator\('#start'\)\.click\(\);/,
    'the emulation is asserted right before Start',
  );
});
