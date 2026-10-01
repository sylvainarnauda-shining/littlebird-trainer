'use strict';
// The desktop self-test never captures the mouse or the keyboard of the machine that runs it (the same rule as the
// browser specs, tests/build/browser-safety.test.js), checked on the code itself:
//  - desktop/self-test.cjs asserts the page's pointer-lock emulation (navigator.webdriver and
//    window.__LB_EMULATED_POINTER_LOCK__) before its first click on Start, and again right before that click;
//  - it clicks Start once, and calls no real capture or fullscreen API;
//  - every permission is denied while it runs (policy.permissionAllowed with selfTest), and main.cjs passes that flag,
//    also to the page's headers (Permissions-Policy gamepad=(): the machine's joysticks are never read);
//  - the self-test window cannot take focus, is click-through and absent from the taskbar;
//  - its report is a new file in a real folder of the temporary folder (on POSIX, one of this user with mode 0700),
//    never written through an existing file or link;
//  - the shell enters the self-test only with LB_SELF_TEST set to the nonce, and every launcher sets it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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

test('self-test.cjs: the joystick read is checked emulated and refused by the page policy before Start, never called', () => {
  const src = code('desktop/self-test.cjs');
  const at = src.indexOf("document.getElementById('start').click()");
  const check = src.indexOf("Object.getOwnPropertyDescriptor(navigator, 'getGamepads')");
  assert.ok(check > 0 && check < at, 'checked before Start is clicked');
  assert.match(src, /writable === false && typeof d\.value === 'function' && Array\.isArray\(list\)/);
  assert.match(src, /fp\.allowsFeature\('gamepad'\)/);
  assert.match(
    src,
    /if \(!pads\.emulated \|\| pads\.pads !== 0 \|\| pads\.policyAllows === true\)\s*return finish\(/,
    'a page that could read the joysticks stops the self-test before Start',
  );
  assert.ok(!/getGamepads\s*\(/.test(src), 'the self-test never calls getGamepads');
  // The self-test's headers refuse the Gamepad API (a normal run allows it for the page only), and no permission of the
  // shell stands for it.
  const policyOf = (h) => Object.fromEntries(h['permissions-policy'].split(/,\s*/).map((d) => d.split('=')));
  assert.equal(policyOf(p.responseHeaders('x', { selfTest: true })).gamepad, '()');
  assert.equal(policyOf(p.responseHeaders('x')).gamepad, '(self)');
  for (const selfTest of [true, false])
    assert.equal(p.permissionAllowed('gamepad', 'app://littlebird/index.html', { selfTest }), false);
});

test('self-test.cjs: a session flies until it has simulated 2 s over 20 drawn frames, whatever the machine speed', async () => {
  const st = require(path.join(ROOT, 'desktop', 'self-test.cjs'));
  assert.deepEqual(st.SESSION, { simulated: 2, frames: 20, wallMs: 180000 });
  const src = code('desktop/self-test.cjs');
  assert.ok(!/await sleep\(3000\)/.test(src), 'no fixed stretch of real time');
  assert.match(src, /js\(`\(\$\{flyUntil\.toString\(\)\}\)\(\$\{JSON\.stringify\(SESSION\)\}\)`\)/);
  // flyUntil, run here on a fake page: perFrame(n) is the simulated time frame n adds (the real page counts at most
  // 0.1 s per frame, a slow software renderer), calls(n) its WebGL draw calls, running(n) whether the session runs.
  const saved = { window: globalThis.window, document: globalThis.document, raf: globalThis.requestAnimationFrame };
  const page = ({ perFrame, running = () => true, calls = () => 300 }) => {
    let time = 0;
    let frames = 0;
    globalThis.window = {
      trainerDiagnostics: () => ({ time, running: running(frames), webgl: { calls: calls(frames) }, fps: 50 }),
    };
    globalThis.document = { hidden: false, hasFocus: () => true };
    globalThis.requestAnimationFrame = (cb) =>
      setImmediate(() => {
        frames++;
        time += perFrame(frames);
        cb();
      });
  };
  const fly = (wallMs = 60000) => st.flyUntil({ simulated: 2, frames: 20, wallMs });
  try {
    page({ perFrame: () => 0.1 });
    const slow = await fly();
    assert.equal(slow.flown, true);
    assert.ok(slow.flyingFrames >= 20 && slow.simulated >= 2, JSON.stringify(slow));
    page({ perFrame: () => 1 / 120 });
    const fast = await st.flyUntil({ simulated: 0.5, frames: 20, wallMs: 60000 });
    assert.equal(fast.flown, true);
    assert.ok(fast.frames >= 60, 'at 1/120 s per frame, 0.5 s takes 60 frames: ' + fast.frames);
    // A display faster than the 120 Hz steps: frames without a step do not count, and are not a failure.
    page({ perFrame: (n) => (n % 3 === 0 ? 0 : 1 / 120) });
    const fastDisplay = await st.flyUntil({ simulated: 0.5, frames: 20, wallMs: 60000 });
    assert.equal(fastDisplay.flown, true);
    assert.ok(fastDisplay.frames > fastDisplay.flyingFrames, JSON.stringify(fastDisplay));
    // Not flown:
    page({ perFrame: () => 0.1, running: (n) => n < 5 });
    const paused = await fly();
    assert.deepEqual([paused.flown, paused.running], [false, false], 'a session that stops running has not flown');
    page({ perFrame: () => 0 });
    const frozen = await fly(300);
    assert.equal(frozen.flown, false, 'a frame loop whose simulation does not advance');
    page({ perFrame: () => 1 / 60, calls: () => 0 });
    const noDraw = await fly(300);
    assert.deepEqual([noDraw.flown, noDraw.drawnFrames], [false, 0], 'a loop that simulates without drawing');
    page({ perFrame: () => 0.1, calls: (n) => (n <= 10 ? 300 : 0) });
    const stopsDrawing = await fly(300);
    assert.deepEqual([stopsDrawing.flown, stopsDrawing.flyingFrames], [false, 10], 'a loop that stops drawing');
    // Enough simulated time and frames from frame 20 or 21, but frames 20-23 draw nothing: the verdict waits for 24.
    page({ perFrame: () => 0.1, calls: (n) => (n >= 20 && n <= 23 ? 0 : 300) });
    const lastUndrawn = await st.flyUntil({ simulated: 2, frames: 5, wallMs: 60000 });
    assert.deepEqual([lastUndrawn.flown, lastUndrawn.frames], [true, 24], 'the verdict waits for a drawn frame');
    page({ perFrame: (n) => (n === 1 ? 2 : 0) });
    const jump = await fly(300);
    assert.deepEqual([jump.flown, jump.flyingFrames], [false, 1], 'one jump of simulated time, then a stall');
  } finally {
    globalThis.window = saved.window;
    globalThis.document = saved.document;
    globalThis.requestAnimationFrame = saved.raf;
  }
});

test('self-test.cjs: the negative probes wait for their evidence before judging', () => {
  const src = code('desktop/self-test.cjs');
  assert.match(src, /contents\.on\('will-frame-navigate'/);
  assert.match(
    src,
    /const attempted = await until\(\(\) => attempts\.some\(\(url\) => url === PROBE_URL\), EVIDENCE_MS\)/,
  );
  assert.match(src, /navigation: report\.steps\.navigation\.attempted && report\.steps\.navigation\.stayed/);
  assert.match(
    src,
    /await until\(\(\) => downloads\.some\(\(d\) => d\.name === 'little-bird-probe\.exe'\), EVIDENCE_MS\)/,
  );
});

test('self-test.cjs: the report is a new file in a real folder, never written through an existing one', () => {
  const st = require(path.join(ROOT, 'desktop', 'self-test.cjs'));
  const src = code('desktop/self-test.cjs');
  assert.equal((src.match(/writeFileSync\(/g) || []).length, 1, 'every report goes through writeReport');
  assert.match(src, /writeFileSync\(reportPath\(nonce\), .*, \{ flag: 'wx', mode: 0o600 \}\)/);
  assert.match(
    src,
    /fs\.mkdirSync\(ROOT, \{ recursive: true, mode: 0o700 \}\);\n\s*const stat = fs\.lstatSync\(ROOT\);\n\s*if \(!stat\.isDirectory\(\)\)/,
  );
  assert.match(src, /if \(stat\.uid !== process\.getuid\(\)\) throw /, 'on POSIX, a folder of another user is refused');
  const nonce = crypto.randomBytes(12).toString('hex');
  const file = st.reportPath(nonce);
  try {
    assert.equal(st.writeReport(nonce, { ok: true }), true);
    assert.equal(st.writeReport(nonce, { ok: false }), false, 'an existing file is not written through');
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { ok: true });
    if (typeof process.getuid === 'function') {
      const folder = fs.lstatSync(st.ROOT);
      assert.equal(folder.uid, process.getuid(), 'the folder is this user');
      assert.equal(folder.mode & 0o077, 0, 'the folder is closed to other users');
      assert.equal(fs.statSync(file).mode & 0o077, 0, 'the report is closed to other users');
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('every permission is denied during a self-test, and the self-test window cannot take input', () => {
  for (const perm of ['pointerLock', 'fullscreen', 'keyboardLock', 'media', 'openExternal'])
    assert.equal(p.permissionAllowed(perm, 'app://littlebird/index.html', { selfTest: true }), false, perm);
  const main = code('desktop/main.cjs');
  assert.match(main, /const flags = \{ selfTest: Boolean\(selfTest\) \}/);
  assert.match(main, /policy\.permissionAllowed\(permission, details\.requestingUrl, flags\)/);
  assert.match(main, /policy\.permissionAllowed\(permission, requestingOrigin, flags\)/);
  // The page's response headers take the flag too: gamepad=() during a self-test (its joysticks are never read).
  assert.match(main, /policy\.responseHeaders\(csp, flags\)/);
  assert.match(p.responseHeaders('x', { selfTest: true })['permissions-policy'], /(?:^|, )gamepad=\(\)(?:,|$)/);
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
