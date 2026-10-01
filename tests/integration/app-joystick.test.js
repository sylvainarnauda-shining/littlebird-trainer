'use strict';
// Joysticks (J1) in the mocked-DOM application, with a scripted navigator.getGamepads (fake pads only, never the
// machine's): nothing is read before the player asks (HOTAS off, menu, flight); the panel's read button and its stop;
// the profile block stored and exported only when it differs from the defaults; the import of a game settings file
// (synthetic) with its preview; flight with a vJoy device: controls held until it reports, full deflection = the key
// (bit for bit), a centred stick = no stick (bit for bit), the collective lever, the gun and the view on its buttons,
// latched buttons on resume, the pause when the device is unplugged; two identical sticks identified by one press;
// a page policy that refuses the Gamepad API. Frames at 100 Hz through the exposed frame(now). One boot, Math.random
// seeded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bootApp, fileEvent, PROFILE_KEY } = require('../helpers/mock-dom');
const { seedMathRandom, SEED } = require('../helpers/rng');
const { FIXTURES } = require('../helpers/paths');
const G = require('../helpers/gamepads');

seedMathRandom(SEED + 121);
const nav = G.fakeNavigator([]);
const S = bootApp({ manualClock: true, navigator: nav });
const { app, el, keyDown, keyUp } = S;
const toast = () => el('toast').textContent;
const stored = () => JSON.parse(S.stored.get(PROFILE_KEY) || 'null');
let clock = 1000;
const frames = (n = 1) => {
  for (let i = 0; i < n; i++) app.frame((clock += 10));
};
const input = (id, value) => {
  const e = el(id);
  if (e.type === 'checkbox') e.checked = value;
  else e.value = String(value);
  e.oninput();
};
const vjoy = G.pad({ index: 0, id: G.VJOY_ID });
const DEG = Math.PI / 180;
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
const state = () => {
  const f = app.flight;
  return [f.position.toArray(), f.quaternion.toArray(), f.angular.toArray(), f.collective];
};

test('nothing reads the joysticks by default: menu, session with the HOTAS off; nothing stored for them', () => {
  nav.pads = [vjoy];
  frames(20);
  assert.equal(el('joyUseHotas').checked, false);
  assert.equal(el('joyStatus').textContent, 'Lecture arrêtée.');
  S.document.pointerLockElement = el('world');
  app.setConfig({ scenario: 'free', duration: 0 });
  app.start();
  frames(60);
  app.pause();
  assert.equal(nav.calls, 0, 'getGamepads never called');
  assert.equal('joystick' in stored(), false);
});

test("the panel's read button reads until another tab, a blur or a session; the devices it sees", () => {
  el('joyRead').onclick();
  frames(12);
  assert.ok(nav.calls >= 12, 'one read per frame');
  assert.match(el('joyStatus').textContent, /1 manette/);
  const row = el('joyDevices').children[0];
  assert.match(
    row.children[0].textContent,
    /vJoy Device · 1234:BEAD · virtuelle \(vJoy\) · manette principale · pas encore de signal/,
  );
  G.report(vjoy, { axes: { 1: 0.5 }, press: [2] });
  frames(6);
  assert.match(row.children[0].textContent, /reçoit/);
  assert.match(row.children[1].textContent, /^Axes : 0 0,00 · 1 \+0,50/);
  assert.match(row.children[2].textContent, /: 2$/);
  let calls = nav.calls;
  S.windowCallbacks.blur();
  frames(5);
  assert.equal(nav.calls, calls, 'a blur stops the reading');
  el('joyRead').onclick();
  frames(2);
  calls = nav.calls;
  S.callbacks.visibilitychange();
  el('joyRead').onclick();
  el('joyRead').onclick();
  frames(2);
  assert.ok(nav.calls > calls);
  calls = nav.calls;
  el('joyRead').onclick();
  frames(5);
  assert.equal(nav.calls, calls, 'the button stops it');
});

