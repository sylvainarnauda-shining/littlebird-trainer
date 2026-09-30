'use strict';
// Time budgets of the simulation and of the scenery build (moved out of the functional tests: shared CI runners vary in
// speed). Always measured and reported; enforced only on a known machine with LB_PERF=1 (npm run test:perf). Budgets
// are never relaxed to make a run pass.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');
const { canvas } = require('../helpers/canvas');

const T = load('vendor/three.min.js');
const P = load('physics.js');
const W = load('world.js');
const M = load('missiles.js');
const build = load('scenery.js');
const ENFORCE = process.env.LB_PERF === '1';
const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;
function budget(t, what, value, limit, unit) {
  t.diagnostic(`${what}: ${value.toFixed(2)} ${unit} (budget ${limit} ${unit})`);
  if (ENFORCE) assert.ok(value < limit, `${what}: ${value.toFixed(2)} ${unit} over the budget of ${limit} ${unit}`);
}

test('six surface-to-air launchers around a helicopter for 60 s: under 2 500 ms', (t) => {
  const ground = () => 0;
  const los = (p, q) => {
    const d = q.clone().sub(p);
    const n = Math.max(6, Math.ceil(d.length() / 15));
    for (let i = 1; i < n; i++) if (p.y + d.y * (i / n) < ground() + 0.3) return false;
    return true;
  };
  const env = { terrain: ground, hit: () => null, los };
  const air = new M.AirDefense({ ...M.defaults, aaLockRange: 1500, flareUnlimited: true }, env);
  const sites = [];
  for (let i = 0; i < 6; i++) sites.push({ x: Math.cos(i) * 900, y: 0, z: Math.sin(i) * 900, kind: 'manpads' });
  air.reset(sites, 11);
  const heli = {
    position: new T.Vector3(0, 120, 0),
    velocity: new T.Vector3(40, 0, 0),
    quaternion: new T.Quaternion(),
    agl: 120,
    alive: true,
  };
  const t0 = process.hrtime.bigint();
  for (let s = 0; s < 60; s += 1 / 120) {
    air.step(1 / 120, heli);
    heli.position.addScaledVector(heli.velocity, 1 / 120);
    if (heli.position.x > 600) heli.velocity.x = -40;
    if (heli.position.x < -600) heli.velocity.x = 40;
    air.events.length = 0;
  }
  budget(t, 'six launchers, 60 s at 120 Hz', ms(t0), 2500, 'ms');
});

test('reference valley scenery build under 6 s; forest LOD rebuild under 8 ms; bullet query under 20 us', (t) => {
  let t0 = process.hrtime.bigint();
  const s = build(T, P, new T.Scene(), { quality: 'high', canvas });
  budget(t, 'valley build (high)', ms(t0), 6000, 'ms');
  const f = s.forest;
  t0 = process.hrtime.bigint();
  for (let i = 0; i < 50; i++) f.rebuild(-300 + i * 20, 80, -1200);
  budget(t, 'forest LOD rebuild', ms(t0) / 50, 8, 'ms');
  let seed = 7;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const a = new T.Vector3();
  const b = new T.Vector3();
  t0 = process.hrtime.bigint();
  for (let i = 0; i < 20000; i++) {
    const px = -800 + rnd() * 1600;
    const pz = -2000 + rnd() * 2000;
    const g = W.height(px, pz);
    a.set(px, g + 8 + rnd() * 20, pz);
    b.set(px + 8, g + 6 + rnd() * 20, pz + 3);
    s.field.hit(a, b);
  }
  budget(t, 'bullet step query', (ms(t0) * 1000) / 20000, 20, 'us');
});

test('generated map scenery build under 8 s', (t) => {
  try {
    for (const sd of [42, 123456]) {
      W.use('gen-' + sd);
      const t0 = process.hrtime.bigint();
      build(T, P, new T.Scene(), { quality: 'high', canvas });
      budget(t, `gen-${sd} build (high)`, ms(t0), 8000, 'ms');
    }
  } finally {
    W.use('vallee');
  }
});
