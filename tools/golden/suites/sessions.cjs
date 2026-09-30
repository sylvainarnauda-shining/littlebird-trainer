'use strict';
// G2b: whole-session goldens, one scripted session per mode (the nine modes for 62 s) and per option variant (shorter),
// app booted as a page with the explicit settings saved as its profile (revision 16) and the map in the address
// (#carte=...), streams G and T seeded, frames at 100 Hz. A checkpoint every 100 frames (1 s = 120 physics steps):
// per-group digests (probe.cjs) with the HUD draw log of that frame; a diagnostic sample every second; the result card
// at every end of session; coverage counters and exercise ratios at the end.
// Exercise (recording refuses less; the counters are stored, so a check compares them): at least 90 % of the frames
// driven by the script, and at the checkpoints where the session runs, the flight group changes at 90 % of them and
// the helicopter moves more than 5 cm since the previous checkpoint at EXERCISE.minMoving of them.
// Check mode hands the golden's probeSchema to the probe (fields added by a refactor are not hashed).
const { createPage } = require('../harness.cjs');
const { Hasher, fromHex } = require('../canon.cjs');
const { Probe, checkpoint } = require('../probe.cjs');
const { sceneDigest, canvasDigests } = require('../scene.cjs');
const { GOLDEN_BASE, GOLDEN_BINDINGS, SCENARIOS, SCRIPTS, framesOf, Pilot, Coverage } = require('../scenarios.cjs');

const SEED_T = 160, EVERY = 100;
const EXERCISE = { minScripted: .9, minFlightChange: .9, minMoving: .9, movedMetres: .05 };
// The app's DEFAULTS, read from a boot with empty storage (record mode only), and the goldens' explicit bindings.
async function readDefaults(rt) {
  const page = await createPage(rt, { audio: false });
  return { settings: JSON.parse(JSON.stringify(page.app.cfg)), bindings: { ...GOLDEN_BINDINGS } };
}
function buildSettings(defaults, id) { return { ...defaults.settings, ...GOLDEN_BASE, ...SCENARIOS[id].settings }; }
const STOP = Symbol('frame budget exhausted');

// Where the session put the enemies and which map it loaded (option coverage of the variants).
function startGeometry(page, sc) {
  const a = page.app, T = page.window.THREE, W = page.window.HeliWorld, f = a.flight, fwd = new T.Vector3(0, 0, -1).applyQuaternion(f.quaternion);
  let behind = 0, band = 0;
  for (const t of a.bots) { const d = t.bot.flight.position.clone().sub(f.position); if (d.dot(fwd) < 0) behind++; const hz = Math.hypot(d.x, d.z); if (hz >= 850 && hz <= 1650) band++; }
  return { botsBehindAtStart: behind, botsInBandAtStart: band, randomMap: W.generated && W.id !== sc.map ? 1 : 0 };
}
function exercise(checkpoints, samples) {
  let active = 0, changed = 0, moving = 0;
  for (let i = 1; i < samples.length; i++) {
    if (!samples[i].running || !samples[i - 1].running) continue; active++;
    if (checkpoints[i].groups.flight !== checkpoints[i - 1].groups.flight) changed++;
    const p = samples[i].p.map(fromHex), q = samples[i - 1].p.map(fromHex); if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > EXERCISE.movedMetres) moving++;
  }
  return { activeCheckpoints: active, flightChangedCheckpoints: changed, movingCheckpoints: moving };
}

