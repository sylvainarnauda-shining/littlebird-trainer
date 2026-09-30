'use strict';
// Proof that a recorder change is neutral (the rule that keeps a recorder change from passing for a runtime change):
// the frozen baseline is recorded with the current recorder and every fixture must equal the installed goldens byte
// for byte, except meta.json, where only the recorder version and recorderManifest may differ (and MANIFEST.json, for
// meta.json's own line). A change that moves anything else is a golden update: declare it as such (Golden-Update).
//   node prove-recorder.cjs --baseline-src <dir> --baseline-template <file> --inputs <dir> --golden <dir>
//                           [--private-golden <dir>] --scratch <dir> [--adopt]
// --adopt: on success, writes the new meta.json and MANIFEST.json into the golden folder (the recorder is then the one
// the goldens name).
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? path.resolve(process.argv[i + 1]) : null; };
const base = { src: arg('baseline-src'), template: arg('baseline-template') }, inputs = arg('inputs'), golden = arg('golden'), privateGolden = arg('private-golden'), scratch = arg('scratch');
const out = path.join(scratch, 'fixtures'), priv = path.join(scratch, 'private');
fs.rmSync(scratch, { recursive: true, force: true }); fs.mkdirSync(scratch, { recursive: true });
const t0 = Date.now(), r = spawnSync(process.execPath, [path.join(__dirname, 'record.cjs'), '--src', base.src, '--template', base.template, '--inputs', inputs, '--out', out, '--private-out', priv, '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 26 });
if (r.status !== 0) { console.error('recording failed: ' + (r.stderr || r.stdout).slice(-2000)); process.exit(2); }
const diff = [];
const sameDir = (a, b, skip = new Set()) => {
  const fa = fs.readdirSync(a).filter(f => !skip.has(f)).sort(), fb = fs.readdirSync(b).filter(f => !skip.has(f)).sort();
  if (fa.join() !== fb.join()) diff.push({ dir: path.basename(b), files: { golden: fb, now: fa } });
  for (const f of fa) if (fb.includes(f) && !fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f)))) diff.push({ file: path.basename(b) + '/' + f });
};
sameDir(out, golden, new Set(['meta.json', 'MANIFEST.json']));
{ const strip = f => { const m = JSON.parse(fs.readFileSync(f, 'utf8')); delete m.recorder; delete m.recorderManifest; return JSON.stringify(m); };
  if (strip(path.join(out, 'meta.json')) !== strip(path.join(golden, 'meta.json'))) diff.push({ file: 'meta.json', note: 'differs outside recorder/recorderManifest' }); }
if (privateGolden) sameDir(priv, privateGolden);
const ok = !diff.length, adopt = ok && process.argv.includes('--adopt');
if (adopt) for (const f of ['meta.json', 'MANIFEST.json']) fs.copyFileSync(path.join(out, f), path.join(golden, f));
const report = { node: process.version, neutral: ok, adopted: adopt, seconds: +((Date.now() - t0) / 1000).toFixed(1), diff };
fs.writeFileSync(path.join(scratch, 'prove-recorder.json'), JSON.stringify(report, null, 1) + '\n');
console.log(ok ? `NEUTRAL recorder change${adopt ? ' (adopted: meta.json and MANIFEST.json rewritten)' : ''}` : 'NOT NEUTRAL ' + JSON.stringify(diff.slice(0, 5)));
process.exit(ok ? 0 : 1);
