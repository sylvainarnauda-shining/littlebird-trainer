'use strict';
// Helicopter and vehicle hit volumes (models.js geometry swept by physics.js sweptMesh): the silhouette is hit where
// the airframe is and missed beside it, at the measured tail, rotated and moving; the hull health defaults.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');
const { source } = require('../helpers/app-source');

const T = load('vendor/three.min.js');
const P = load('physics.js');
const Models = load('models.js').create(T);
const v = (x, y, z) => new T.Vector3(x, y, z);

test('helicopter silhouette: cockpit, boom and T-tail at the measured tail are hit; air beside and above is missed', () => {
  const heli = Models.helicopter().group;
  heli.updateMatrixWorld(true);
  const shoot = (a, b) => P.sweptMesh(a, b, heli.position.clone(), heli, 6.5);
  assert.ok(shoot(v(0, 0.5, -10), v(0, 0.5, 10)), 'cockpit hit');
  assert.equal(shoot(v(2, 0, -10), v(2, 0, 10)), null, 'air beside the fuselage must miss');
  assert.equal(shoot(v(0, 3, -10), v(0, 3, 10)), null, 'air above the rotor must miss');
  assert.ok(shoot(v(-8, 0.7, 4.2), v(8, 0.7, 4.2)), 'tail boom can be hit');
  assert.ok(shoot(v(-8, 1.72, 5.72), v(8, 1.72, 5.72)), 'T-tail stabiliser can be hit');
  assert.equal(shoot(v(-8, 2.02, 5.72), v(8, 2.02, 5.72)), null, "nothing at the earlier model's stabiliser height");
  assert.ok(shoot(v(0, 0.5, -800), v(0, 0.5, 800)), 'a fast round cannot tunnel through the fuselage');
  heli.rotation.y = Math.PI / 2;
  heli.updateMatrixWorld(true);
  assert.ok(shoot(v(-10, 0.5, 0), v(10, 0.5, 0)), 'rotated body hit');
  assert.equal(shoot(v(-10, 0, 2), v(10, 0, 2)), null, 'rotated empty space miss');
  heli.rotation.y = 0;
  heli.position.x = 10;
  heli.updateMatrixWorld(true);
  assert.ok(
    P.sweptMesh(v(0, 0.5, -10), v(0, 0.5, 10), v(-10, 0, 0), heli, 6.5),
    'a moving target crosses the projectile',
  );
});

test('helicopter model: skids at -1.25 m, rotor radius 4.2 m, tail rotor tip 6.1 m behind; few draw calls', () => {
  const model = Models.helicopter();
  const box = new T.Box3().setFromObject(Models.helicopter().group);
  assert.ok(Math.abs(box.min.y + 1.25) < 0.03, 'skids at -1.25 m: ' + box.min.y.toFixed(3));
  assert.ok(box.max.x < 4.4 && box.max.z < 6.2, 'rotor radius 4.2 m, tail rotor tip 6.1 m behind the centre');
  let meshes = 0;
  model.group.traverse((o) => {
    if (o.isMesh) meshes++;
  });
  assert.ok(meshes < 40, 'few draw calls per helicopter: ' + meshes);
  assert.ok(model.rotor.children.length >= 7);
});

test('vehicle silhouette: the cabin is hit, the space outside is missed; target health defaults', () => {
  const car = Models.vehicle('truck').group;
  car.updateMatrixWorld(true);
  assert.ok(P.sweptMesh(v(0, 1, -8), v(0, 1, 8), v(0, 0, 0), car, 4), 'vehicle cabin hit');
  assert.equal(P.sweptMesh(v(2, 1, -8), v(2, 1, 8), v(0, 0, 0), car, 4), null, 'outside the vehicle silhouette: miss');
  assert.equal(P.defaults.airHealth, 120);
  assert.equal(P.defaults.groundHealth, 180);
  assert.ok(
    !source.includes('health:14') && !source.includes('health/14') && !source.includes('health=14'),
    'no hard-coded target health left in app.js',
  );
});