test('HOTAS switch: the joystick block is stored and exported only while it differs from the defaults', async () => {
  input('joyUseHotas', true);
  assert.equal(stored().joystick.useHotas, true);
  assert.equal(stored().joystick.schema, 1);
  el('export').onclick();
  const exported = JSON.parse(await S.hooks.blob.text());
  assert.deepEqual(Object.keys(exported), ['format', 'version', 'tuningRevision', 'settings', 'bindings', 'joystick']);
  input('joyUseHotas', false);
  assert.equal('joystick' in stored(), false, 'back to the defaults: no block');
  el('export').onclick();
  assert.deepEqual(Object.keys(JSON.parse(await S.hooks.blob.text())), [
    'format',
    'version',
    'tuningRevision',
    'settings',
    'bindings',
  ]);
  // A profile file with an unreadable block: the rest loads, the block falls back to its defaults, with a notice.
  const doc = { version: 1, tuningRevision: 16, settings: { pitchSens: 61 }, bindings: {}, joystick: { schema: 7 } };
  await el('import').onchange(fileEvent(JSON.stringify(doc)));
  assert.equal(app.cfg.pitchSens, 61);
  assert.match(toast(), /^Profil importé\. Configuration joystick d’une version inconnue/);
  assert.equal('joystick' in stored(), false);
});

test('import of the game joystick section: a preview, then the profile mirrors the file', async () => {
  const text = fs.readFileSync(path.join(FIXTURES, 'synthetic', 'joystick-settings.sample.txt'), 'utf8');
  await el('importJoystick').onchange(fileEvent(text));
  const box = el('joyPreview');
  assert.equal(box.hidden, false);
  const lines = box.children.map((c) => c.textContent).join('\n');
  assert.match(lines, /HOTAS dans le jeu : activé/);
  assert.match(lines, /Tangage : vJoy Device \(1234:BEAD\), axe 1, sensibilité 0,8, zone morte 0,1\./);
  assert.match(lines, /Lacet : vJoy Device \(1234:BEAD\), axe 5, inversé/);
  assert.match(lines, /Regard libre horizontal : aucun axe, .*sens \+ : chapeau 0 droite de vJoy Device/);
  assert.match(lines, /Tirer aux miniguns = bouton 3/);
  assert.match(lines, /sans équivalent dans l’entraîneur, ignorées : Horn\./);
  assert.match(lines, /lus par leur position/);
  assert.equal(app.cfg.pitchSens, 61, 'the preview changes nothing');
  const buttons = box.children[box.children.length - 1].children;
  buttons[0].onclick();
  assert.equal(box.hidden, true);
  assert.match(toast(), /appliquée : HOTAS activé, 4 axes et 3 boutons liés/);
  const j = stored().joystick;
  assert.deepEqual(
    [j.useHotas, j.devices.main.product, j.axes.Pitch.device, j.axes.Pitch.axis],
    [true, 'bead', 'main', 1],
  );
  assert.equal(el('joyPitchAxis').value, '1');
  assert.equal(el('joyPitchDevice').value, 'main');
  // A file without a joystick section is refused with a reason.
  await el('importJoystick').onchange(fileEvent('[x]\ny=1\n'));
  assert.match(toast(), /^Import refusé : aucune configuration joystick/);
});

test('flight with the vJoy device: held until it reports, full deflection = the key, centred stick = no stick', () => {
  // Pitch at gain 1 and no collective axis for the comparisons with the keys.
  input('joyPitchSens', 1);
  input('joyThrottleDevice', '');
  // The device connects during the session (zero-initialised: Chromium shows zeros until its first report).
  nav.pads = [];
  S.document.pointerLockElement = el('world');
  app.setConfig({ scenario: 'free', duration: 0 });
  app.start();
  frames(2);
  vjoy.axes.fill(0);
  vjoy.buttons.forEach((b, i) => (vjoy.buttons[i] = { pressed: false }));
  nav.pads = [vjoy];
  hoverAt();
  // Full back deflection before the device has reported: held, nothing moves the nose.
  vjoy.axes[1] = 1;
  frames(30);
  assert.ok(Math.abs(app.flight.angular.x) < 1e-12, 'held until the first report');
  // G-J3: full deflection flies exactly as the pitch key.
  G.report(vjoy);
  frames(1);
  hoverAt();
  frames(80);
  const stick = state();
  vjoy.axes[1] = 0;
  G.report(vjoy);
  frames(1);
  hoverAt();
  keyDown(app.bindings.pitchUp);
  frames(80);
  keyUp(app.bindings.pitchUp);
  assert.deepEqual(state(), stick, 'stick = key, bit for bit');
  assert.ok(app.flight.angular.x / DEG > 20, 'the nose rises');
  // G-J2: sticks resting inside the dead zone with the HOTAS on = the keys alone with the HOTAS off.
  const script = () => {
    hoverAt();
    for (let i = 0; i < 120; i++) {
      if (i === 10) keyDown(app.bindings.rollLeft);
      if (i === 40) keyUp(app.bindings.rollLeft);
      if (i === 50) keyDown(app.bindings.yawRight);
      if (i === 90) keyUp(app.bindings.yawRight);
      frames(1);
    }
    return state();
  };
  G.report(vjoy, { axes: { 0: 0.03, 1: -0.04, 5: 0.02 } });
  frames(1);
  const resting = script();
  input('joyUseHotas', false);
  const keys = script();
  assert.deepEqual(resting, keys);
  input('joyUseHotas', true);
});

