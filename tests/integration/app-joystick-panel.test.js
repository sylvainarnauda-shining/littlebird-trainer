'use strict';
// Joysticks in the mocked-DOM application, with a scripted navigator.getGamepads (fake pads only, never the machine's):
// two identical sticks saved from an earlier launch fly nothing before the confirming press (plan JD2); the panel's
// device controls: « Détecter » on the main vJoy device, on a second model (refused while other controls use the main
// device, else it becomes the main device), on two identical sticks before and after their identification; « Inverser
// gauche et droite »; the « Manette principale » select; « En faire la manette principale ». Frames at 100 Hz through
// the exposed frame(now). One boot (the stored profile of an earlier launch), Math.random seeded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp, fileEvent, PROFILE_KEY } = require('../helpers/mock-dom');
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

// The panel's device controls, with the session paused. A profile file loads a joystick block (and resets the roles).
const PEDALS_ID = 'Pedals (Vendor: 06a3 Product: 0763)';
const loadBlock = async (joystick) => {
  const doc = { version: 1, tuningRevision: 16, settings: {}, bindings: {}, joystick };
  await el('import').onchange(fileEvent(JSON.stringify(doc)));
  assert.match(toast(), /^Profil importé\./);
};
// Every plugged pad sends a report, then one frame (the panel shows the live values every six frames).
const tick = (n = 1) => {
  for (let i = 0; i < n; i++) {
    for (const p of nav.pads) G.report(p);
    frames(1);
  }
};
// « Détecter » on a row, then the given pad's axis moves past half its travel.
const detect = (row, pad, index, value) => {
  el(`joy${row}Learn`).onclick();
  tick(2);
  pad.axes[index] = value;
  tick(1);
  assert.equal(el(`joy${row}Learn`).textContent, 'Détecter', 'the learning ends with the move');
};
const joy = () => stored().joystick;

test('« Détecter »: the main vJoy device; a second model is refused while other controls use the main device', async () => {
  const vjoy = G.pad({ index: 0, id: G.VJOY_ID });
  const pedals = G.pad({ index: 1, id: PEDALS_ID });
  nav.pads = [vjoy, pedals];
  await loadBlock({ schema: 1, axes: { Pitch: { device: 'main', axis: 1 } } });
  // The pedals move while Lacet is being learnt: Tangage reads the main device (the vJoy, chosen automatically), so the
  // main device is not moved to the pedals behind its back.
  detect('Yaw', pedals, 5, 0.9);
  assert.match(
    toast(),
    /^« Pedals » n’est pas la manette principale, qu’utilisent déjà : Tangage\. Rien n’est changé\. Pour la lier, clique sur « En faire la manette principale » sous « Pedals »/,
  );
  assert.deepEqual([joy().devices.main, joy().axes.Yaw.device, joy().axes.Pitch.device], [null, null, 'main']);
  // The vJoy moves: Lacet = its axis 5, on the main device.
  pedals.axes[5] = 0;
  detect('Yaw', vjoy, 5, -0.9);
  assert.equal(toast(), 'Lacet : axe 5 de « vJoy Device » (manette principale).');
  assert.deepEqual([joy().devices.main, joy().axes.Yaw.device, joy().axes.Yaw.axis], [null, 'main', 5]);
  tick(6); // the panel shows the live values every six frames
  assert.match(el('joyYawLive').textContent, /^manette principale, axe 5 : brut −0,900 → /);
  // Nothing else uses the main device: the pedals become it, and the notice says which device they replace.
  await loadBlock({ schema: 1 });
  detect('Yaw', pedals, 5, 0.9);
  assert.equal(
    toast(),
    'Lacet : axe 5 de « Pedals » (manette principale, désormais « Pedals » à la place de « vJoy Device »).',
  );
  assert.deepEqual(
    [joy().devices.main.vendor, joy().devices.main.product, joy().devices.main.slotHint, joy().axes.Yaw.device],
    ['06a3', '0763', 1, 'main'],
  );
  tick(6);
  assert.match(el('joyYawLive').textContent, /^manette principale, axe 5 : brut \+0,900 → /);
});

