'use strict';
// The '#carte=' part of a shared link is untrusted: only 'gen-1' to 'gen-999998' and 'vallee' are accepted, anything
// else falls back to the reference valley, and the map id written back is always one of these forms.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');
const { lcg, SEED } = require('../helpers/rng');

const W = load('world.js');
const OK = /^(vallee|gen-[1-9]\d{0,5})$/;

test('hostile map ids fall back to the valley or to a bounded generated seed', () => {
  const hostile = [
    '',
    ' ',
    'gen-',
    'gen--5',
    'gen-0',
    'gen-1e9',
    'gen-9999999',
    'gen-12<script>',
    '<img src=x>',
    'constructor',
    '__proto__',
    'toString',
    '../../etc',
    'javascript:alert(1)',
    'gen-12\nvallee',
    'GEN-12',
    'gen-١٢',
  ];
  for (const s of hostile) {
    const spec = W.parseSpec(s);
    assert.ok(
      spec.kind === 'vallee' ||
        (spec.kind === 'gen' && Number.isInteger(spec.seed) && spec.seed >= 1 && spec.seed <= 999998),
      JSON.stringify(s),
    );
    assert.match(W.specId(spec), OK, JSON.stringify(s));
  }
  for (const v of [
    null,
    undefined,
    42,
    {},
    [],
    { kind: 'gen', seed: 'x' },
    { kind: 'gen', seed: Infinity },
    { kind: 'other' },
  ]) {
    assert.match(W.specId(W.parseSpec(v)), OK, JSON.stringify(v));
  }
});

test('random strings never produce anything but a valley or a generated-map id', () => {
  const r = lcg(SEED + 301);
  const chars = 'gen-0123456789vallee<>"\'/\\ \n#=&%';
  for (let i = 0; i < 5000; i++) {
    let s = '';
    const n = Math.floor(r() * 16);
    for (let k = 0; k < n; k++) s += chars[Math.floor(r() * chars.length)];
    assert.match(W.specId(W.parseSpec(s)), OK, JSON.stringify(s));
  }
});