test('collective axis = lever position; gun and view on buttons; latched buttons on resume; unplugged = pause', () => {
  input('joyThrottleDevice', 'main');
  input('joyThrottleAxis', 2);
  G.report(vjoy, { axes: { 2: 0.5 } });
  frames(3);
  assert.equal(app.flight.collective, (0.5 - 0.05) / 0.95, 'the lever follows the axis');
  keyDown(app.bindings.collectiveUp);
  frames(10);
  keyUp(app.bindings.collectiveUp);
  assert.equal(app.flight.collective, (0.5 - 0.05) / 0.95, 'the keys do not move a bound lever');
  // Fire (button 3) and the view (button 5) as their keys.
  const shots = app.stats.shots;
  G.report(vjoy, { press: [3] });
  frames(60);
  assert.ok(app.stats.shots > shots, 'the gun fires');
  G.report(vjoy, { release: [3], press: [5] });
  frames(2);
  assert.equal(app.view, 'chase');
  G.report(vjoy, { release: [5] });
  frames(2);
  // A trigger still held across a pause and resume is ignored until released.
  G.report(vjoy, { press: [3] });
  frames(2);
  app.pause();
  app.resume();
  const before = app.stats.shots;
  frames(60);
  assert.equal(app.stats.shots, before, 'latched on resume');
  G.report(vjoy, { release: [3] });
  frames(2);
  G.report(vjoy, { press: [3] });
  frames(60);
  assert.ok(app.stats.shots > before);
  G.report(vjoy, { release: [3] });
  // Unplugged in flight: the session pauses with a notice.
  nav.pads = [];
  frames(2);
  assert.equal(app.running, false);
  assert.match(toast(), /^Manette principale débranchée : session en pause/);
});

test('two identical sticks without vJoy: one trigger press in the panel identifies them; the roles drive the axes', () => {
  const a = G.pad({ index: 0, id: G.T16000M_ID, buttons: 16 });
  const b = G.pad({ index: 1, id: G.T16000M_ID, buttons: 16 });
  nav.pads = [a, b];
  el('joyIdentify').onclick();
  frames(2);
  assert.match(el('joyStatus').textContent, /gâchette du manche GAUCHE/);
  G.report(b, { press: [0], axes: { 9: G.HAT_CENTRED } });
  G.report(a, { axes: { 9: G.HAT_CENTRED } });
  frames(2);
  assert.match(toast(), /Manches identifiés : gauche n° 1, droit n° 0/);
  const j = stored().joystick;
  assert.deepEqual([j.devices.left.product, j.devices.left.slotHint, j.devices.right.slotHint], ['b10a', 1, 0]);
  input('joyRollDevice', 'left');
  input('joyRollAxis', 0);
  frames(1);
  G.report(b, { axes: { 0: 1 } });
  G.report(a, { axes: { 0: -1 } });
  frames(6);
  // The imported roll sensitivity 0.6: full deflection gives 0.6 (B0, supposed: a gain, then the clamp).
  assert.match(el('joyRollLive').textContent, /^manche gauche, axe 0 : brut \+1,000 → \+0,60$/);
  el('joyRead').onclick();
});

test('a page policy that refuses the Gamepad API: no read, a plain notice, no error', () => {
  const saved = nav.getGamepads;
  nav.getGamepads = () => {
    throw Object.assign(new Error('blocked'), { name: 'SecurityError' });
  };
  el('joyRead').onclick();
  frames(3);
  assert.match(el('joyStatus').textContent, /^Lecture refusée par la politique de la page/);
  el('joyRead').onclick();
  nav.getGamepads = saved;
});
