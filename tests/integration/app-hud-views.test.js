'use strict';
// Views and HUD of the mocked-DOM application against the game (checks F27 and F28): the reflex sight drawn in the
// cockpit view only (read back from the HUD canvas pixels), the key hints worded and ordered as in the game, AGL
// counting trees and roofs as the game's HUD does, ASL 84 on the helipad, a steady pilot view with no widening at
// speed, and the 3D cockpit with its screen. One boot for the file, Math.random seeded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp } = require('../helpers/mock-dom');
const { seedMathRandom, SEED } = require('../helpers/rng');
const TEXT = require('../helpers/ui-text');

seedMathRandom(SEED + 103);
const { P, M, W, T } = require('../helpers/runtime').modules();
const S = bootApp({ profile: require('../helpers/profiles').revision8(P, M) });
const { app, el } = S;
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const vf = (h) => (2 * Math.atan((Math.tan((h * Math.PI) / 360) * 900) / 1600) * 180) / Math.PI;
const g = el('hud').getContext('2d');
const texts = [];
const fill = g.fillText;
g.fillText = function (t, ...a) {
  texts.push(String(t));
  return fill.call(this, t, ...a);
};

test('F27 the reflex sight is drawn in the cockpit view only (the game draws none in the chase view)', () => {
  app.setConfig({ scenario: 'free', duration: 0 });
  app.start();
  const place = () => {
    app.flight.position.set(0, 80, -300);
    app.flight.velocity.set(0, 0, 0);
    app.flight.quaternion.identity();
  };
  const sightPixels = () => {
    place();
    app.updateCamera();
    app.drawHud();
    const fwd = v(0, 0, -1).applyQuaternion(app.flight.quaternion);
    const p = app.flight.position.clone().addScaledVector(fwd, 600).project(app.camera);
    const x = Math.round((p.x * 0.5 + 0.5) * 1600);
    const y = Math.round((-0.5 * p.y + 0.5) * 900);
    const d = g.getImageData(x - 26, y - 26, 52, 52).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 100 && d[i] > 110 && d[i] < 230 && d[i + 1] > 195 && d[i + 2] < 175 && d[i + 1] > d[i] + 25) n++;
    }
    return n;
  };
  app.setView('cockpit');
  const inCockpit = sightPixels();
  app.setView('chase');
  const inChase = sightPixels();
  assert.ok(inCockpit > 20, 'sight drawn in the cockpit view: ' + inCockpit);
  assert.equal(inChase, 0, 'no sight in the chase view');
});

test('F27 key hints worded and ordered as in the game', () => {
  texts.length = 0;
  app.drawHud();
  const order = TEXT.keyHints.map((t) => texts.indexOf(t));
  assert.ok(
    order.every((i) => i >= 0),
    'every key hint drawn: ' + JSON.stringify(order),
  );
  assert.ok(
    order.every((i, k) => !k || i > order[k - 1]),
    'in the game order',
  );
});

test('F28 AGL counts trees and roofs (about 10 m over a tree top, 13 m or less over the factory roof); 0 AGL and 84 ASL on the helipad', () => {
  const f = app.scenery.forest;
  let k = 0;
  while (!(f.heights[k] > 16 && Math.abs(f.x[k]) < 1500 && Math.abs(f.z[k] + 900) < 1500 && f.species[k] === 0)) k++;
  app.flight.position.set(f.x[k], f.y[k] + f.heights[k] + 11.25, f.z[k]);
  app.drawHud();
  const overTree = +el('altitude').textContent;
  assert.ok(Math.abs(overTree - 10) <= 1.5, 'AGL above the tree top: ' + overTree + ' m');
  const hall = W.BUILDINGS.find((b) => b.id === 'hall');
  app.flight.position.set(hall.x, W.factoryLevel + hall.h + hall.roof + 13.25, hall.z + 10);
  app.drawHud();
  assert.ok(+el('altitude').textContent <= 13, 'AGL above the factory roof');
  app.flight.position.set(W.PAD.x, 1.25, W.PAD.z);
  texts.length = 0;
  app.drawHud();
  assert.equal(+el('altitude').textContent, 0, 'AGL 0 on the helipad');
  assert.ok(texts.includes('84'), 'ASL 84 on the helipad');
});

test('the 3D cockpit (second render pass) is built with its screen', () => {
  assert.ok(app.cockpit && app.cockpit.group.children.length > 20, '3D cockpit built');
  assert.ok(app.cockpit.mfd && typeof app.cockpit.mfd.update === 'function', 'cockpit screen');
});

test('F27 the pilot view does not shake and does not widen at 250 km/h: the set horizontal angle', () => {
  app.setConfig({ scenario: 'free', duration: 0 });
  app.start();
  app.setView('cockpit');
  const eyes = [];
  for (let i = 0; i < 8; i++) {
    app.flight.position.set(0, 90, -400);
    app.flight.velocity.set(0, 0, -70);
    app.flight.quaternion.identity();
    app.step(1 / 120);
    app.updateCamera(1 / 60);
    eyes.push(app.camera.position.clone().sub(app.flight.position));
  }
  assert.ok(
    eyes.every((e) => e.distanceTo(eyes[0]) < 1e-9),
    'the pilot view does not shake',
  );
  assert.equal(app.cfg.fovCockpit, P.defaults.fovCockpit);
  assert.ok(Math.abs(app.camera.fov - vf(app.cfg.fovCockpit)) < 1e-6, 'no widening at 250 km/h');
  assert.equal(app.cfg.cameraMotion ?? 0, 0);
  assert.equal(app.cfg.speedFov ?? 0, 0);
});
