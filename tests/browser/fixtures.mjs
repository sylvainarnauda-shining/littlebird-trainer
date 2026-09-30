// Shared fixture of the browser specs. Safety first (the maintainer's machine must never have its mouse or keyboard
// captured by a test, even a headless one):
//  - the run must be headless;
//  - before any page script, the real capture APIs (pointer lock and its exit, fullscreen, keyboard lock) are replaced
//    by traps that only count calls, so no page code can ever reach them;
//  - the page's own automation shim must then emulate the pointer lock (window.__LB_EMULATED_POINTER_LOCK__ under
//    navigator.webdriver): openTrainer() asserts it before returning, that is before any Start click;
//  - after each test the traps must show zero calls, the page must have thrown no error, and the page's content
//    security policy must have refused nothing (no `securitypolicyviolation` event since the last page load).
// Sessions are reproducible: Math.random is seeded in the page, and with manualClock the frames are driven by the test
// at exactly 100 Hz through the exposed frame(now) instead of real time.
//
// Scope. A test whose title ends with the tag @gpu renders hundreds to thousands of frames (every simulated 10 ms is a
// rendered frame of the valley): seconds with a graphics card, hours with software WebGL (measured with WARP: 0.9 s per
// frame at 1600x900 on a 12-thread desktop CPU, about 1.2 s with 4 CPUs; SwiftShader 5 s). `npm run test:browser` runs
// every test (the maintainer's GPU, required before each release: docs/PUBLIER-UNE-VERSION.md); the CI job, which has
// no GPU, runs the others (`npm run test:browser:ci`, --grep-invert @gpu): the page and its policy in Chromium, WebGL2,
// the emulated pointer lock, G5 parity, stored-profile migrations, export and import, the leave guard.
import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE = path.join(ROOT, 'dist', 'web', 'index.html');
export const PROFILE_KEY = 'littlebird-range-v1';
export const SEED = Number.parseInt(process.env.LB_TEST_SEED || '20260929', 10);

// Every refusal of the page's content security policy since the page loaded (checked after each test).
function recordPolicyViolations() {
  if (window.__LB_TEST_CSP__) return;
  const list = [];
  Object.defineProperty(window, '__LB_TEST_CSP__', { value: list });
  document.addEventListener('securitypolicyviolation', (e) => list.push(e.effectiveDirective));
}

function installTraps() {
  if (window.__LB_TEST_TRAPS__) return;
  const calls = { pointerLock: 0, exitPointerLock: 0, fullscreen: 0, keyboardLock: 0 };
  Object.defineProperty(window, '__LB_TEST_TRAPS__', { value: calls });
  Element.prototype.requestPointerLock = function () {
    calls.pointerLock++;
    return Promise.resolve();
  };
  Document.prototype.exitPointerLock = function () {
    calls.exitPointerLock++;
  };
  const noFullscreen = function () {
    calls.fullscreen++;
    return Promise.reject(new Error('fullscreen is disabled in tests'));
  };
  Element.prototype.requestFullscreen = noFullscreen;
  if ('webkitRequestFullscreen' in Element.prototype) Element.prototype.webkitRequestFullscreen = noFullscreen;
  if (navigator.keyboard && typeof navigator.keyboard.lock === 'function') {
    navigator.keyboard.lock = () => {
      calls.keyboardLock++;
      return Promise.resolve();
    };
  }
}

function seedPage({ seed, profile, profileKey, manualClock }) {
  let s = seed >>> 0 || 1;
  Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  window.__LB_EXPOSE__ = (api) => {
    window.__app = api;
  };
  if (manualClock) window.__LB_MANUAL_CLOCK__ = true;
  // The stored profile is written once per test, before the first load (a reload keeps what the page saved).
  if (profile && !sessionStorage.getItem('__lb_seeded')) {
    sessionStorage.setItem('__lb_seeded', '1');
    localStorage.setItem(profileKey, profile);
  }
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (testInfo.project.use.headless === false) throw new Error('the browser specs run headless only');
    if (!fs.existsSync(PAGE))
      throw new Error('dist/web/index.html is missing: run `npm run build` (npm run test:browser does)');
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(installTraps);
    await page.addInitScript(recordPolicyViolations);
    page.lbErrors = errors;
    await use(page);
    const traps = await page.evaluate(() => ({ ...window.__LB_TEST_TRAPS__ })).catch(() => null);
    if (traps)
      expect(traps, 'no real capture API was called').toEqual({
        pointerLock: 0,
        exitPointerLock: 0,
        fullscreen: 0,
        keyboardLock: 0,
      });
    expect(errors, 'no uncaught page error').toEqual([]);
    const refused = await page
      .evaluate(() => (window.__LB_TEST_CSP__ ? [...window.__LB_TEST_CSP__] : []))
      .catch(() => []);
    expect(refused, 'no content security policy violation').toEqual([]);
  },
});
export { expect };

