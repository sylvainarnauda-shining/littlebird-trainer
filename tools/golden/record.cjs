'use strict';
// Golden recorder. Records the golden suites of the Little Bird runtime into JSON fixtures (numbers and hashes
// only: no image, no path, no personal data), or checks a runtime against recorded fixtures.
//   node record.cjs --src <runtime dir> --template <page template> --inputs <inputs dir> --out <dir> [--suites a,b]
//                   [--private-out <dir>]
//   node record.cjs ... --check <golden dir> [--private-check <dir>] [--wording-step] [--report <file.json>]
//     (replays with the golden's own settings; exit 1 on a strict difference or when the recorder itself differs from
//     the one that recorded the goldens: a recorder change is proven with prove-recorder.cjs)
// Suites: flight (G2a), sessions (G2b + G2g per mode), world (G2c + G2g boot scenes), audio (G2d), hud (G2e),
// settings (G2f), models (G2g), ui (G6 + G7), modules (per-module goldens), hookapi (the test API contract and the
// automation pointer-lock boot).
// --wording-step: a step declared as wording (R2, with its reviewed string list): the wording class (texts on the HUD
// and in the DOM, display names, labels, notices) may differ; everything else stays strict.
// Private sidecars (never published): the calibration tools' controls and hook members. Written with --private-out,
// compared with --private-check; without them they are dropped.
// Runtime directory: the ten runtime files and vendor/three.min.js (the repository's src/, or a baseline copy).
process.env.TZ = 'UTC';
// Guard: nothing may draw from the recorder's own Math.random (the game's streams live in their realms). A leak, such
// as passing the host's Math.random into a module, would make recordings differ from run to run.
Math.random = () => { throw Error('host Math.random called during a golden recording'); };
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { loadRuntime, createPage } = require('./harness.cjs');
const { stableStringify } = require('./canon.cjs');
const { compareSuite } = require('./compare.cjs');

const RECORDER_VERSION = 2;
const ALL = ['flight', 'sessions', 'world', 'audio', 'hud', 'settings', 'models', 'ui', 'modules', 'hookapi'];
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const { recorderManifest } = require('./provenance.cjs');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

