'use strict';
// G5 engine parity, Node side (docs/FIDELITE.md). desktop/parity.cjs is the program the packaged app's self-test and the
// browser parity spec evaluate inside the page. Here it runs on src/physics.js in the golden harness's module realm
// and must give the recorded golden (tests/fixtures/golden/parity.json) bit for bit, with its own SHA-256 and the
// golden Hasher's encoding; its embedded input and expected digests must be the golden's.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT, SRC, TEMPLATE, GOLDEN, RECORDER } = require('../helpers/paths');

const parity = require(path.join(ROOT, 'desktop', 'parity.cjs'));
const golden = JSON.parse(fs.readFileSync(path.join(GOLDEN, 'parity.json'), 'utf8'));
const { loadRuntime, makeModuleRealm } = require(path.join(RECORDER, 'harness.cjs'));

test('the embedded input and expected digests are the golden parity fixture', () => {
  assert.equal(parity.INPUT.generator, golden.generator);
  assert.equal(parity.INPUT.seconds, golden.seconds);
  assert.equal(parity.INPUT.seed, golden.seed);
  assert.deepEqual(parity.INPUT.config, golden.config);
  assert.equal(parity.EXPECTED.frames, golden.frames);
  assert.equal(parity.EXPECTED.framesSha256, golden.framesSha256);
  assert.equal(parity.EXPECTED.final, golden.expected.final);
  assert.equal(parity.EXPECTED.checkpointHex, golden.expected.checkpointHex);
});

test("the embedded samples are the flight golden's samples of the same run (synthetic/rate-alt)", () => {
  const flight = JSON.parse(fs.readFileSync(path.join(GOLDEN, 'flight.json'), 'utf8'));
  assert.equal(flight.meta.parityScript.run, 'synthetic/rate-alt');
  const run = flight.runs['synthetic/rate-alt'];
  assert.equal(run.final, golden.expected.final);
  assert.deepEqual(parity.EXPECTED.samples, run.samples);
});

test('the program on src/physics.js (golden realm) gives the golden digests and samples: G5 verdict "node"', () => {
  const rt = loadRuntime({ src: SRC, template: TEMPLATE });
  const realm = makeModuleRealm(rt, { files: ['world.js', 'physics.js'] });
  const r = parity.program(realm.P, parity.INPUT);
  assert.equal(r.frames, parity.EXPECTED.frames);
  assert.equal(r.framesSha256, parity.EXPECTED.framesSha256);
  assert.equal(r.steps, 7200);
  assert.equal(r.final, parity.EXPECTED.final);
  assert.equal(r.checkpointHex, parity.EXPECTED.checkpointHex);
  assert.deepEqual(r.samples, parity.EXPECTED.samples);
  const v = parity.compare(r);
  assert.deepEqual(v, {
    ok: true,
    engine: 'node',
    script: true,
    within: true,
    maxDelta: { position: 0, velocity: 0, quaternion: 0, collective: 0 },
  });
});

test('G5 verdict: Chromium reference accepted, any other digest or a drift beyond the tolerance refused', () => {
  const base = { ...parity.EXPECTED, steps: 7200, samples: parity.EXPECTED.samples };
  assert.notEqual(parity.CHROMIUM.final, parity.EXPECTED.final);
  assert.equal(parity.CHROMIUM.checkpointHex.length, parity.EXPECTED.checkpointHex.length);
  const chromium = { ...base, final: parity.CHROMIUM.final, checkpointHex: parity.CHROMIUM.checkpointHex };
  assert.equal(parity.compare(chromium).engine, 'chromium');
  assert.equal(parity.compare(chromium).ok, true);
  assert.equal(parity.compare({ ...base, final: '0'.repeat(64) }).engine, 'unknown');
  assert.equal(parity.compare({ ...base, final: '0'.repeat(64) }).ok, false);
  assert.equal(parity.compare({ ...base, samples: base.samples.slice(1) }).ok, false, 'a missing sample');
  assert.equal(parity.compare({ ...base, frames: 5999 }).ok, false, 'another script');
  // Moving one position by 1e-6 m (a thousand times the tolerance) is refused; by 1e-12 m it is accepted.
  const moved = (d) => {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setBigUint64(0, BigInt('0x' + base.samples[3].p[0]));
    dv.setFloat64(0, dv.getFloat64(0) + d);
    const p = [dv.getBigUint64(0).toString(16).padStart(16, '0'), ...base.samples[3].p.slice(1)];
    return { ...base, samples: base.samples.map((s, i) => (i === 3 ? { ...s, p } : s)) };
  };
  assert.equal(parity.compare(moved(1e-6)).within, false);
  assert.equal(parity.compare(moved(1e-12)).within, true);
  assert.ok(parity.TOLERANCE.position <= 1e-9 && parity.TOLERANCE.quaternion <= 1e-12);
});

test('the pinned Electron is the one the Chromium reference was measured with', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(parity.CHROMIUM.measuredWith.electron, pkg.devDependencies.electron);
});

test('the page expression is self-contained: it runs in a bare realm that only has the flight module', () => {
  const rt = loadRuntime({ src: SRC, template: TEMPLATE });
  const realm = makeModuleRealm(rt, { files: ['world.js', 'physics.js'] });
  const ctx = vm.createContext({ window: { HeliPhysics: realm.P }, TextEncoder });
  const r = vm.runInContext(parity.pageExpression(), ctx);
  assert.equal(r.final, parity.EXPECTED.final);
  assert.equal(r.checkpointHex, parity.EXPECTED.checkpointHex);
});

test("the program's own hashing equals the golden Hasher (Node crypto) on other scripts and seeds", () => {
  const src = parity.program.toString();
  assert.ok(!/\brequire\s*\(|\bprocess\b|\bimport\s*\(|\bBuffer\b/.test(src), 'no Node API inside the page program');
  // Frame scripts of many lengths put the message end at every position of the 64-byte block.
  for (const [seconds, seed] of [
    [0.01, 1],
    [0.05, 2],
    [0.2, 7],
    [0.5, 7],
    [1, 99],
    [3, 12345],
  ]) {
    const r = parity.program(fakeFlight(), { ...parity.INPUT, seconds, seed });
    assert.equal(r.framesSha256, nodeFramesDigest(seconds, seed), `${seconds} s, seed ${seed}`);
  }
});

// A flight module that does nothing (the frames digest does not depend on it).
function fakeFlight() {
  const v = () => ({ isVector3: true, toArray: () => [0, 0, 0] });
  return {
    Flight: class {
      constructor() {
        Object.assign(this, { position: v(), velocity: v(), quaternion: v(), angular: v(), cyclic: v() });
        Object.assign(this, { mouseRate: v(), collective: 0, verticalAccel: 0, lift: 0, sideslip: 0 });
        Object.assign(this, { onGround: false, crashed: false, time: 0 });
      }
      reset() {}
      step() {}
    },
    createInputState: () => ({}),
    mouseMove() {},
    frameStart() {},
    inputStep: () => ({}),
  };
}
// The golden Hasher's bytes for the frames of sessionV1(seconds, seed), hashed with Node's crypto.
function nodeFramesDigest(seconds, seed) {
  const { sessionV1, hashFrames } = require(path.join(RECORDER, 'suites', 'flight.cjs'));
  const digest = hashFrames(sessionV1(seconds, seed));
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.ok(crypto.getHashes().includes('sha256'));
  return digest;
}
