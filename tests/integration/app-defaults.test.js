'use strict';
// Public defaults (declared steps R5.5 and R5.5b, docs/REGLAGES.md): with no stored profile the application starts with
// the game's defaults where the guides give them (air-vehicle multiplier 0.5, fields of view 90, the game's helicopter
// keys with fire on the left mouse button) and chosen neutral values where they do not (Y axis not inverted,
// sensitivities 50 %, no axis isolation); the menu's "Réglages initiaux" button gives the same. One boot, Math.random
// seeded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp } = require('../helpers/mock-dom');
const { seedMathRandom, SEED } = require('../helpers/rng');

seedMathRandom(SEED + 113);
const { P } = require('../helpers/runtime').modules();
const S = bootApp({ profile: null });
const { app, el } = S;

const PLAYER = {
  pitchSens: 50,
  yawSens: 50,
  vehicleMultiplier: 0.5,
  invertY: false,
  isolation: 0,
  fovCockpit: 90,
  fovChase: 90,
};
const KEYS = {
  collectiveUp: 'ShiftLeft',
  collectiveDown: 'ControlLeft',
  pitchUp: 'KeyS',
  pitchDown: 'KeyW',
  yawLeft: 'KeyQ',
  yawRight: 'KeyE',
  rollLeft: 'KeyA',
  rollRight: 'KeyD',
  fire: 'Mouse0',
  flares: 'KeyV',
  freeLook: 'AltLeft',
  shop: 'KeyB',
  view: 'KeyC',
  reset: 'KeyR',
  neutral: 'KeyX',
};

test('player settings: the documented public defaults', () => {
  for (const [k, v] of Object.entries(PLAYER)) {
    assert.equal(P.defaults[k], v, 'physics.js default ' + k);
    assert.equal(app.cfg[k], v, 'boot ' + k);
  }
});

test("key bindings: the game's helicopter defaults and the trainer's own keys, each key once", () => {
  assert.deepEqual({ ...app.bindings }, KEYS);
  assert.equal(new Set(Object.values(app.bindings)).size, Object.keys(KEYS).length);
});

test('the reset button restores the same defaults', () => {
  app.cfg.pitchSens = 12;
  app.bindings.view = 'KeyZ';
  el('defaults').onclick();
  assert.equal(app.cfg.pitchSens, PLAYER.pitchSens);
  assert.deepEqual({ ...app.bindings }, KEYS);
});
