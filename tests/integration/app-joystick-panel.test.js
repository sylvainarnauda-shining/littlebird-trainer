'use strict';
// Joysticks in the mocked-DOM application, with a scripted navigator.getGamepads (fake pads only, never the machine's):
// two identical sticks saved from an earlier launch fly nothing before the confirming press (plan JD2). Frames at
// 100 Hz through the exposed frame(now). One boot (the stored profile of an earlier launch), Math.random seeded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp, PROFILE_KEY } = require('../helpers/mock-dom');
const { seedMathRandom, SEED } = require('../helpers/rng');
const G = require('../helpers/gamepads');

seedMathRandom(SEED + 123);
const T16 = (slotHint) => ({ vendor: '044f', product: 'b10a', name: 'T.16000M', slotHint, hatAxis: 9 });
const axis = (device, index, extra = {}) => ({
  device,
  axis: index,
  invert: false,
  sensitivity: 1,
  deadZone: 0.05,
  positive: null,
  negative: null,
  ...extra,
});
// An earlier launch identified two T.16000M: left in slot 0, right in slot 1 (saved slots: a proposal only).
const twinsBlock = {
  schema: 1,
  useHotas: true,
  deviceMatch: 'role',
  confirmRoles: true,
  devices: { main: null, left: T16(0), right: T16(1) },
  axes: {
    Pitch: axis('right', 1),
    Throttle: axis('left', 6),
    Roll: axis('right', 0),
    Yaw: axis(null, 5),
    LookYaw: axis(null, -1),
    LookPitch: axis(null, -1),
  },
  actions: {
    fire: [
      { device: 'right', button: 0 },
      { device: 'left', button: 0 },
    ],
  },
};
const nav = G.fakeNavigator([]);
const S = bootApp({
  manualClock: true,
  navigator: nav,
  profile: { version: 1, tuningRevision: 16, settings: {}, bindings: {}, joystick: twinsBlock },
});
const { app, el } = S;
const toast = () => el('toast').textContent;
const stored = () => JSON.parse(S.stored.get(PROFILE_KEY) || 'null');
let clock = 1000;
const frames = (n = 1) => {
  for (let i = 0; i < n; i++) app.frame((clock += 10));
};
const hoverAt = () => {
  const f = app.flight;
  f.position.set(0, 400, -300);
  f.velocity.set(0, 0, 0);
  f.quaternion.identity();
  f.angular.set(0, 0, 0);
  f.cyclic.set(0, 0, 0);
  f.mouseRate.set(0, 0, 0);
  f.collective = app.cfg.leverHover;
  f.onGround = false;
  f.verticalAccel = 0;
};

test('two identical sticks, next launch: nothing flies before the confirming press, which never fires', () => {
  // This launch, the browser put the left stick in slot 1.
  const right = G.pad({ index: 0, id: G.T16000M_ID, buttons: 16 });
  const left = G.pad({ index: 1, id: G.T16000M_ID, buttons: 16 });
  nav.pads = [right, left];
  S.document.pointerLockElement = el('world');
  app.setConfig({ scenario: 'free', duration: 0 });
  app.start();
  frames(2);
  hoverAt();
  const lever = app.flight.collective;
  // Both sticks report, fully deflected (the proposal reads the slot-0 stick as the left one: its wheel would put the
  // collective lever at the top, and the slot-1 stick's X and Y would roll and pitch). Any new button press would be
  // the confirming one, so none here.
  G.report(right, { axes: { 0: -1, 1: -1, 6: 1, 9: G.HAT_CENTRED } });
  G.report(left, { axes: { 0: 1, 1: 1, 9: G.HAT_CENTRED } });
  const shots = app.stats.shots;
  for (let i = 0; i < 40; i++) {
    G.report(right);
    G.report(left);
    frames(1);
  }
  assert.equal(app.running, true);
  assert.match(toast(), /confirmer gauche et droite\. D’ici là, ils ne pilotent pas\.$/);
  assert.ok(Math.abs(app.flight.angular.x) < 1e-12, 'no pitch before the confirmation');
  assert.ok(Math.abs(app.flight.angular.z) < 1e-12, 'no roll either');
  assert.equal(app.flight.collective, lever, 'the lever holds');
  // The trigger of the stick in slot 1 (the real left one): the roles swap; that press never fires while it is held.
  G.report(left, { press: [0] });
  frames(1);
  assert.match(toast(), /^Manches identifiés : gauche n° 1, droit n° 0\.$/);
  for (let i = 0; i < 60; i++) {
    G.report(right);
    G.report(left);
    frames(1);
  }
  assert.equal(app.stats.shots, shots, 'the confirming press is consumed');
  const j = stored().joystick;
  assert.deepEqual([j.devices.left.slotHint, j.devices.right.slotHint], [1, 0]);
  // Confirmed: the sticks fly (the right one in slot 0 pitches the nose down; the left one's wheel moves the lever).
  G.report(left, { release: [0], axes: { 6: 0.6 } });
  frames(1);
  hoverAt();
  for (let i = 0; i < 40; i++) {
    G.report(right);
    G.report(left);
    frames(1);
  }
  assert.ok(app.flight.angular.x < -0.1, 'the right stick pitches the nose down');
  assert.equal(app.flight.collective, (0.6 - 0.05) / 0.95, 'the lever follows the left wheel');
  G.report(right, { press: [0] });
  frames(60);
  assert.ok(app.stats.shots > shots, 'the triggers fire once confirmed');
  G.report(right, { release: [0] });
  app.pause();
});
