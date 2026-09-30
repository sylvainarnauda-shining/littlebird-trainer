'use strict';
// Maps of world.js without a browser: map ids and names, the eight light presets (check F26), the same seed giving the
// same map and the physics following the map in use (G03), and the layout rules on ten generated maps: flat helipad,
// open range lane, three numbered towers of 32-35 m, launch sites on the ground or on factory roofs, houses off the
// river, road and rail, flat fields, bridges where tracks cross the river, a viaduct above the ground. The generated
// layouts are pinned bit for bit by the world goldens (tests/fixtures/golden/world.json), so shared 'gen-N' links stay
// valid across releases.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');
const NAMES = require('../helpers/names');

const P = load('physics.js');
const W = load('world.js');
const SEEDS = [1, 7, 42, 777, 1234, 5000, 31337, 99999, 123456, 654321];

test("map ids: 'gen-<seed>' (1-999998), anything else falls back to the reference valley; names deterministic and varied", () => {
  assert.deepEqual(W.parseSpec('gen-42'), { kind: 'gen', seed: 42 });
  assert.deepEqual(W.parseSpec('gen42'), { kind: 'gen', seed: 42 });
  assert.deepEqual(W.parseSpec('vallee'), { kind: 'vallee' });
  assert.deepEqual(W.parseSpec('carte-inconnue'), { kind: 'vallee' });
  assert.deepEqual(W.parseSpec('gen-999999'), { kind: 'gen', seed: 1 });
  assert.deepEqual(W.parseSpec({ kind: 'gen', seed: -5 }), { kind: 'gen', seed: 5 });
  assert.equal(W.specId({ kind: 'gen', seed: 42 }), 'gen-42');
  assert.equal(W.mapName(42), W.mapName(42), 'names are deterministic');
  const names = new Set();
  for (let i = 1; i <= 40; i++) names.add(W.mapName(i));
  assert.ok(names.size >= 30, 'varied names: ' + names.size);
  for (const n of names) assert.match(n, /^[A-Z][a-z]+( [A-Z][a-z]+)?$/, 'pseudo-Georgian name: ' + n);
});

