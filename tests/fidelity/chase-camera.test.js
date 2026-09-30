'use strict';
// Check F35: the chase view widening with speed against the game's (measured on the reference recordings, M14):
// 85 deg up to 140 km/h, 109 +- 0.05 deg at 250 km/h (game 106.9-111.0 above 185 km/h), camera distance x1.11, the
// camera/tape rotation ratio within 0.05 of the game's median in eight speed bands, the stabiliser span ratio fast/hover
// 0.51-0.58, stabiliser spans and the hub row within the measured tolerances, 0.5 s smoothing; the pilot view stays at
// 85 deg and the option off keeps 85 deg. Mocked-DOM application, frames at 100 Hz, Math.random seeded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp } = require('../helpers/mock-dom');
const { seedMathRandom, SEED } = require('../helpers/rng');
const PROFILES = require('../helpers/profiles');

seedMathRandom(SEED + 108);
const { P, M, T } = require('../helpers/runtime').modules();
const S = bootApp({ profile: PROFILES.revision13(P, M), manualClock: true });
const { app, diag, el } = S;
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const DEG = Math.PI / 180;
let clock = 1000;
const frame = () => {
  clock += 10;
  app.frame(clock);
};
const vf = (h) => (2 * Math.atan((Math.tan((h * Math.PI) / 360) * 900) / 1600) * 180) / Math.PI;
// measured: the game's median camera/tape rotation ratio per speed band (km/h, band centres), n = 93-674 per band.
const GAME_RATIO = {
  147.5: 0.941,
  162.5: 0.788,
  177.5: 0.737,
  192.5: 0.679,
  207.5: 0.656,
  222.5: 0.651,
  245: 0.667,
  280: 0.63,
};

function cruise(kmh, pitchDeg) {
  const f = app.flight;
  const s = kmh / 3.6;
  f.position.set(0, 500, -300);
  f.velocity.set(0, 0, -s);
  f.quaternion.setFromEuler(new T.Euler(pitchDeg * DEG, 0, 0, 'YXZ'));
  f.angular.set(0, 0, 0);
  f.cyclic.set(0, 0, 0);
  f.mouseRate.set(0, 0, 0);
  f.onGround = false;
  f.verticalAccel = 0;
}
function holdCruise(kmh, pitchDeg, n) {
  for (let i = 0; i < n; i++) {
    cruise(kmh, pitchDeg);
    frame();
  }
}
// Stabiliser tips and hub projected at 1080p (the game's measurements).
function screen() {
  const pts = app.own.group.userData.points;
  const g = app.own.group;
  g.updateMatrixWorld(true);
  const pr = (p) => {
    const q = v(...p)
      .applyMatrix4(g.matrixWorld)
      .project(app.camera);
    return { x: (q.x * 0.5 + 0.5) * 1600 * 1.2, y: (-0.5 * q.y + 0.5) * 900 * 1.2 };
  };
  const L = pr(pts.stabL);
  const R = pr(pts.stabR);
  const hub = pr(pts.hub);
  return {
    span: Math.hypot(L.x - R.x, L.y - R.y),
    hubRow: hub.y,
    distance: app.camera.position.distanceTo(g.position),
  };
}

S.document.pointerLockElement = el('world');
app.setConfig({ scenario: 'free', duration: 0 });
app.start();
frame();

test('F35 chase view: 85 deg to 140 km/h, 109 at 250 km/h, distance x1.11, span ratio 0.51-0.58, spans and hub row, 0.5 s smoothing', () => {
  app.setView('chase');
  holdCruise(0, 0, 60);
  const hov = { fov: diag().camera.fovHorizontal, ...screen() };
  holdCruise(100, -3, 300);
  const at100 = diag().camera.fovHorizontal;
  holdCruise(250, -9, 400);
  const fast = { fov: diag().camera.fovHorizontal, ...screen() };
  assert.ok(Math.abs(app.camera.fov - vf(diag().camera.fovHorizontal)) < 1e-9, 'projection uses the widened field');
  app.setView('cockpit');
  holdCruise(250, -9, 20);
  const cock = diag().camera.fovHorizontal;
  const cockV = app.camera.fov;
  app.setView('chase');
  app.setConfig({ chaseSpeedView: false });
  holdCruise(250, -9, 5);
  const off = diag().camera.fovHorizontal;
  app.setConfig({ chaseSpeedView: true });
  // Ease-in: 0.5 s after reaching speed (zoom time constant 0.5 s, assumed) the ramp is at 63 %.
  app.setView('chase');
  holdCruise(0, 0, 300);
  holdCruise(250, -9, 50);
  const half = app.chaseZoom;
  assert.equal(hov.fov, 85);
  assert.equal(at100, 85, '85 deg up to 140 km/h');
  assert.ok(Math.abs(fast.fov - 109) < 0.05, '109 deg at 250 km/h (game 106.9-111.0 above 185 km/h): ' + fast.fov);
  assert.ok(
    Math.abs(fast.distance / hov.distance - 1.11) < 0.01,
    'camera offset x1.11: ' + (fast.distance / hov.distance).toFixed(3),
  );
  const ratio = fast.span / hov.span;
  assert.ok(ratio >= 0.51 && ratio <= 0.58, 'stabiliser fast/hover size 0.51-0.58 as measured: ' + ratio.toFixed(3));
  assert.equal(cock, 85);
  assert.ok(Math.abs(cockV - vf(85)) < 1e-9, 'pilot view stays at 85 deg');
  assert.equal(off, 85, 'option off: 85 deg');
  assert.ok(Math.abs(half - (1 - Math.exp(-1))) < 0.02, '0.5 s smoothing: ' + half);
  // Tolerances: stabiliser span within 10 % of the game (hover 208-232 px, >= 183 km/h 110-135 px at 1080p), hub row
  // within 15 px of the game's 545-600 px band.
  assert.ok(hov.span >= 208 * 0.9 && hov.span <= 232 * 1.1, 'hover stabiliser span ' + hov.span);
  assert.ok(fast.span >= 110 * 0.9 && fast.span <= 135 * 1.1, 'fast stabiliser span ' + fast.span);
  for (const h of [hov, fast]) assert.ok(h.hubRow >= 530 && h.hubRow <= 615, 'hub row ' + h.hubRow);
});

test('F35 camera/tape rotation ratio within 0.05 of the game median in each of the eight speed bands', () => {
  app.setView('chase');
  for (const [kmh, g] of Object.entries(GAME_RATIO)) {
    holdCruise(+kmh, -8, 300);
    const r = Math.tan(42.5 * DEG) / Math.tan((diag().camera.fovHorizontal * DEG) / 2);
    assert.ok(Math.abs(r - g) <= 0.05, `${kmh} km/h: ratio ${r.toFixed(3)} vs game ${g}`);
  }
});
