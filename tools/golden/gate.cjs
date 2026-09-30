'use strict';
// Gate of the goldens (paths given on the command line):
//  1. three recordings in separate processes: the runtime twice and the frozen baseline copy once (fixtures and the
//     private sidecars);
//  2. the two recordings of the runtime are byte-identical;
//  3. the recording of the baseline is byte-identical to them;
//  4. exercise: every session scenario's required coverage counters above zero and its exercise ratios at or above the
//     thresholds; the HUD fixed states over a live helicopter; the Verba reload race gone from the module goldens
//     (fix R5.7) while their gunners still reload after launching;
//     the touchdowns straddling every crash threshold; the automation pointer-lock boot emulated with no real call;
//  5. check mode on the unmodified runtime: every suite SAME, the recorder SAME, the private sidecars SAME;
//  6. check mode with the suites in reverse order: every suite SAME (no suite depends on another);
//  7. the mutation smoke test (mutation-smoke.cjs) against the new goldens;
//  8. optionally a privacy scan of the public fixtures (an external, private script: --privacy <script>, run as
//     node <script> <fixture dir>; exit 0 = clean).
// On success the first recording is installed (--install <dir>, --install-private <dir>).
//   node gate.cjs --src <runtime> --template <file> --baseline-src <dir> --baseline-template <file> --inputs <dir>
//                 --scratch <dir> [--install <dir>] [--install-private <dir>] [--privacy <script>] [--jobs 4]
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? path.resolve(process.argv[i + 1]) : null; };
const A = { src: arg('src'), template: arg('template') }, BASE = { src: arg('baseline-src'), template: arg('baseline-template') }, inputs = arg('inputs'), scratch = arg('scratch');
const install = arg('install'), installPrivate = arg('install-private'), privacy = arg('privacy'), jobs = (() => { const i = process.argv.indexOf('--jobs'); return i > 0 ? process.argv[i + 1] : '4'; })();
const ALL = ['flight', 'sessions', 'world', 'audio', 'hud', 'settings', 'models', 'ui', 'modules', 'hookapi'];
const node = (args) => new Promise(resolve => { const t0 = Date.now(), p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = '';
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d); p.on('close', code => resolve({ code, out, err, seconds: +((Date.now() - t0) / 1000).toFixed(1) })); });
const rec = (who, dir) => node([path.join(__dirname, 'record.cjs'), '--src', who.src, '--template', who.template, '--inputs', inputs, '--out', path.join(dir, 'fixtures'), '--private-out', path.join(dir, 'private'), '--quiet']);
function sameDir(a, b) {
  const fa = fs.readdirSync(a).sort(), fb = fs.readdirSync(b).sort(), diff = [];
  if (fa.join() !== fb.join()) diff.push({ files: { a: fa, b: fb } });
  for (const f of fa) if (fb.includes(f) && !fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f)))) diff.push({ file: f });
  return { identical: !diff.length, files: fa.length, diff };
}
const report = { node: process.version, steps: [] }; let ok = true;
const step = (name, pass, info) => { report.steps.push({ name, pass, ...info }); if (!pass) ok = false; console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(info).slice(0, 1500)}`); };
(async () => {
  fs.mkdirSync(scratch, { recursive: true });
  const d1 = path.join(scratch, 'record-1'), d2 = path.join(scratch, 'record-2'), db = path.join(scratch, 'record-baseline');
  for (const d of [d1, d2, db]) fs.rmSync(d, { recursive: true, force: true });
  const [r1, r2, rb] = await Promise.all([rec(A, d1), rec(A, d2), rec(BASE, db)]);
  for (const [n, r] of [['runtime 1', r1], ['runtime 2', r2], ['baseline', rb]]) if (r.code !== 0) { step('recording ' + n, false, { exit: r.code, stderr: r.err.slice(-1500) }); }
  if (!ok) { fs.writeFileSync(path.join(scratch, 'gate-report.json'), JSON.stringify(report, null, 1) + '\n'); console.log('GATE FAILED'); process.exit(1); }
  const f1 = path.join(d1, 'fixtures'), p1 = path.join(d1, 'private');
  { const c = sameDir(f1, path.join(d2, 'fixtures')), p = sameDir(p1, path.join(d2, 'private')); step('two independent recordings are byte-identical', c.identical && p.identical, { files: c.files, privateFiles: p.files, diff: [...c.diff, ...p.diff], seconds: [r1.seconds, r2.seconds] }); }
  { const c = sameDir(f1, path.join(db, 'fixtures')), p = sameDir(p1, path.join(db, 'private')); step('the baseline copy records the same goldens', c.identical && p.identical, { files: c.files, privateFiles: p.files, diff: [...c.diff, ...p.diff], seconds: rb.seconds }); }
  { const J = f => JSON.parse(fs.readFileSync(path.join(f1, f), 'utf8')), s = J('sessions.json'), ex = s.meta.exercise, zero = [], short = [];
    for (const [id, sc] of Object.entries(s.scenarios)) { const c = sc.coverage;
      for (const k of sc.meta.required) if (!(c[k] > 0)) zero.push(id + '.' + k);
      if (c.scriptedFrames < ex.minScripted * sc.meta.frames) short.push(id + '.scriptedFrames');
      if (c.flightChangedCheckpoints < ex.minFlightChange * c.activeCheckpoints) short.push(id + '.flightChangedCheckpoints');
      if (c.movingCheckpoints < ex.minMoving * c.activeCheckpoints) short.push(id + '.movingCheckpoints'); }
    const hud = J('hud.json'), hudBad = Object.entries(hud.runs).filter(([, r]) => !r.aliveBeforeFixed || !r.runningBeforeFixed || r.fixed.cockpit === r.fixed.freeLook).map(([k]) => k);
    const mod = J('modules.json'), race = mod.ground.verbaReloadSkipped.count, reloads = mod.ground.verbaReloadStarted ? mod.ground.verbaReloadStarted.count : 0;
    const fl = J('flight.json'), td = Object.entries(fl.runs).filter(([k]) => k.startsWith('touchdown-')), tdBad = td.filter(([k, r]) => r.outcome.crashed !== /^touchdown-(fast|hard-4\.8|tilt-35)/.test(k) || !r.outcome.touched).map(([k]) => k);
    const lock = J('hookapi.json').automationPointerLock, lockOk = lock.emulated && lock.lockedAfterStart && lock.unlockedAfterPause && !lock.realLockCalls && !lock.realExitCalls && !lock.fullscreenCalls && !lock.keyboardLockCalls;
    step('exercise and coverage', !zero.length && !short.length && !hudBad.length && race === 0 && reloads > 0 && td.length >= 10 && !tdBad.length && lockOk, { scenarios: Object.keys(s.scenarios).length, required: Object.values(s.scenarios).reduce((n, sc) => n + sc.meta.required.length, 0), zero, short, exercise: ex,
      hudFixedStatesBad: hudBad, verbaReloadSkipped: race, verbaReloadStarted: reloads, touchdowns: td.length, touchdownsBad: tdBad, automationPointerLock: lock }); }
  const check = async (suites, label) => {
    const r = await node([path.join(__dirname, 'record.cjs'), '--src', A.src, '--template', A.template, '--inputs', inputs, '--check', f1, '--private-check', p1, '--suites', suites.join(','), '--quiet']);
    const lines = r.out.split(/\r?\n/).filter(l => /^(SAME|DIFF) /.test(l));
    step(label, r.code === 0 && lines.length >= suites.length + 2 && lines.every(l => l.startsWith('SAME')), { output: lines.map(l => l.slice(0, 200)), exit: r.code, seconds: r.seconds, stderr: r.err.slice(-500) });
  };
  await check(ALL, 'check mode on the unmodified runtime');
  await check([...ALL].reverse(), 'check mode with the suites in reverse order');
  { const r = await node([path.join(__dirname, 'mutation-smoke.cjs'), '--src', A.src, '--template', A.template, '--inputs', inputs, '--golden', f1, '--private-golden', p1, '--scratch', path.join(scratch, 'mutants'), '--jobs', jobs]);
    step('mutation smoke test', r.code === 0, { output: r.out.trim().split(/\r?\n/), seconds: r.seconds, stderr: r.err.slice(-500) }); }
  if (privacy) { const r = await node([privacy, f1]); step('privacy scan of the public fixtures', r.code === 0, { output: r.out.trim().split(/\r?\n/).slice(0, 40), seconds: r.seconds }); }
  const put = (from, to) => { fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(to, { recursive: true }); for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f)); };
  if (ok && install) { put(f1, install); report.installed = true; }
  if (ok && installPrivate) { put(p1, installPrivate); report.installedPrivate = true; }
  fs.writeFileSync(path.join(scratch, 'gate-report.json'), JSON.stringify(report, null, 1) + '\n');
  console.log(ok ? 'GATE PASSED' : 'GATE FAILED'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e && e.stack || e); process.exit(2); });