test('F26 the eight light presets in the game order: all daytime, two with fog, a label each', () => {
  const L = W.LIGHTS;
  const keys = Object.keys(L);
  assert.deepEqual(keys, NAMES.lightPresets);
  for (const k of keys) {
    const l = L[k];
    assert.ok(l.el > 0 && l.el < 90, k + ': daytime sun');
    assert.ok(l.az >= 0 && l.az < 360);
    for (const c of ['sun', 'hemiSky', 'hemiGround', 'zenith', 'horizon', 'ground', 'fog'])
      assert.match(l[c], /^#[0-9a-f]{6}$/, k + ' ' + c);
    assert.ok(l.fogD > 0 && l.exposure > 0.8 && l.exposure < 1.3);
    assert.ok(typeof l.label === 'string' && l.label.length > 3, k + ' has a label');
  }
  assert.equal(keys.filter((k) => L[k].fogD >= 0.0005).length, 2, 'two foggy presets');
  assert.ok(L[NAMES.foggyMorning].fogD >= 0.0005, 'the foggy morning preset');
});

test('G03 same seed = same map; the physics follows the map in use; the reference valley is back afterwards', () => {
  const a = W.create('gen-42');
  const b = W.create('gen-42');
  const c = W.create('gen-43');
  assert.equal(a.name, b.name);
  assert.deepEqual(a.TOWERS, b.TOWERS);
  assert.equal(a.HOUSES.length, b.HOUSES.length);
  assert.deepEqual(a.FIELDS, b.FIELDS);
  assert.equal(a.height(300, -900), b.height(300, -900));
  assert.notDeepEqual(a.TOWERS, c.TOWERS, 'another seed, another layout');
  W.use('gen-42');
  assert.equal(W.id, 'gen-42');
  assert.ok(Math.abs(P.terrain(300, -900) - a.height(300, -900)) < 1e-9, 'the physics follows the map in use');
  W.use('vallee');
  assert.equal(W.id, 'vallee');
  assert.ok(
    Math.abs(P.terrain(300, -900) - W.create('vallee').height(300, -900)) < 1e-9,
    'back to the reference valley',
  );
});

const layouts = [];
for (const sd of SEEDS) {
  test(`G03 layout rules on gen-${sd}`, () => {
    const w = W.create('gen-' + sd);
    const tag = 'gen-' + sd;
    for (let r = 0; r <= 50; r += 10) {
      for (let a = 0; a < 6.3; a += 0.9)
        assert.ok(
          Math.abs(w.height(w.PAD.x + r * Math.cos(a), w.PAD.z + r * Math.sin(a))) < 0.01,
          tag + ' flat helipad',
        );
    }
    const inLane = (x, z) => Math.abs(x) < w.LANE.x && z > w.LANE.z0 && z < w.LANE.z1;
    assert.ok(
      !w.HOUSES.some((h) => inLane(h.x, h.z)) &&
        !w.TOWERS.some((t) => inLane(t.x, t.z)) &&
        !w.AA_SITES.some((s) => inLane(s.x, s.z)),
      tag + ' range lane open',
    );
    for (let z = w.LANE.z0 + 10; z < w.LANE.z1; z += 100)
      assert.ok(!w.fieldAt(0, z) && w.reserved(0, z), tag + ' no tree on the lane axis');
    assert.equal(w.TOWERS.length, 3, tag + ' three towers');
    assert.deepEqual(
      w.TOWERS.map((t) => t.id),
      [0, 1, 2],
    );
    for (const t of w.TOWERS) {
      assert.ok(t.h >= 32 && t.h <= 35, tag + ' tower height');
      assert.ok(Math.hypot(t.x - w.PAD.x, t.z - w.PAD.z) >= 550, tag + ' tower away from the pad');
      assert.ok(Math.abs(t.base - w.height(t.x, t.z)) < 0.01);
    }
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++)
        assert.ok(
          Math.hypot(w.TOWERS[i].x - w.TOWERS[j].x, w.TOWERS[i].z - w.TOWERS[j].z) >= 450,
          tag + ' towers apart',
        );
    }
    assert.equal(w.AA_SITES.filter((q) => q.roof).length, 2, tag + ' two roof sites');
    assert.equal(w.AA_SITES.filter((q) => q.kind === 'sam').length, 2, tag + ' two emplacement sites');
    assert.ok(w.AA_SITES.length >= 8, tag + ' launch sites: ' + w.AA_SITES.length);
    for (const q of w.AA_SITES) {
      if (q.roof) {
        const b = w.BUILDINGS.find((o) => o.id === q.roof);
        assert.ok(Math.abs(q.y - (b.base + b.h + (b.roof || 0))) < 1e-9, tag + ' on the roof');
      } else assert.ok(Math.abs(q.y - w.height(q.x, q.z)) < 0.05, tag + ' ' + q.id + ' on the ground');
    }
    for (const h of w.HOUSES) {
      assert.ok(
        Math.abs(h.x - w.riverX(h.z)) > w.RIVER.bank + 4 &&
          Math.abs(h.x - w.roadX(h.z)) > w.ROAD_WIDTH / 2 + 3 &&
          Math.abs(h.x - w.railX(h.z)) > w.RAIL_WIDTH / 2 + 4,
        tag + ' house off the lines',
      );
      for (const [dx, dz] of [
        [-1, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
      ])
        assert.ok(h.base <= w.height(h.x + (dx * h.w) / 2, h.z + (dz * h.d) / 2) + 0.01, tag + ' house not floating');
    }
    assert.ok(w.HOUSES.length >= 12 && w.TOWNS.length >= 1 && w.TOWNS.length <= 2, tag + ' one or two villages');
    assert.ok(w.FIELDS.length >= 3, tag + ' fields');
    for (const q of w.FIELDS) {
      assert.ok(w.slopeAt(q.x, q.z) < 0.07, tag + ' flat field');
      assert.equal(w.forestDensity(q.x, q.z), 0, tag + ' no tree in a field');
      assert.ok(['chaume', 'labour', 'vert', 'foin'].includes(q.crop));
    }
    for (const b of w.BRIDGES) {
      assert.ok(Math.abs(b.x - w.riverX(b.z)) < w.RIVER.bank, tag + ' bridge centred on the river bed');
      let spans = false;
      for (let q = -b.length / 2; q <= b.length / 2 && !spans; q += 1) {
        const x = b.x + Math.sin(b.yaw) * q;
        const z = b.z + Math.cos(b.yaw) * q;
        spans = Math.abs(x - w.channelX(z)) < (w.RIVER.half || 6);
      }
      assert.ok(spans, tag + ' the deck spans the water');
    }
    if (w.VIADUCT) {
      const V = w.VIADUCT;
      for (let x = V.x0 + 30; x < V.x1 - 30; x += 20)
        assert.ok(w.height(x, V.z) < V.deck - 1, tag + ' viaduct above the ground');
      for (const q of V.piers) assert.ok(q.ground < V.deck - 6);
      assert.ok(V.x1 - V.x0 > 300 && V.x1 - V.x0 <= 2100);
    }
    assert.ok(
      w.CHIMNEYS.length >= 1 && w.CHIMNEYS.length <= 3 && w.CHIMNEYS.every((c) => c.h >= 55 && c.h <= 100),
      tag + ' chimneys',
    );
    assert.ok(w.CRANES.length >= 2);
    layouts.push({ houses: w.HOUSES.length, towns: w.TOWNS.length, viaduct: !!w.VIADUCT });
  });
}

test('G03 across the ten maps: a viaduct on most maps but not all, villages of varied size, sometimes two villages', () => {
  assert.equal(layouts.length, SEEDS.length);
  const viaducts = layouts.filter((l) => l.viaduct).length;
  assert.ok(viaducts >= 5 && viaducts < 10, 'a viaduct on most maps, not all: ' + viaducts);
  assert.ok(new Set(layouts.map((l) => l.houses)).size >= 6, 'villages of varied size');
  assert.ok(
    layouts.some((l) => l.towns === 2),
    'sometimes two villages',
  );
});