test('« Manette principale » select and « En faire la manette principale »: every control of the main device follows', () => {
  const [vjoy, pedals] = nav.pads;
  vjoy.axes[5] = -0.9;
  // The select lists « Automatique » and every joystick model seen; the vJoy chosen: Lacet reads its axis 5.
  const sel = el('joyMain');
  assert.deepEqual(
    sel.children.map((o) => o.value),
    ['auto', '06a3:0763', '1234:bead'],
  );
  sel.value = '1234:bead';
  sel.oninput();
  assert.deepEqual([joy().devices.main.product, joy().devices.main.slotHint], ['bead', 0]);
  tick(6);
  assert.match(el('joyYawLive').textContent, /^manette principale, axe 5 : brut −0,900 → /);
  sel.value = 'auto';
  sel.oninput();
  assert.equal(joy().devices.main, null, 'automatic: the vJoy first');
  // The pedals' row: « En faire la manette principale » moves every control of the main device, and says which.
  tick(6);
  const rows = el('joyDevices').children;
  assert.match(rows[1].children[0].textContent, /^n° 1 · Pedals · 06A3:0763 · reçoit/);
  const button = rows[1].children[3];
  assert.equal(button.textContent, 'En faire la manette principale');
  button.onclick();
  assert.equal(toast(), 'Manette principale : Pedals (06A3:0763). Commandes qui la lisent désormais : Lacet.');
  assert.deepEqual(
    [joy().devices.main.product, joy().devices.main.slotHint, joy().axes.Yaw.device],
    ['0763', pedals.index, 'main'],
  );
  tick(6);
  assert.equal(button.hidden, true, 'already the main device');
  assert.equal(rows[0].children[3].hidden, false);
  assert.match(el('joyYawLive').textContent, /^manette principale, axe 5 : brut \+0,900 → /);
  el('joyRead').onclick();
});

test('two identical sticks: « Détecter » waits for their identification, then binds the role that moved; swap', async () => {
  const a = G.pad({ index: 0, id: G.T16000M_ID, buttons: 16 });
  const b = G.pad({ index: 1, id: G.T16000M_ID, buttons: 16 });
  nav.pads = [a, b];
  G.report(a, { axes: { 9: G.HAT_CENTRED } });
  G.report(b, { axes: { 9: G.HAT_CENTRED } });
  await loadBlock({ schema: 1 });
  // Not identified: neither stick can be told apart for good (the first one in the browser's order may change).
  for (const stick of [b, a]) {
    detect('Roll', stick, 0, 1);
    assert.equal(
      toast(),
      'Deux manches identiques : clique d’abord sur « Identifier les manches gauche et droit », puis détecte l’axe.',
    );
    stick.axes[0] = 0;
    assert.equal(joy() ? joy().axes.Roll.device : null, null);
  }
  // Identification: the stick in slot 1 is the left one.
  el('joyIdentify').onclick();
  tick(2);
  G.report(b, { press: [0] });
  frames(1);
  assert.equal(toast(), 'Manches identifiés : gauche n° 1, droit n° 0.');
  G.report(b, { release: [0] });
  tick(1);
  detect('Roll', b, 0, 1);
  assert.equal(toast(), 'Roulis : axe 0 de « T.16000M » (manche gauche).');
  detect('Pitch', a, 1, -1);
  assert.equal(toast(), 'Tangage : axe 1 de « T.16000M » (manche droit).');
  assert.deepEqual(
    [joy().axes.Roll.device, joy().axes.Roll.axis, joy().axes.Pitch.device, joy().axes.Pitch.axis],
    ['left', 0, 'right', 1],
  );
  a.axes[0] = -0.7;
  tick(6);
  assert.match(el('joyRollLive').textContent, /^manche gauche, axe 0 : brut \+1,000 → /);
  // « Inverser gauche et droite »: the roles swap, the saved slots too.
  el('joySwap').onclick();
  assert.equal(toast(), 'Manches gauche et droit inversés.');
  assert.deepEqual([joy().devices.left.slotHint, joy().devices.right.slotHint], [0, 1]);
  tick(6);
  assert.match(el('joyRollLive').textContent, /^manche gauche, axe 0 : brut −0,700 → /);
  el('joyRead').onclick();
});
