'use strict';
// The reference valley against the two recordings (checks F24 and F25): relief, slopes, forest structure (tree heights,
// densities, canopy), AGL over the trees as the game's HUD counts it, structures and the three towers. The real scenery
// is built in high quality. Sample points come from one LCG (seed 12345) drawn in the previous test suite's order.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');
const { canvas } = require('../helpers/canvas');

const T = load('vendor/three.min.js');
const P = load('physics.js');
const W = load('world.js');
const build = load('scenery.js');
const pct = (a, p) => {
  const s = Float64Array.from(a).sort();
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
let seed = 12345;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

let s = null;
let f = null;

test('Node and the tests get the reference valley', () => {
  assert.equal(W.id, 'vallee');
});

test('F24 helipad flat at 84 m ASL; valley floor between -10 and 135 m ASL; slopes like the recordings', () => {
  for (let r = 0; r <= 50; r += 5) {
    for (let a = 0; a < 6.3; a += 0.7)
      assert.ok(Math.abs(W.height(W.PAD.x + r * Math.cos(a), W.PAD.z + r * Math.sin(a))) < 0.01, 'flat helipad');
  }
  assert.equal(W.ASL_OFFSET, 84, 'helipad at 84 m ASL');
  const floor = [];
  for (let z = -3000; z <= 1500; z += 50) floor.push(W.height(W.valleyX(z), z) + W.ASL_OFFSET);
  assert.ok(Math.min(...floor) > -10 && Math.max(...floor) < 135);
  const sl = [];
  for (let i = 0; i < 4000; i++) {
    const z = -3000 + rnd() * 3500;
    const x = W.valleyX(z) + (rnd() * 2 - 1) * 0.9 * W.halfWidth(z);
    const a = rnd() * 6.283;
    sl.push(Math.abs(W.height(x + 100 * Math.cos(a), z + 100 * Math.sin(a)) - W.height(x, z)) / 100);
  }
  assert.ok(
    pct(sl, 0.5) < 0.1 && pct(sl, 0.9) > 0.07 && pct(sl, 0.9) < 0.25,
    'slopes: median ' + pct(sl, 0.5) + ', p90 ' + pct(sl, 0.9),
  );
});

test('F24 forest in high quality: about 290 000 trees of three kinds, tops 10-20.5 m (measured 13-20 m)', () => {
  const scene = new T.Scene();
  s = build(T, P, scene, { quality: 'high', canvas });
  f = s.forest;
  let min = 1e9;
  let max = 0;
  for (const v of f.heights) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  assert.ok(f.count > 250000 && f.count < 400000, 'trees: ' + f.count);
  assert.ok(min >= 10 && max <= 20.5, 'tree tops ' + min + '-' + max);
  assert.ok(
    f.perSpecies.every((n) => n > 30000),
    'pines, spruces and broadleaf trees',
  );
});

test('F24 density per hectare: closed stands 150+/ha, mixed woodland 80+, groves on an open floor (median < 40); canopy covers the ground', () => {
  const cls = { dense: [], mid: [], floor: [] };
  for (let x = -3000; x < 3000; x += 100) {
    for (let z = -4000; z < 2500; z += 100) {
      const cx = x + 50;
      const cz = z + 50;
      const p = W.forestDensity(cx, cz);
      (p > 0.7 ? cls.dense : p > 0.3 ? cls.mid : cls.floor).push(f.density(cx, cz, 50));
    }
  }
  assert.ok(pct(cls.dense, 0.5) >= 150, 'closed stands: 150+ trees/ha');
  assert.ok(pct(cls.mid, 0.5) >= 80, 'mixed woodland');
  assert.ok(pct(cls.floor, 0.9) >= 30, 'groves on the valley floor');
  assert.ok(pct(cls.floor, 0.5) < 40, 'open floor between the groves');
  let covered = 0;
  let n = 0;
  for (let i = 0; i < 3000; i++) {
    const z = -2500 + rnd() * 2000;
    const x = W.valleyX(z) + (rnd() < 0.5 ? -1 : 1) * (W.halfWidth(z) + 250 + rnd() * 250);
    if (W.forestDensity(x, z) < 0.8) continue;
    n++;
    const g = W.height(x, z);
    if (f.hit(new T.Vector3(x, g + 60, z), new T.Vector3(x, g + 0.2, z))) covered++;
  }
  assert.ok(covered / n > 0.3, 'crowns cover a good share of the ground (collision boxes are conservative)');
});

test('F24 AGL over trees as on the recordings: p90 13-21 m, maximum 23 m', () => {
  const tops = [];
  for (let line = 0; line < 60; line++) {
    const z0 = -2600 + rnd() * 2400;
    const side = rnd() < 0.5 ? -1 : 1;
    const x0 = W.valleyX(z0) + side * (W.halfWidth(z0) + 150 + rnd() * 300);
    for (let k = 0; k < 400; k += 2) {
      const x = x0 + k * 0.3;
      const z = z0 + k * 0.95;
      const g = W.height(x, z);
      const hit = s.field.hit(new T.Vector3(x, g + 60, z), new T.Vector3(x, g - 0.5, z));
      if (hit && hit.kind === 'arbre') tops.push(60 - hit.fraction * 60.5);
    }
  }
  assert.ok(tops.length > 1500, 'forest under the probes');
  assert.ok(
    pct(tops, 0.9) >= 13 && pct(tops, 0.9) <= 21,
    'p90 object height like the recordings (17-19 m): ' + pct(tops, 0.9),
  );
  assert.ok(Math.max(...tops) <= 23, 'no giant trees');
});

test('F25 structures: hall 14-20 m, chimney 75-105 m, pylons 30-40 m, 40 ft container, launch sites clear', () => {
  const hall = W.BUILDINGS.find((b) => b.id === 'hall');
  const tall = Math.max(...W.CHIMNEYS.map((c) => c.h));
  assert.ok(hall.h >= 14 && hall.h <= 20);
  assert.ok(tall >= 75 && tall <= 105);
  assert.ok(W.POWER.height >= 30 && W.POWER.height <= 40);
  const box = s.field.items.find((o) => o.kind === 'conteneur');
  const size = box.max.clone().sub(box.min);
  assert.ok(Math.abs(Math.max(size.x, size.z) - 12.19) < 0.01);
  assert.ok(s.wires.length > 100);
  for (const site of W.AA_SITES) {
    const eye = new T.Vector3(site.x, site.y + 1.6, site.z);
    assert.ok(site.y >= W.height(site.x, site.z) - 0.05, site.id + ' not buried');
    assert.equal(s.field.hit(eye, eye.clone().add(new T.Vector3(0, 0.5, 0))), null, site.id + ' eye free');
  }
});

test('F25 three numbered towers of 32-35 m (about 33 on recording 1), solid to the roof; a village, five fields, the river 1.2 m lower', () => {
  assert.equal(W.TOWERS.length, 3);
  assert.ok(
    W.TOWERS.every((t) => t.h >= 32 && t.h <= 35),
    'towers about 33 m',
  );
  for (const t of W.TOWERS) {
    const top = s.field.hit(new T.Vector3(t.x, t.base + 60, t.z), new T.Vector3(t.x, t.base - 1, t.z));
    assert.ok(top && top.kind === 'tour', 'tower ' + (t.id + 1) + ' solid');
    const roof = 60 - top.fraction * 61;
    assert.ok(Math.abs(roof - t.h) < 3, 'roof about ' + t.h + ' m: ' + roof.toFixed(1));
  }
  assert.equal(W.TOWNS.length, 1);
  assert.ok(W.HOUSES.length >= 20, 'village by the road: ' + W.HOUSES.length + ' houses');
  assert.equal(W.FIELDS.length, 5);
  assert.equal(W.RIVER.water, 3, 'river water 1.2 m lower than v11');
});
