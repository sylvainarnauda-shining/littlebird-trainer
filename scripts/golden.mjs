#!/usr/bin/env node
// Golden fixtures of the trainer (gates G2a-G2g, CONTRIBUTING.md): a thin wrapper that runs the golden recorder in tools/golden
// with this repository's paths. The recorder's files are pinned by tests/fixtures/golden/meta.json (recorderManifest):
// they are never edited in place without proving the change neutral (`prove`).
//   node scripts/golden.mjs check [--suites a,b] [--wording-step] [--report <file>]
//       replay every suite with the goldens' own settings and compare (exit 1 on any strict difference)
//   node scripts/golden.mjs record --out <dir>
//       a fresh recording into a scratch folder (never into the goldens)
//   node scripts/golden.mjs update --reason "<why>"
//       re-record into tests/fixtures/golden: only for a declared behaviour step (commit trailer
//       "Golden-Update: <why>", CHANGELOG entry, fidelity suite green); never to make a refactor pass
//   node scripts/golden.mjs prove [--baseline-ref <git ref> | --baseline-src <dir> --baseline-template <file>] [--adopt]
//       a recorder change is neutral if the runtime the goldens were recorded on (the committed runtime at the ref,
//       default HEAD, or a runtime folder) recorded with the changed recorder reproduces every fixture byte for byte;
//       --adopt then rewrites meta.json and MANIFEST.json
//   node scripts/golden.mjs gate [--baseline-ref <git ref> | --baseline-src <dir> --baseline-template <file>] [--jobs N]
//       the full gate of tools/golden/gate.cjs (three recordings, determinism, baseline identity, coverage, check mode
//       in both orders, mutation smoke test), then the installed goldens against the fresh recording
//   node scripts/golden.mjs baseline --ref <git ref> --out <dir>
//       extract the runtime files the recorder reads, as committed at a ref
// Scratch output goes to test-results/golden/ (ignored by git) unless --scratch is given.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = {
  recorder: path.join(ROOT, 'tools', 'golden'),
  src: path.join(ROOT, 'src'),
  template: path.join(ROOT, 'src', 'index.template.html'),
  inputs: path.join(ROOT, 'tests', 'fixtures'),
  golden: path.join(ROOT, 'tests', 'fixtures', 'golden'),
};
export const SUITES = ['flight', 'sessions', 'world', 'audio', 'hud', 'settings', 'models', 'ui', 'modules', 'hookapi'];
export const RUNTIME_FILES = [
  'world.js',
  'physics.js',
  'forest.js',
  'scenery.js',
  'missiles.js',
  'audio.js',
  'models.js',
  'ground.js',
  'bot.js',
  'app.js',
  'vendor/three.min.js',
];
export const PATHS = P;

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 ? argv[i + 1] : d;
};
const flag = (k) => argv.includes('--' + k);
const scratchDir = (name) => path.resolve(opt('scratch', path.join(ROOT, 'test-results', 'golden', name)));

export function runNode(args, { quiet = false } = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '',
      err = '';
    p.stdout.on('data', (d) => {
      out += d;
      if (!quiet) process.stdout.write(d);
    });
    p.stderr.on('data', (d) => {
      err += d;
      if (!quiet) process.stderr.write(d);
    });
    p.on('close', (code) => resolve({ code, out, err }));
  });
}
export const checkArgs = (suites, extra = []) => [
  path.join(P.recorder, 'record.cjs'),
  '--src',
  P.src,
  '--template',
  P.template,
  '--inputs',
  P.inputs,
  '--check',
  P.golden,
  '--suites',
  suites.join(','),
  '--quiet',
  ...extra,
];

// The runtime files as committed at a ref, in the layout the recorder reads (vendor/ and the template beside them),
// with line endings normalised to LF as the working tree has them (the G0 comparison is on LF-normalised bytes; the
// R0 import commit still holds models.js with CRLF, which only changes the raw sha256 of meta.json's srcManifest).
export function extractBaseline(ref, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'vendor'), { recursive: true });
  for (const f of [...RUNTIME_FILES, 'index.template.html']) {
    const r = spawnSync('git', ['show', `${ref}:src/${f}`], { cwd: ROOT, maxBuffer: 1 << 28 });
    if (r.status !== 0) throw Error(`git show ${ref}:src/${f} failed: ${String(r.stderr).trim()}`);
    const bytes = f.startsWith('vendor/')
      ? r.stdout
      : Buffer.from(r.stdout.toString('latin1').replace(/\r\n?/g, '\n'), 'latin1');
    fs.writeFileSync(path.join(dir, f), bytes);
  }
  return { src: dir, template: path.join(dir, 'index.template.html') };
}

