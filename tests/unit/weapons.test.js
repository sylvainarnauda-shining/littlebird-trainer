'use strict';
// Minigun and hit damage of physics.js against the reference recordings (checks F11 and F12).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');

const P = load('physics.js');
const DT = 1 / 120;

test('F11 minigun: first round after 0.35 +- 0.02 s spin-up, 49-51 rounds in 2.35 s, a short release keeps the spin', () => {
  const g = new P.Minigun({ ...P.defaults });
  let first = null;
  let total = 0;
  for (let i = 0; i < Math.round(2.35 / DT); i++) {
    const n = g.step(DT, true);
    if (n && first === null) first = i * DT;
    total += n;
  }
  assert.ok(Math.abs(first - 0.35) < 0.02, 'first round at ' + first);
  assert.ok(total >= 49 && total <= 51, '25 rounds/s after spin-up: ' + total);
  for (let i = 0; i < Math.round(0.1 / DT); i++) g.step(DT, false);
  let again = null;
  for (let i = 0; i < 120; i++) {
    if (g.step(DT, true) && again === null) again = i * DT;
  }
  assert.ok(again < 0.1, 'short release keeps barrels spinning');
});

test('F12 observed hit damage: 42 values, mean 58.23, sum = the four on-screen totals', () => {
  const mean = P.OBSERVED_HITS.reduce((a, b) => a + b) / P.OBSERVED_HITS.length;
  assert.equal(P.OBSERVED_HITS.length, 42);
  assert.ok(Math.abs(mean - 58.23) < 0.05);
  const sum = P.OBSERVED_HITS.reduce((a, b) => a + b);
  assert.ok(Math.abs(sum - (397.9 + 758.25 + 885.55 + 403.92)) < 0.02, 'sum equals the four on-screen totals');
  assert.equal(P.hitDamage({ impactDamage: 36.02 }), 36.02);
  let seq = 0;
  const r = () => {
    seq = (seq + 0.37) % 1;
    return seq;
  };
  for (let i = 0; i < 50; i++) assert.ok(P.OBSERVED_HITS.includes(P.hitDamage({ impactDamage: 0 }, r)));
});
