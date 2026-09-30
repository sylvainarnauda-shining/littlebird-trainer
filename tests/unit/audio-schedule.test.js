'use strict';
// Minigun reports scheduled across frame boundaries (audio.js scheduleShots): no gap, no double.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');

const A = load('audio.js');

test('reports keep a regular 33 ms spacing across 60 Hz frames, 31-33 in one second', () => {
  let next = 0;
  const all = [];
  for (let t = 0; t < 1; t += 1 / 60) {
    const r = A.scheduleShots(t, t + 0.06, next);
    next = r.next;
    all.push(...r.times);
  }
  const gaps = all.slice(1).map((t, i) => t - all[i]);
  assert.ok(
    gaps.every((g) => Math.abs(g - A.SHOT_INTERVAL) < 1e-9),
    'regular 33 ms spacing',
  );
  assert.ok(all.length >= 31 && all.length <= 33, 'reports in one second: ' + all.length);
});
