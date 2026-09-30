'use strict';
// The real scenery (scenery.js, forest.js, world.js) built in Node: levels of detail of the forest, collisions on an
// isolated tree, the lower graphics qualities, and the scenery of generated maps (solid towers, houses and viaduct;
// nothing growing on reserved ground). Time budgets of these builds are in tests/perf.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');
const { canvas } = require('../helpers/canvas');

const T = load('vendor/three.min.js');
const P = load('physics.js');
const W = load('world.js');
const build = load('scenery.js');

let s = null;
let f = null;
test('the reference valley builds in high quality', () => {
  s = build(T, P, new T.Scene(), { quality: 'high', canvas });
  f = s.forest;
  assert.ok(f.count > 250000);
});

test('levels of detail: every tree within R_NEAR is in exactly one near list, the others are left to the far layer', () => {
  const { R_NEAR } = f.settings;
  for (const [x, y, z] of [
    [0, 70, 130],
    [-100, 60, -900],
    [-600, 120, -1600],
    [400, 90, -2200],
    [-300, 300, -1000],
    [1200, 200, -2800],
  ]) {
    f.rebuild(x, y, z);
    let inside = 0;
    for (let k = 0; k < f.count; k++) if ((f.x[k] - x) ** 2 + (f.z[k] - z) ** 2 < R_NEAR * R_NEAR) inside++;
    const shown = f.shown[0].reduce((a, b) => a + b, 0) + f.shown[1].reduce((a, b) => a + b, 0);
    assert.equal(shown, inside, `near lists hold exactly the trees within ${R_NEAR} m at ${x},${z}`);
    for (let l = 0; l < 2; l++) for (let k = 0; k < 3; k++) assert.ok(f.shown[l][k] <= f.capacity[l][k]);
  }
});

test('collisions on an isolated tree: a round into the trunk stops there, the rotor sweep hits the crown, 3 m above passes', () => {
  const cell = 32;
  const grid = new Map();
  const key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
  for (let i = 0; i < f.count; i++) {
    const q = key(f.x[i], f.z[i]);
    if (!grid.has(q)) grid.set(q, []);
    grid.get(q).push(i);
  }
  const alone = (i) => {
    const cx = Math.floor(f.x[i] / cell);
    const cz = Math.floor(f.z[i] / cell);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        for (const j of grid.get(cx + a + ',' + (cz + b)) || [])
          if (j !== i && Math.abs(f.x[j] - f.x[i]) < 32 && Math.abs(f.z[j] - f.z[i]) < 32) return false;
      }
    }
    return true;
  };
  let k = -1;
  for (let i = 0; i < f.count && k < 0; i++)
    if (f.y[i] > -20 && f.heights[i] > 15 && Math.abs(f.x[i]) < 2000 && alone(i)) k = i;
  assert.ok(k >= 0, 'an isolated tree');
  const x = f.x[k];
  const y = f.y[k];
  const z = f.z[k];
  const h = f.heights[k];
  const trunk = s.field.hit(new T.Vector3(x - 30, y + 2, z), new T.Vector3(x + 30, y + 2, z));
  assert.ok(trunk && trunk.kind === 'arbre' && Math.abs(trunk.fraction * 60 - 30) < 1.5, 'round stopped by the trunk');
  const crown = s.field.hit(new T.Vector3(x, y + h - 0.5, z - 20), new T.Vector3(x, y + h - 0.5, z + 20), 1.15);
  assert.ok(crown && crown.kind === 'arbre', 'rotor sweep into a crown');
  assert.equal(
    s.field.hit(new T.Vector3(x - 30, y + h + 3, z), new T.Vector3(x + 30, y + h + 3, z)),
    null,
    'clear above the tree',
  );
  assert.equal(
    s.field.hit(new T.Vector3(x - 30, y + 2, z), new T.Vector3(x + 30, y + 2, z), 0, new Set(['arbre'])),
    null,
    'trees ignored on request (lines of sight, missiles)',
  );
  assert.ok(s.field.items.length < 3000, 'trees are not stored as boxes: ' + s.field.items.length);
});

test('lower qualities keep a real forest (medium > 140 000 trees, low > 70 000)', () => {
  for (const quality of ['medium', 'low']) {
    const b = build(T, P, new T.Scene(), { quality, canvas });
    assert.ok(b.forest.count > (quality === 'low' ? 70000 : 140000), quality + ': ' + b.forest.count);
  }
});

test('generated maps: a real forest, a power line, solid towers, houses and viaduct, nothing on reserved ground', () => {
  try {
    for (const sd of [42, 123456]) {
      W.use('gen-' + sd);
      const g = build(T, P, new T.Scene(), { quality: 'high', canvas });
      assert.ok(g.forest.count > 150000, 'a real forest: ' + g.forest.count);
      assert.ok(g.wires.length > 50, 'power line');
      for (const t of W.TOWERS) {
        const hit = g.field.hit(new T.Vector3(t.x, t.base + 60, t.z), new T.Vector3(t.x, t.base - 1, t.z));
        assert.ok(hit && hit.kind === 'tour', 'generated tower ' + (t.id + 1) + ' solid');
      }
      for (const h of W.HOUSES.slice(0, 20)) {
        const hit = g.field.hit(new T.Vector3(h.x, h.base + h.h + 8, h.z), new T.Vector3(h.x, h.base - 1, h.z));
        assert.ok(hit && hit.kind === 'maison', 'house solid');
      }
      if (W.VIADUCT) {
        const V = W.VIADUCT;
        const x = (V.x0 + V.x1) / 2;
        const hit = g.field.hit(new T.Vector3(x, V.deck + 10, V.z), new T.Vector3(x, V.deck - 12, V.z));
        assert.ok(hit && hit.kind === 'viaduc', 'viaduct deck solid');
      }
      let k = 0;
      for (let i = 0; i < g.forest.count; i++) {
        const x = g.forest.x[i];
        const z = g.forest.z[i];
        if (
          Math.hypot(x - W.PAD.x, z - W.PAD.z) < 100 ||
          W.TOWERS.some((t) => Math.hypot(x - t.x, z - t.z) < 40) ||
          W.houseAt(x, z, 1) ||
          W.fieldAt(x, z)
        )
          k++;
      }
      assert.equal(k, 0, 'no tree on reserved ground');
    }
  } finally {
    W.use('vallee');
  }
});
