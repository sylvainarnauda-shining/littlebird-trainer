'use strict';
// Under automation (navigator.webdriver), the page answers navigator.getGamepads with its own emulation: the pads a test
// puts into window.__LB_EMULATED_GAMEPADS__, never the browser's. Here the browser's getGamepads is a trap that counts
// calls (it would hand out a "real" stick): the panel and a flight with the HOTAS on never reach it, and an emulated vJoy
// device flies the helicopter. One boot, Math.random seeded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp } = require('../helpers/mock-dom');
const { seedMathRandom, SEED } = require('../helpers/rng');
const G = require('../helpers/gamepads');

seedMathRandom(SEED + 122);
const trap = { calls: 0 };
const nav = {
  webdriver: true,
  getGamepads() {
    trap.calls++;
    return [G.pad({ index: 0, id: G.T16000M_ID })];
  },
};
const S = bootApp({ manualClock: true, navigator: nav });
const { app, el } = S;
let clock = 1000;
const frames = (n = 1) => {
  for (let i = 0; i < n; i++) app.frame((clock += 10));
};

test('the emulation replaces getGamepads before any read; there is no way back to the real one', () => {
  assert.notEqual(nav.getGamepads.name, 'getGamepads');
  assert.deepEqual(Array.from(nav.getGamepads()), []);
  assert.throws(() => {
    nav.getGamepads = () => [];
  }, TypeError);
  assert.ok(Array.isArray(S.context.__LB_EMULATED_GAMEPADS__));
  assert.equal(trap.calls, 0);
});

test('the panel and a flight with the HOTAS on read the emulated pads only', () => {
  el('joyRead').onclick();
  frames(12);
  assert.match(el('joyStatus').textContent, /Bouge un manche/);
  const vjoy = G.pad({ index: 0, id: G.VJOY_ID });
  S.context.__LB_EMULATED_GAMEPADS__.push(vjoy);
  frames(12);
  assert.match(el('joyDevices').children[0].children[0].textContent, /vJoy Device/);
  el('joyRead').onclick();
  el('joyUseHotas').checked = true;
  el('joyUseHotas').oninput();
  el('joyPitchDevice').value = 'main';
  el('joyPitchDevice').oninput();
  S.document.pointerLockElement = el('world');
  app.setConfig({ scenario: 'free', duration: 0 });
  app.start();
  frames(2);
  const f = app.flight;
  f.position.set(0, 400, -300);
  f.velocity.set(0, 0, 0);
  f.onGround = false;
  G.report(vjoy, { axes: { 1: 1 } });
  frames(40);
  assert.ok(f.angular.x > 0.2, 'the emulated stick pitches the nose up');
  assert.equal(trap.calls, 0, 'the browser getGamepads was never called');
});
