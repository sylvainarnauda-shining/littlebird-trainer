'use strict';
// The desktop self-test never captures the mouse or the keyboard of the machine that runs it (the same rule as the
// browser specs, tests/build/browser-safety.test.js), checked on the code itself:
//  - desktop/self-test.cjs asserts the page's pointer-lock emulation (navigator.webdriver and
//    window.__LB_EMULATED_POINTER_LOCK__) before its first click on Start, and again right before that click;
//  - it clicks Start once, and calls no real capture or fullscreen API;
//  - every permission is denied while it runs (policy.permissionAllowed with selfTest), and main.cjs passes that flag;
//  - the self-test window cannot take focus, is click-through and absent from the taskbar;
//  - the shell enters the self-test only with LB_SELF_TEST set to the nonce, and every launcher sets it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/paths');

const p = require(path.join(ROOT, 'desktop', 'policy.cjs'));
const code = (f) =>
  fs
    .readFileSync(path.join(ROOT, f), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/ .*$/gm, '');

test('self-test.cjs: the emulation is asserted before Start is clicked, and again right before the click', () => {
  const src = code('desktop/self-test.cjs');
  const click = "document.getElementById('start').click()";
  const at = src.indexOf(click);
  assert.ok(at > 0, 'the self-test starts a session');
  assert.equal(src.indexOf(click, at + 1), -1, 'Start is clicked once');
  const checks = [...src.matchAll(/window\.__LB_EMULATED_POINTER_LOCK__ === true/g)].map((m) => m.index);
  assert.ok(checks.length >= 2 && checks[0] < at, 'an emulation check comes first');
  const last = Math.max(...checks.filter((i) => i < at));
  const between = src.slice(last, at);
  assert.ok(between.length < 400, 'the last check is right before the click');
  assert.match(between, /return finish\(/, 'a failed check stops the self-test before the click');
  assert.match(between, /navigator\.webdriver === true/);
  for (const banned of ['requestFullscreen', 'keyboard.lock', 'setFullScreen', 'focus()', 'requestPointerLock'])
    assert.ok(!src.includes(banned), banned);
});

test('every permission is denied during a self-test, and the self-test window cannot take input', () => {
  for (const perm of ['pointerLock', 'fullscreen', 'keyboardLock', 'media', 'openExternal'])
    assert.equal(p.permissionAllowed(perm, 'app://littlebird/index.html', { selfTest: true }), false, perm);
  const main = code('desktop/main.cjs');
  assert.match(main, /const flags = \{ selfTest: Boolean\(selfTest\) \}/);
  assert.match(main, /policy\.permissionAllowed\(permission, details\.requestingUrl, flags\)/);
  assert.match(main, /policy\.permissionAllowed\(permission, requestingOrigin, flags\)/);
  const o = p.windowOptions({ packaged: true, selfTest: true });
  assert.deepEqual([o.focusable, o.skipTaskbar, o.webPreferences.devTools], [false, true, false]);
  const st = code('desktop/self-test.cjs');
  assert.match(st, /win\.setIgnoreMouseEvents\(true\)/);
  assert.match(st, /win\.showInactive\(\)/);
});

test('the self-test needs LB_SELF_TEST=<nonce>, and every launcher of the packaged app sets it', () => {
  assert.ok(p.selfTestArgs(['exe', '--lb-self-test=0123456789abcdef'], {}).error);
  const smoke = fs.readFileSync(path.join(ROOT, 'scripts', 'desktop-smoke.mjs'), 'utf8');
  assert.match(smoke, /selfTestEnv \? \{ LB_SELF_TEST: id \} : \{\}/);
  // Every launch of the packaged app goes through desktop-smoke.mjs launch() (release-check.mjs imports it).
  for (const f of ['scripts/release-check.mjs', 'scripts/desktop-smoke.mjs']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of s.matchAll(/launch\((?:[^()]|\([^()]*\))*\)/g))
      if (!/^launch\(exe, args/.test(m[0])) assert.match(m[0], /--lb-self-test=<nonce>/, f + ': ' + m[0].slice(0, 80));
  }
});
