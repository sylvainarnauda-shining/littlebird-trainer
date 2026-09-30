'use strict';
// Mouse, camera and frame pacing through the mocked-DOM application's own handlers, frames driven at exactly 100 Hz by
// the test (window.__LB_MANUAL_CLOCK__ and the exposed frame(now)): the measured rate law (check F34: steady rate
// = K x cursor speed, the nose stops after the mouse), the v12 virtual stick when chosen, mouse + keys capped at the key
// rate; the yaw from hover in the chase view as rendered and the HUD heading tape (check F17); render interpolation
// (check F36: per-frame displacement variation of the view and of a moving target under 2 %, physics positions
// restored, the physics unchanged by rendering). One boot, Math.random seeded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp } = require('../helpers/mock-dom');
const { seedMathRandom, SEED } = require('../helpers/rng');
const TEXT = require('../helpers/ui-text');
const PROFILES = require('../helpers/profiles');

seedMathRandom(SEED + 107);
const { P, M, T } = require('../helpers/runtime').modules();
const S = bootApp({ profile: PROFILES.revision13(P, M), manualClock: true });
const { app, diag, el, keyDown, keyUp, move, hooks } = S;
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const DEG = Math.PI / 180;
let clock = 1000;
const frame = () => {
  clock += 10;
  app.frame(clock);
}; // 100 Hz
const stats = (a) => {
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  const sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
  return { mean: m, cv: sd / m };
};
const hoverAt = (y = 400, x = 0, z = -300) => {
  const f = app.flight;
  f.position.set(x, y, z);
  f.velocity.set(0, 0, 0);
  f.quaternion.identity();
  f.angular.set(0, 0, 0);
  f.cyclic.set(0, 0, 0);
  f.mouseRate.set(0, 0, 0);
  f.collective = app.cfg.leverHover;
  f.onGround = false;
  f.verticalAccel = 0;
  app.frame((clock += 10));
};
// px down per 10 ms frame for `frames` frames, then `rest` frames still; keys held during the movement.
function sweep(px, frames, rest, keys = []) {
  const q = [];
  for (const k of keys) keyDown(k);
  for (let i = 0; i < frames + rest; i++) {
    if (i < frames) move(0, px);
    if (i === frames) for (const k of keys) keyUp(k);
    frame();
    q.push(app.flight.angular.x / DEG);
  }
  return q;
}

test('free flight with the pointer captured (emulated): the measured rate law, not the compatibility mode', () => {
  S.document.pointerLockElement = el('world');
  app.setConfig({ scenario: 'free', duration: 0 });
  app.start();
  assert.equal(diag().compatInput, false);
  frame();
  hoverAt();
});

test('F34 rate law through the app handlers: 500 px/s gives K x 500 within 3 %, inverted Y noses up, the nose stops < 1.5 s after the mouse', () => {
  hoverAt();
  const q = sweep(5, 200, 250);
  const c = app.cfg;
  const K = (c.mouseRateScale * c.pitchSens * c.vehicleMultiplier) / 100;
  const expect = K * 500;
  const steady = q[199];
  assert.ok(expect < 52, 'the test speed stays under the 52 deg/s key rate');
  let stop = null;
  for (let i = 200; i < q.length; i++) {
    if (Math.abs(q[i]) < 1) {
      stop = (i - 199) * 0.01;
      break;
    }
  }
  assert.ok(
    Math.abs(steady - expect) / expect < 0.03,
    'steady pitch rate = K x 500 px/s: ' + steady.toFixed(2) + ' vs ' + expect.toFixed(2),
  );
  assert.ok(steady > 0, 'inverted Y: mouse down = nose up');
  assert.ok(stop !== null && stop < 1.5, 'the nose stops within 1.5 s of the mouse: ' + stop);
});

test('F34 the v12 virtual stick chosen in the controls saturates toward the 52 deg/s key rate and keeps turning', () => {
  const sel = el('mouseLaw');
  sel.value = 'stick';
  sel.oninput();
  assert.equal(app.cfg.mouseLaw, 'stick');
  assert.match(el('toast').textContent, TEXT.stickChosen);
  hoverAt();
  const q = sweep(5, 200, 150);
  assert.ok(Math.max(...q) > 48, 'v12 stick saturates toward the 52 deg/s key rate: ' + Math.max(...q).toFixed(1));
  assert.ok(q[299] > 10, 'v12 stick: still turning 1 s after the mouse stops: ' + q[299].toFixed(1));
  sel.value = 'rate';
  sel.oninput();
  assert.equal(app.cfg.mouseLaw, 'rate');
});

test('F34 mouse + key capped at the key rate (52 deg/s)', () => {
  hoverAt();
  const q = sweep(30, 150, 0, ['KeyS']);
  keyUp('KeyS');
  assert.ok(Math.max(...q) <= 52 + 1e-6, 'S + fast mouse: ' + Math.max(...q));
});

