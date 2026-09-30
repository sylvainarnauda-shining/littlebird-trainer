'use strict';
// Check F22: the synthesised sounds of audio.js against the spectra and rhythm measured on the reference recordings
// (audio.js MEASURED). Only shapes are compared: octave-band levels relative to the loudest band, within 5 dB.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');

const A = load('audio.js');
const sr = 48000;
const rel = (v) => {
  const m = Math.max(...v);
  return v.map((x) => x - m);
};
const worst = (a, b) => Math.max(...rel(a).map((x, i) => Math.abs(x - rel(b)[i])));
const rotor = A.synthRotor(sr, 2);
const shots = [1, 2, 3, 4].map((s) => A.synthShot(sr, s));

test('F22 rotor loop: within 5 dB per octave band, loudest 120-250 Hz, seamless loop', () => {
  const rl = A.bandLevels(rotor, sr);
  assert.ok(worst(rl, A.MEASURED.rotor) <= 5, 'rotor spectrum within 5 dB per octave band');
  assert.equal(rl.indexOf(Math.max(...rl)), 2, 'loudest band 120-250 Hz');
  assert.ok(Math.abs(rotor[0] - rotor[rotor.length - 1]) < 0.2, 'loop joins without a click');
});

test('F22 minigun: 30 reports/s, within 5 dB per octave band over the rotor at +12 dB, loudest 20-60 Hz', () => {
  const n = sr * 1.5;
  const train = new Float32Array(n);
  const { times } = A.scheduleShots(0, 1.5, 0);
  assert.equal(times.length, 45, '30 reports per second (one every 33 ms)');
  times.forEach((t, k) => {
    const s = shots[k % 4];
    const i0 = Math.round(t * sr);
    for (let i = 0; i < s.length && i0 + i < n; i++) train[i0 + i] += s[i] * 0.6;
  });
  const rms = (x) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
  const loop = new Float32Array(n);
  for (let i = 0; i < n; i++) loop[i] = rotor[i % rotor.length];
  const k = rms(train) / rms(loop) / Math.pow(10, 12 / 20);
  for (let i = 0; i < n; i++) train[i] += loop[i] * k;
  const gl = A.bandLevels(train, sr);
  assert.ok(worst(gl, A.MEASURED.gun) <= 5, 'minigun spectrum within 5 dB per octave band');
  assert.equal(gl.indexOf(Math.max(...gl)), 0, 'loudest band 20-60 Hz');
});

test('F22 report envelope in the 1-6 kHz band: 50 % in 1-4 ms, 10 % in 15-40 ms', () => {
  const s = A.biquad(A.biquad(shots[0], sr, 'highpass', 1000), sr, 'lowpass', 6000);
  const env = [];
  for (let i = 0; i + 24 <= s.length; i += 24) {
    let e = 0;
    for (let j = 0; j < 24; j++) e += s[i + j] ** 2;
    env.push(Math.sqrt(e / 24));
  }
  const p = env.indexOf(Math.max(...env));
  const half = (env.findIndex((v, i) => i > p && v < env[p] * 0.5) - p) * 0.5;
  const tenth = (env.findIndex((v, i) => i > p && v < env[p] * 0.1) - p) * 0.5;
  assert.ok(half >= 1 && half <= 4, '50 % decay: ' + half);
  assert.ok(tenth >= 15 && tenth <= 40, '10 % decay: ' + tenth);
});