// How long a page may take to boot: with software WebGL on a busy CI runner a boot took more than 3 minutes (30/09).
export const BOOT_TIMEOUT = process.env.CI ? 360_000 : 180_000;

// Opens the trainer and waits for its menu. Options: profile (object stored before the first load), hash ('#carte=...'),
// manualClock (frames driven by the test), seed. Asserts the automation pointer-lock emulation before returning.
export async function openTrainer(page, { profile = null, hash = '', manualClock = false, seed = SEED } = {}) {
  await page.addInitScript(seedPage, {
    seed,
    profile: profile && JSON.stringify(profile),
    profileKey: PROFILE_KEY,
    manualClock,
  });
  await page.goto(pathToFileURL(PAGE).href + hash);
  await page.waitForFunction(
    () => window.__app && window.trainerDiagnostics && !document.getElementById('start').disabled,
    null,
    { timeout: BOOT_TIMEOUT },
  );
  await assertEmulatedPointerLock(page);
}

// The page runs under WebDriver and emulates the pointer lock itself; nothing reached a real capture API.
export async function assertEmulatedPointerLock(page) {
  const state = await page.evaluate(() => ({
    webdriver: navigator.webdriver,
    emulated: window.__LB_EMULATED_POINTER_LOCK__ === true,
    traps: { ...window.__LB_TEST_TRAPS__ },
  }));
  expect(state, 'pointer lock emulated in the page under automation').toEqual({
    webdriver: true,
    emulated: true,
    traps: { pointerLock: 0, exitPointerLock: 0, fullscreen: 0, keyboardLock: 0 },
  });
}

export const diag = (page) => page.evaluate(() => trainerDiagnostics());

// The key bound to an action (a KeyboardEvent.code such as 'KeyW', 'ShiftLeft' or 'Space', which Playwright's keyboard
// accepts as a key name, or a mouse button 'Mouse0'-'Mouse2'), so that the specs follow the default layout whatever it
// is; hold() and press() handle both.
export const keyFor = (page, action) => page.evaluate((a) => trainerDiagnostics().bindings[a], action);
const BUTTONS = { Mouse0: 'left', Mouse1: 'middle', Mouse2: 'right' };
// Mouse buttons are pressed where the pointer already is (no move: a move would turn the helicopter).
const down = (page, key) => (BUTTONS[key] ? page.mouse.down({ button: BUTTONS[key] }) : page.keyboard.down(key));
const up = (page, key) => (BUTTONS[key] ? page.mouse.up({ button: BUTTONS[key] }) : page.keyboard.up(key));
export async function press(page, key) {
  await down(page, key);
  await up(page, key);
}

// Clicks Start (only after the emulation check of openTrainer) and waits for the emulated capture and the session.
export async function start(page) {
  await assertEmulatedPointerLock(page);
  await page.locator('#start').click();
  await page.waitForFunction(() => document.pointerLockElement !== null && trainerDiagnostics().running);
}

// Advances the manual clock by n frames of 10 ms (100 Hz), rendering each frame.
export function frames(page, n) {
  return page.evaluate((count) => {
    let t = window.__lbClock || 1000;
    for (let i = 0; i < count; i++) {
      t += 10;
      window.__app.frame(t);
    }
    window.__lbClock = t;
  }, n);
}
export const seconds = (page, s) => frames(page, Math.round(s * 100));

// Advances the manual clock until cond (a function run in the page, with arg) is true, checking every `every` frames;
// returns the simulated seconds it took, or null after maxSeconds.
export async function until(page, cond, maxSeconds, arg = null, every = 5) {
  for (let f = 0; f <= maxSeconds * 100; f += every) {
    if (await page.evaluate(cond, arg)) return f / 100;
    await frames(page, every);
  }
  return null;
}

// Sound levels follow Web Audio ramps on the audio clock (real time), not the test's frame clock: waits (real time, at
// most `timeout` ms) until pred, run in the page, holds; true if it did.
export function audioSettled(page, pred, timeout = 10_000) {
  return page.waitForFunction(pred, null, { timeout, polling: 50 }).then(
    () => true,
    () => false,
  );
}

// Holds a key or a mouse button for a number of simulated seconds (manual clock).
export async function hold(page, key, s) {
  await down(page, key);
  await seconds(page, s);
  await up(page, key);
}

// Leaves the session through the emulated lock (the app pauses) and waits for it to stop.
export async function leave(page) {
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => !trainerDiagnostics().running);
}