async function runSession(rt, id, { settings, bindings, frames = framesOf(id), schema = null, log = () => {} }) {
  const sc = SCENARIOS[id];
  const storage = { 'littlebird-range-v1': JSON.stringify({ version: 1, tuningRevision: 16, settings, bindings }) };
  if (sc.storageMap) storage['littlebird-map'] = JSON.stringify(sc.storageMap);
  const page = await createPage(rt, { seedG: sc.seedG, seedT: SEED_T, storage, hash: '#carte=' + sc.map });
  page.audioLog = new Hasher();
  const probe = new Probe(page, { schema }), cov = new Coverage(page), checkpoints = [], samples = [];
  let frame = 0, scripted = 0, inScript = false;
  const tick = async () => {
    if (frame >= frames) return false;
    frame++; if (inScript) scripted++;
    const rec = frame % EVERY === 0; let hud = null, hudText = null;
    if (rec) { hud = new Hasher(); hudText = new Hasher(); page.hudSink(hud, hudText); }
    await page.frame();
    if (rec) { page.hudSink(null); checkpoints.push(checkpoint(frame, probe.groups(hud.digest(), hudText.digest()))); samples.push({ t: frame, running: page.app.running, alive: page.app.heliAlive, ...probe.sample() }); }
    cov.update(); return true;
  };
  const pl = new Pilot(page, async () => { if (!(await tick())) throw STOP; });
  await page.click('start');
  if (!page.app.running) throw Error(id + ': session did not start');
  const start = startGeometry(page, sc);
  const sceneAtStart = sceneDigest(page.app.scene, page.window.THREE);   // G2g: the mode's scene as start() leaves it
  inScript = true;
  try { await SCRIPTS[id](pl); } catch (e) { if (e !== STOP) throw e; }
  inScript = false;
  while (frame < frames) await tick();
  const errors = page.consoleLog.filter(x => x.level === 'error');
  if (errors.length) throw Error(id + ': console errors ' + JSON.stringify(errors.slice(0, 3)));
  Object.assign(cov.c, start, { scriptedFrames: scripted, restarts: pl.restarts, resupplies: pl.resupplies }, exercise(checkpoints, samples));
  const c = cov.c, missing = sc.required.filter(k => !(c[k] > 0)), short = [];
  if (c.scriptedFrames < EXERCISE.minScripted * frames) short.push(`scriptedFrames ${c.scriptedFrames}/${frames}`);
  if (c.flightChangedCheckpoints < EXERCISE.minFlightChange * c.activeCheckpoints) short.push(`flightChangedCheckpoints ${c.flightChangedCheckpoints}/${c.activeCheckpoints}`);
  if (c.movingCheckpoints < EXERCISE.minMoving * c.activeCheckpoints) short.push(`movingCheckpoints ${c.movingCheckpoints}/${c.activeCheckpoints}`);
  log(id, JSON.stringify(Object.fromEntries([...sc.required, 'scriptedFrames', 'activeCheckpoints', 'flightChangedCheckpoints', 'movingCheckpoints', 'finished', 'restarts'].map(k => [k, c[k]]))));
  const sceneAtEnd = sceneDigest(page.app.scene, page.window.THREE);
  const scene = { start: sceneAtStart.digest, startCounts: sceneAtStart.counts, end: sceneAtEnd.digest, endCounts: sceneAtEnd.counts, canvases: canvasDigests(page.document) };
  return { id, page, required: sc.required, missing, short, coverage: c, checkpoints, samples, scene, results: cov.results, schema: probe.schemaJSON(), framesRun: frame };
}

async function record(rt, { only = null, golden = null, log = () => {} } = {}) {
  const defaults = golden ? null : await readDefaults(rt);
  const out = { suite: 'sessions', meta: { checkpointEvery: EVERY, exercise: EXERCISE }, scenarios: {} };
  for (const id of Object.keys(SCENARIOS)) {
    if (only && !only.includes(id)) continue;
    const g = golden && golden.scenarios[id]; if (golden && !g) continue;
    const settings = g ? g.meta.settings : buildSettings(defaults, id), bindings = g ? g.meta.bindings : defaults.bindings;
    const r = await runSession(rt, id, { settings, bindings, frames: g ? g.meta.frames : framesOf(id), schema: g ? g.meta.probeSchema : null, log });
    // Recording refuses a scenario that exercised nothing or idled; a check reports the drop through the coverage comparison.
    if (!golden && (r.missing.length || r.short.length)) throw Error(`scenario ${id}: ${r.missing.length ? 'coverage counters at zero: ' + r.missing.join(', ') : ''} ${r.short.join(', ')} (${JSON.stringify(r.coverage)})`);
    const sc = SCENARIOS[id];
    out.scenarios[id] = { meta: { seedG: sc.seedG, seedT: SEED_T, map: sc.map, storageMap: sc.storageMap || null, variantOf: sc.variantOf || null, option: sc.option || null, frames: r.framesRun, frameMs: 10, checkpointEvery: EVERY,
      settings, bindings, required: r.required, probeSchema: g ? g.meta.probeSchema : r.schema }, coverage: r.coverage, scene: r.scene, results: r.results, checkpoints: r.checkpoints, samples: r.samples };
  }
  return out;
}
module.exports = { record, runSession, readDefaults, buildSettings, EXERCISE };