// The hook contract. Member names that carry a game-invented word are listed under a neutral name (runtime-names.cjs).
// The calibration members go to the private sidecar.
const { NEUTRAL_MEMBERS } = require('./runtime-names.cjs');
const PRIVATE_MEMBERS = new Set(['calib', 'calibFly', 'calibSpawn']);
// The app's automation shim (hard rule: tests never capture the machine's pointer): a page that looks WebDriver-driven
// must get the emulated lock; the "real" lock, fullscreen and keyboard lock are traps that count calls.
async function pointerLockShim(rt, recording) {
  const page = await createPage(rt, { audio: false, automation: true }), w = page.window, doc = page.document, world = page.el('world');
  const r = { emulated: w.__LB_EMULATED_POINTER_LOCK__ === true };
  await page.click('start'); await page.advance(50);
  r.runningAfterStart = page.app.running; r.lockedAfterStart = doc.pointerLockElement === world;
  await page.click('menuButton'); await page.advance(50);
  r.pausedAfterMenu = !page.app.running; r.unlockedAfterPause = !doc.pointerLockElement;
  Object.assign(r, { realLockCalls: page.counters.realLockCalls, realExitCalls: page.counters.realExitCalls, fullscreenCalls: page.counters.fullscreenCalls, keyboardLockCalls: page.counters.keyboardLockCalls });
  const ok = r.emulated && r.runningAfterStart && r.lockedAfterStart && r.pausedAfterMenu && r.unlockedAfterPause && !r.realLockCalls && !r.realExitCalls && !r.fullscreenCalls && !r.keyboardLockCalls;
  if (recording && !ok) throw Error('automation pointer-lock boot: the page did not emulate the lock ' + JSON.stringify(r));
  return r;
}
async function hookapi(rt, { golden }) {
  const page = await createPage(rt, { audio: false }), app = page.app, members = {}, priv = {};
  for (const k of Object.getOwnPropertyNames(app).sort()) { const d = Object.getOwnPropertyDescriptor(app, k), kind = d.get ? (d.set ? 'getter+setter' : 'getter') : typeof d.value === 'function' ? 'function' : typeof d.value;
    if (PRIVATE_MEMBERS.has(k)) priv[k] = kind; else members[NEUTRAL_MEMBERS[k] || k] = kind; }
  const diag = Object.keys(page.diag()), sorted = o => Object.fromEntries(Object.entries(o).sort((a, b) => a[0] < b[0] ? -1 : 1));
  return { suite: 'hookapi', meta: { note: 'members of the object the app hands to window.__LB_EXPOSE__ (tests only) and the top-level keys of trainerDiagnostics(): a contract, members may be added (a check accepts a superset), never removed or renamed until the S8 split ends; names with a game-invented word are listed under a neutral name (runtime-names.cjs)' },
    exposed: sorted(members), count: Object.keys(members).length, trainerDiagnostics: diag.filter(k => !PRIVATE_MEMBERS.has(k)).sort(), globalsRead: ['__LB_EXPOSE__', '__LB_SYNC__', '__LB_MANUAL_CLOCK__', '__LB_REAL_POINTER_LOCK__'],
    automationPointerLock: await pointerLockShim(rt, !golden),
    __private: { suite: 'hookapi-private', note: 'private: the calibration members of the hook object and of trainerDiagnostics (never published)', exposed: sorted(priv), trainerDiagnostics: diag.filter(k => PRIVATE_MEMBERS.has(k)).sort() } };
}
async function main() {
  const t0 = Date.now(), src = path.resolve(arg('src')), template = path.resolve(arg('template')), inputs = path.resolve(arg('inputs')), out = arg('out') && path.resolve(arg('out')), check = arg('check') && path.resolve(arg('check'));
  const privateOut = arg('private-out') && path.resolve(arg('private-out')), privateCheck = arg('private-check') && path.resolve(arg('private-check')), reportFile = arg('report') && path.resolve(arg('report'));
  const suites = (arg('suites', ALL.join(','))).split(','), quiet = process.argv.includes('--quiet'), wordingStep = process.argv.includes('--wording-step');
  const log = (...a) => { if (!quiet) console.log(...a); };
  const rt = loadRuntime({ src, template });
  const inputsManifest = JSON.parse(fs.readFileSync(path.join(inputs, 'MANIFEST.json'), 'utf8'));
  for (const f of inputsManifest.files) { if (sha(fs.readFileSync(path.join(inputs, f.file))) !== f.sha256) throw Error('input fixture changed: ' + f.file); }
  const results = {}, privates = {}, timings = {};
  for (const name of suites) {
    const t = Date.now(), golden = check ? JSON.parse(fs.readFileSync(path.join(check, name + '.json'), 'utf8')) : null;
    const r = name === 'hookapi' ? await hookapi(rt, { golden }) : await require('./suites/' + name + '.cjs').record(rt, { inputs, golden, log: (...a) => log('  ', ...a) });
    if (r.__private) { privates[name] = r.__private; delete r.__private; }
    results[name] = r;
    timings[name] = +((Date.now() - t) / 1000).toFixed(1); log(`${name}: ${timings[name]} s`);
    if (name === 'flight') { const f = results.flight, p = f.meta.parityScript; results.parity = { suite: 'parity', meta: { note: 'parity input script (D7): generator session-v1 of suites/flight.cjs, run through physics.js input path and Flight; parity() must return this digest' }, generator: p.generator, seconds: p.seconds, seed: p.seed, frames: p.frames, framesSha256: p.framesSha256, config: f.meta.configs[p.config], expected: { final: f.runs[p.run].final, checkpointHex: f.runs[p.run].checkpointHex } }; }
  }
  const recorder = recorderManifest();
  const meta = { recorder: RECORDER_VERSION, recorderManifest: recorder, node: process.version, suites: Object.keys(results), srcManifest: rt.manifest, inputs: inputsManifest.files.map(f => ({ file: f.file, sha256: f.sha256 })),
    realms: { three: 'own vm realm, Math.random = LCG stream T', game: 'page realm, Math.random = LCG stream G (seeds per suite)', clock: 'performance.now = harness clock; frames 100 Hz; physics 120 Hz' } };
  const writeDir = (dir, files, withMeta) => {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, r] of Object.entries(files)) fs.writeFileSync(path.join(dir, name + '.json'), stableStringify(r));
    if (withMeta) fs.writeFileSync(path.join(dir, 'meta.json'), stableStringify(meta));
    const list = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'MANIFEST.json').sort();
    fs.writeFileSync(path.join(dir, 'MANIFEST.json'), stableStringify({ files: list.map(f => { const b = fs.readFileSync(path.join(dir, f)); return { file: f, bytes: b.length, sha256: sha(b) }; }) }));
  };
  if (out) writeDir(out, results, true);
  if (privateOut) writeDir(privateOut, privates, false);
  let failed = 0; const report = { wordingStep, suites: {} };
  if (check) {
    // The recorder must be the one that recorded the goldens (or a change proven neutral by prove-recorder.cjs).
    const gm = JSON.parse(fs.readFileSync(path.join(check, 'meta.json'), 'utf8')), gr = gm.recorderManifest || {};
    const changed = [...new Set([...Object.keys(gr), ...Object.keys(recorder)])].filter(k => !gr[k] || !recorder[k] || gr[k].sha256_lf !== recorder[k].sha256_lf).sort();
    report.recorder = { same: !changed.length, changed }; if (changed.length) failed++;
    console.log(`${changed.length ? 'DIFF' : 'SAME'} recorder${changed.length ? ' ' + JSON.stringify(changed) + ' (a recorder change must be proven with prove-recorder.cjs)' : ''}`);
    const cmp = (dir, set) => { for (const [name, r] of Object.entries(set)) {
      if (!fs.existsSync(path.join(dir, name + '.json'))) continue;
      const c = compareSuite(set === privates ? name + '-private' : name, JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8')), JSON.parse(stableStringify(r)), { wordingStep });
      if (!c.strictEqual) failed++; report.suites[name + (set === privates ? ' (private)' : '')] = c;
      console.log(`${c.strictEqual ? 'SAME' : 'DIFF'} ${name}${set === privates ? '-private' : ''}${c.findings.length ? ' ' + JSON.stringify(c.findings.slice(0, 3)) : ''}`);
    } };
    cmp(check, results); if (privateCheck) cmp(privateCheck, privates);
  }
  if (reportFile) fs.writeFileSync(reportFile, JSON.stringify(report, null, 1) + '\n');
  log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s` + (check ? `, ${failed} difference(s)` : ''));
  if (failed) process.exit(1);
}
main().catch(e => { console.error(e && e.stack || e); process.exit(2); });
