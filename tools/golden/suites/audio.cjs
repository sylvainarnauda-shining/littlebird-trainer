'use strict';
// G2d audio goldens: the offline synthesis of audio.js (reports, rotor loop, explosions, filters, band levels, report
// scheduling) hashed as Float32/Float64 bytes, and the Web Audio engine (SoundEngine) driven through a scripted minute
// of states against the recording AudioContext (webaudio.cjs): graph, parameters, schedule and random draws.
const { makeModuleRealm } = require('../harness.cjs');
const { createAudioClass } = require('../webaudio.cjs');
const { Hasher } = require('../canon.cjs');

const f32 = (h, a) => { h.str(a.constructor.name).num(a.length); h.bytes(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); };
async function record(rt, { log = () => {} } = {}) {
  const realm = makeModuleRealm(rt, { files: ['audio.js'], seedG: 11 }), A = realm.A, out = {};
  const put = (k, fn) => { const h = new Hasher(); fn(h); out[k] = h.digest(); log('audio', k, out[k].slice(0, 16)); };
  for (const sr of [48000, 44100]) {
    for (const seed of [1, 2, 3, 4]) put(`shot/${sr}/${seed}`, h => { const x = A.synthShot(sr, seed); f32(h, x); h.val(A.bandLevels(x, sr)); });
    put(`rotor/${sr}`, h => { const x = A.synthRotor(sr, 2); f32(h, x); h.val(A.bandLevels(x, sr)); });
    put(`rotor/${sr}/1.5s-seed9`, h => f32(h, A.synthRotor(sr, 1.5, 9)));
    for (const [seed, size] of [[1, 1], [2, 1], [3, 1.6]]) put(`explosion/${sr}/${seed}/${size}`, h => { const x = A.synthExplosion(sr, seed, size); f32(h, x); h.val(A.bandLevels(x, sr)); });
  }
  put('biquad', h => { let s = 99; const x = new Float32Array(8192); for (let i = 0; i < x.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; x[i] = s / 4294967296 * 2 - 1; }
    for (const [type, f0, q, g] of [['lowpass', 200, .8, 0], ['highpass', 45, .7071, 0], ['bandpass', 1400, .8, 0], ['peaking', 700, .7, 3], ['peaking', 180, .8, 6], ['lowpass', 12000, .7, 0]]) f32(h, A.biquad(x, 48000, type, f0, q, g)); });
  put('schedule', h => { let next = 0; for (let t = 0; t < 3; t += 1 / 60) { const r = A.scheduleShots(t, t + .06, next); next = r.next; h.val(r.times); h.num(next); } h.val(A.scheduleShots(0, 1, 0, 1 / 12)); h.num(A.SHOT_INTERVAL); h.val(A.BANDS); h.val(A.MEASURED); });
  // Engine: 60 s of 100 Hz updates through the states a session goes through.
  const page = { clockMs: 0, clock() { return this.clockMs; }, audioLog: new Hasher(), audioOps: 0 };
  realm.g.AudioContext = createAudioClass(page);
  const e = new A.SoundEngine(); const started = e.start(.4);
  for (let i = 0; i < 6000; i++) {
    page.clockMs += 10; const t = i / 100;
    const enemies = t > 20 ? [{ id: 'bot0', distance: 300 + 200 * Math.sin(t / 3), alive: t < 50, firing: (i % 300) < 90, pan: Math.sin(t) }, { id: 'ciws0', distance: 800, alive: true, firing: (i % 500) < 120, rotor: false, loud: 1, pitch: .8, interval: 1 / 70, pan: -.4 }] : [];
    e.update({ running: t < 55, alive: !(t > 40 && t < 43), volume: .4, mix: { engine: 1, weapons: .9, alerts: 1 }, collective: Math.sin(t / 5), speed: 30 + 30 * Math.sin(t / 7), spin: Math.min(1, Math.max(0, Math.sin(t / 2) * 2)),
      firing: Math.sin(t / 2) > 0, warning: t > 30 && t < 38 ? 2 : 0, beepOn: (i % 20) < 10, toneHz: t > 34 ? 1600 : 1000, missileDistance: t > 34 && t < 38 ? 900 - (t - 34) * 200 : null, missilePan: .3, view: t < 25 ? 'cockpit' : 'chase', enemies });
    if (i % 250 === 0) e.play(['explosion', 'hit', 'launch', 'flare', 'click', 'impact', 'ui', 'crack'][(i / 250) % 8], { distance: 50 + i % 700, pan: (i % 7) / 7 - .5, gain: .8 });
  }
  out.engine = page.audioLog.digest(); log('audio', 'engine', out.engine.slice(0, 16));
  return { suite: 'audio', meta: { sampleRates: [48000, 44100], engine: { started, updates: 6000, rateHz: 100, audioOps: page.audioOps, gameDraws: realm.counters.gameDraws, seedG: 11 } }, digests: out };
}
module.exports = { record };