test('F17 yaw from hover in the chase view as rendered at 100 Hz: 7.5 +- 1.5 deg at 0.73 s, 31.6 +- 2.5 at 1.47 s; the tape follows the camera', () => {
  app.setView('chase');
  hoverAt();
  app.updateCamera();
  for (let i = 0; i < 20; i++) frame();
  const camH = () => {
    const f = v(0, 0, -1).applyQuaternion(app.camera.quaternion);
    return (((Math.atan2(f.x, -f.z) / DEG) % 360) + 360) % 360;
  };
  const h0 = camH();
  const a0 = app.flight.attitude().heading;
  const out = {};
  keyDown('KeyD');
  for (let i = 1; i <= 147; i++) {
    frame();
    const t = i / 100;
    if (i === 73 || i === 147) {
      let d = camH() - h0;
      let da = app.flight.attitude().heading - a0;
      if (d < -180) d += 360;
      if (da < -180) da += 360;
      const tape = app.tapeHeading();
      out[t] = { chase: d, airframe: da, tapeMinusCamera: ((tape - camH() + 540) % 360) - 180 };
    }
  }
  keyUp('KeyD');
  // A frame shows the state up to 1/120 s earlier (render interpolation): ~0.3 deg below the physics-level figure.
  assert.ok(Math.abs(out[0.73].chase - 7.5) <= 1.5, '0.73 s: ' + out[0.73].chase);
  assert.ok(Math.abs(out[1.47].chase - 31.6) <= 2.5, '1.47 s: ' + out[1.47].chase);
  assert.ok(
    Math.abs(out[0.73].tapeMinusCamera) < 1e-6 && Math.abs(out[1.47].tapeMinusCamera) < 1e-6,
    'chase view: the tape follows the camera',
  );
  assert.ok(out[0.73].airframe - out[0.73].chase > 4, 'the airframe leads the chase tape during the yaw');
  app.setView('cockpit');
  frame();
  assert.ok(
    Math.abs(app.tapeHeading() - app.flight.attitude().heading) < 1e-9,
    'pilot view: the tape is the airframe heading',
  );
});

test('F36 render interpolation at 100 Hz and constant speed: per-frame displacement variation < 2 % for the view and the helicopter', () => {
  const runView = (viewName, n = 300) => {
    app.setView(viewName);
    const f = app.flight;
    const s = 235 / 3.6;
    f.position.set(0, 600, -200);
    f.velocity.set(0, 0, -s);
    f.quaternion.setFromEuler(new T.Euler(-8.2 * DEG, 0, 0, 'YXZ'));
    f.angular.set(0, 0, 0);
    f.cyclic.set(0, 0, 0);
    f.collective = 0.5;
    f.onGround = false;
    for (let i = 0; i < 30; i++) frame();
    const cam = [];
    const grp = [];
    const raw = [];
    const pc = app.camera.position.clone();
    const pg = app.own.group.position.clone();
    const pr = f.position.clone();
    for (let i = 0; i < n; i++) {
      frame();
      cam.push(app.camera.position.distanceTo(pc));
      grp.push(app.own.group.position.distanceTo(pg));
      raw.push(f.position.distanceTo(pr));
      pc.copy(app.camera.position);
      pg.copy(app.own.group.position);
      pr.copy(f.position);
    }
    return { camera: stats(cam), helicopter: stats(grp), raw: stats(raw) };
  };
  const ck = runView('cockpit');
  const ch = runView('chase');
  assert.ok(ck.raw.cv > 0.3, 'raw 1/120 s states at 100 Hz judder (1,1,1,1,2 steps): ' + ck.raw.cv.toFixed(3));
  for (const x of [ck.camera, ck.helicopter, ch.camera, ch.helicopter])
    assert.ok(x.cv < 0.02, 'per-frame displacement variation < 2 %: ' + x.cv);
});

test('F36 a circling target is drawn smoothly between its steps; its physics position is restored after the frame', () => {
  app.setConfig({ scenario: 'air', trajectory: 'circle', targetCount: 1, duration: 0, indestructible: true });
  app.start();
  app.setView('cockpit');
  for (let i = 0; i < 30; i++) frame();
  const t = app.targets.find((q) => q.air && q.active);
  const drawn = [];
  const phys = [];
  let seen = null;
  hooks.render = () => {
    seen = t.group.position.clone();
  };
  try {
    for (let i = 0; i < 301; i++) {
      frame();
      drawn.push(seen.clone());
      phys.push(t.group.position.clone());
    }
  } finally {
    hooks.render = null;
  }
  const step = (a) => a.slice(1).map((p, i) => p.distanceTo(a[i]));
  const d = stats(step(drawn));
  const r = stats(step(phys));
  assert.ok(
    r.cv > 0.3 && d.cv < 0.02,
    'circling target drawn smoothly: ' + d.cv.toFixed(4) + ' (raw ' + r.cv.toFixed(3) + ')',
  );
  assert.ok(t.group.position.distanceTo(phys[phys.length - 1]) < 1e-12, 'physics position restored after the frame');
});

test('the physics is unchanged by rendering: the app steps equal a Flight stepped alone with the same inputs', () => {
  app.setView('cockpit');
  const f = app.flight;
  f.position.set(0, 600, -200);
  f.velocity.set(3, 1, -40);
  f.quaternion.setFromEuler(new T.Euler(-0.1, 0.3, 0.05, 'YXZ'));
  f.angular.set(0.02, 0.01, 0);
  f.cyclic.set(0, 0, 0);
  f.mouseRate.set(0, 0, 0);
  f.collective = 0.2;
  f.verticalAccel = 0;
  f.onGround = false;
  const ref = new P.Flight(app.cfg);
  ref.reset();
  for (const k of ['position', 'velocity', 'quaternion', 'angular', 'cyclic', 'mouseRate']) ref[k].copy(f[k]);
  ref.collective = f.collective;
  ref.verticalAccel = 0;
  ref.onGround = false;
  let steps = 0;
  keyDown('KeyA');
  for (let i = 0; i < 150; i++) {
    const before = f.time;
    frame();
    steps += Math.round((f.time - before) * 120);
  }
  keyUp('KeyA');
  for (let i = 0; i < steps; i++)
    ref.step(1 / 120, { pitch: 0, yaw: 1, roll: 0, collective: 0, mousePitchRate: 0, mouseYawRate: 0 });
  const d = Math.max(
    f.position.distanceTo(ref.position),
    f.velocity.distanceTo(ref.velocity),
    Math.abs(f.quaternion.angleTo(ref.quaternion)),
  );
  assert.ok(d < 1e-9, 'physics unchanged by rendering: ' + d);
});