function sameFixtures(fresh, installed) {
  const diff = [];
  const names = (d) =>
    fs
      .readdirSync(d)
      .filter((f) => f.endsWith('.json'))
      .sort();
  const a = names(fresh),
    b = names(installed);
  if (a.join() !== b.join()) diff.push({ files: { fresh: a, installed: b } });
  for (const f of a) {
    if (!b.includes(f) || f === 'MANIFEST.json') continue;
    if (f === 'meta.json') {
      // The source manifest names the bytes that were recorded (raw and LF sha256); the data is what must match.
      const strip = (p) => {
        const m = JSON.parse(fs.readFileSync(p, 'utf8'));
        delete m.srcManifest;
        return JSON.stringify(m);
      };
      if (strip(path.join(fresh, f)) !== strip(path.join(installed, f))) diff.push({ file: f, outside: 'srcManifest' });
      continue;
    }
    if (!fs.readFileSync(path.join(fresh, f)).equals(fs.readFileSync(path.join(installed, f)))) diff.push({ file: f });
  }
  return diff;
}

async function main() {
  const cmd = argv[0];
  if (cmd === 'check') {
    const suites = opt('suites', SUITES.join(',')).split(',');
    const extra = [];
    if (flag('wording-step')) extra.push('--wording-step');
    if (opt('report')) extra.push('--report', path.resolve(opt('report')));
    const r = await runNode(checkArgs(suites, extra));
    process.exit(r.code);
  }
  if (cmd === 'record') {
    const out = opt('out');
    if (!out) throw Error('record needs --out <dir> (a scratch folder; goldens are updated with `update --reason`)');
    const r = await runNode([
      path.join(P.recorder, 'record.cjs'),
      '--src',
      P.src,
      '--template',
      P.template,
      '--inputs',
      P.inputs,
      '--out',
      path.resolve(out),
    ]);
    process.exit(r.code);
  }
  if (cmd === 'update') {
    const reason = opt('reason');
    if (!reason || reason.length < 10)
      throw Error('update needs --reason "<why the behaviour changed>" (goldens are never regenerated for a refactor)');
    const out = scratchDir('update');
    fs.rmSync(out, { recursive: true, force: true });
    const r = await runNode([
      path.join(P.recorder, 'record.cjs'),
      '--src',
      P.src,
      '--template',
      P.template,
      '--inputs',
      P.inputs,
      '--out',
      out,
      '--quiet',
    ]);
    if (r.code !== 0) process.exit(r.code);
    for (const f of fs.readdirSync(out)) fs.copyFileSync(path.join(out, f), path.join(P.golden, f));
    console.log(
      `Goldens re-recorded into tests/fixtures/golden. Commit them with the trailer "Golden-Update: ${reason}" and a CHANGELOG entry.`,
    );
    return;
  }
  if (cmd === 'baseline') {
    const b = extractBaseline(opt('ref', 'HEAD'), path.resolve(opt('out')));
    console.log('runtime extracted to ' + b.src);
    return;
  }
  if (cmd === 'prove') {
    const dir = scratchDir('prove');
    // The runtime the goldens were recorded on: a git ref (default HEAD), or a folder (--baseline-src and
    // --baseline-template), e.g. the frozen baseline whose raw bytes the goldens' srcManifest names.
    const base = opt('baseline-src')
      ? { src: path.resolve(opt('baseline-src')), template: path.resolve(opt('baseline-template')) }
      : extractBaseline(opt('baseline-ref', 'HEAD'), path.join(dir, 'baseline'));
    const args = [
      path.join(P.recorder, 'prove-recorder.cjs'),
      '--baseline-src',
      base.src,
      '--baseline-template',
      base.template,
      '--inputs',
      P.inputs,
      '--golden',
      P.golden,
      '--scratch',
      path.join(dir, 'run'),
    ];
    if (flag('adopt')) args.push('--adopt');
    const r = await runNode(args);
    process.exit(r.code);
  }
  if (cmd === 'gate') {
    const dir = scratchDir('gate');
    const base = opt('baseline-src')
      ? { src: path.resolve(opt('baseline-src')), template: path.resolve(opt('baseline-template')) }
      : extractBaseline(opt('baseline-ref', 'HEAD'), path.join(dir, 'baseline'));
    const r = await runNode([
      path.join(P.recorder, 'gate.cjs'),
      '--src',
      P.src,
      '--template',
      P.template,
      '--baseline-src',
      base.src,
      '--baseline-template',
      base.template,
      '--inputs',
      P.inputs,
      '--scratch',
      path.join(dir, 'run'),
      '--jobs',
      opt('jobs', '4'),
    ]);
    if (r.code !== 0) process.exit(r.code);
    const diff = sameFixtures(path.join(dir, 'run', 'record-1', 'fixtures'), P.golden);
    console.log(
      `${diff.length ? 'FAIL' : 'PASS'} the installed goldens equal the fresh recording${diff.length ? ' ' + JSON.stringify(diff) : ''}`,
    );
    process.exit(diff.length ? 1 : 0);
  }
  console.log('usage: node scripts/golden.mjs check|record|update|prove|gate|baseline (see the header of this file)');
  process.exit(2);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e && e.message ? e.message : e);
    process.exit(2);
  });
}
