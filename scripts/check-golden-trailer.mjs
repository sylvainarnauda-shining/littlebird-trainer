#!/usr/bin/env node
// The Golden-Update protocol, enforced by CI (job golden-update; Node built-ins only). The goldens
// (tests/fixtures/golden/) freeze the trainer's behaviour bit for bit, and `node scripts/golden.mjs update` re-records
// them, so a change that re-records them passes the golden tests by construction. This check makes the reason visible:
//  - golden data changed (any golden file other than meta.json and MANIFEST.json, or meta.json outside its
//    recorderManifest and srcManifest): the pull request description carries a line "Golden-Update: <reason>" (the
//    squash merge copies the description into the commit message) and CHANGELOG.md changes in the same pull request;
//  - the recorder (tools/golden/) changed without any golden data change: the change must be neutral; with --prove the
//    committed runtime is recorded with the changed recorder and every fixture must come out byte for byte
//    (`node scripts/golden.mjs prove`).
// Events (environment, set by the workflow): EVENT=pull_request compares the test merge commit with its first parent
// and reads PR_BODY; EVENT=push to a ci/** branch (PUSH_REF, the maintainer's test of a branch before its pull request)
// compares HEAD with its merge base with origin/main and reads every commit message of the branch, so that the branch
// gets the verdict its pull request will get (the Golden-Update line then goes in a commit message, and again in the
// pull request description); any other EVENT=push compares PUSH_BEFORE with HEAD and reads every commit message of
// that range (a squash merge's message is the pull request description; a fast-forward of several commits may carry
// the line in any of them); any other event (a release run, a manual run, a new tag, a new branch) has no change to
// judge and passes.
//   node scripts/check-golden-trailer.mjs [--prove] [--base <rev> --head <rev> --body <text>]
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN = 'tests/fixtures/golden/';
const RECORDER = 'tools/golden/';
const TRAILER = /^Golden-Update:[ \t]*(\S.{9,})$/m;
// meta.json fields that name what was recorded (the recorder's and the runtime's file hashes), not recorded data.
const META_PROVENANCE = ['recorderManifest', 'srcManifest'];

// Where the Golden-Update line is read, for the failure message: the pull request description, the commit messages of
// a ci/** branch, or the messages of the commits pushed to main (a squash merge copies the description into its own).
const TRAILER_SOURCE = {
  description: ['the pull request description', ''],
  commits: ['a commit message of the ci/** branch', '; repeat it in the pull request description'],
  pushed: ['a message of the pushed commits', ''],
};

// The verdict for one change. changed: the changed paths; meta: {before, after} texts of the goldens' meta.json (null
// when absent); body: the text the trailer is read in; source: what that text is (a key of TRAILER_SOURCE).
export function goldenVerdict({ changed, meta = { before: null, after: null }, body = '', source = 'description' }) {
  const problems = [];
  const golden = changed.filter((f) => f.startsWith(GOLDEN));
  const recorder = changed.filter((f) => f.startsWith(RECORDER));
  const strip = (text) => {
    if (text === null) return null;
    const m = JSON.parse(text);
    for (const k of META_PROVENANCE) delete m[k];
    return JSON.stringify(m);
  };
  const metaData = golden.includes(GOLDEN + 'meta.json') && strip(meta.before) !== strip(meta.after);
  const data = golden.some((f) => f !== GOLDEN + 'meta.json' && f !== GOLDEN + 'MANIFEST.json') || Boolean(metaData);
  if (data) {
    if (!TRAILER.test(body || '')) {
      const [where, then] = TRAILER_SOURCE[source] || TRAILER_SOURCE.description;
      problems.push(
        `the goldens changed: ${where} needs a line "Golden-Update: <reason>" (at least 10 characters)${then}`,
      );
    }
    if (!changed.includes('CHANGELOG.md')) problems.push('the goldens changed: CHANGELOG.md must declare the change');
  }
  return {
    ok: problems.length === 0,
    data,
    recorder: recorder.length > 0,
    prove: recorder.length > 0 && !data,
    problems,
  };
}

// What an event judges, from the workflow's environment: {base, head, body, source} (base 'merge-base' = the merge base
// of HEAD with origin/main; body null = the commit messages of base..head; source: see TRAILER_SOURCE), or null when
// there is nothing to judge.
export function rangeFor(env) {
  const event = env.EVENT || '';
  if (event === 'pull_request') return { base: 'HEAD^1', head: 'HEAD', body: env.PR_BODY || '', source: 'description' };
  if (event === 'push' && /^refs\/heads\/ci\/./.test(env.PUSH_REF || ''))
    return { base: 'merge-base', head: 'HEAD', body: null, source: 'commits' };
  if (event === 'push' && env.PUSH_BEFORE && !/^0+$/.test(env.PUSH_BEFORE))
    return { base: env.PUSH_BEFORE, head: 'HEAD', body: null, source: 'pushed' };
  return null;
}

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(r.stderr).trim().split('\n')[0]}`);
  return r.stdout;
}
const show = (rev, file) => {
  const r = spawnSync('git', ['show', `${rev}:${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  return r.status === 0 ? r.stdout : null;
};
// The newest commit whose runtime is the one the goldens name (meta.json srcManifest, LF sha256): the baseline a
// recorder change is proven on. Searched among HEAD and the last 300 commits that touched src/.
function recordedRuntimeRef(meta) {
  const want = JSON.parse(meta).srcManifest || {};
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const candidates = ['HEAD', ...git(['log', '-n', '300', '--format=%H', 'HEAD', '--', 'src']).split('\n')];
  for (const rev of candidates.filter(Boolean)) {
    const same = Object.entries(want).every(([file, v]) => {
      const r = spawnSync('git', ['show', `${rev}:src/${file}`], { cwd: ROOT, maxBuffer: 1 << 28 });
      if (r.status !== 0) return false;
      const bytes = file.startsWith('vendor/')
        ? r.stdout
        : Buffer.from(r.stdout.toString('latin1').replace(/\r\n?/g, '\n'), 'latin1');
      return sha(bytes) === v.sha256_lf;
    });
    if (same) return rev;
  }
  return null;
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  let base = opt('--base');
  let head = opt('--head');
  let body = opt('--body');
  let source = 'description';
  if (!base) {
    const range = rangeFor(process.env);
    if (!range) {
      console.log(`golden-update: nothing to judge (event ${process.env.EVENT || 'none'})`);
      return;
    }
    ({ base, head, body, source } = range);
    if (base === 'merge-base') {
      base = git(['merge-base', 'HEAD', 'origin/main']).trim();
      console.log(`golden-update: ci/** branch judged against main (merge base ${base.slice(0, 12)})`);
    }
    if (body === null) body = git(['log', '--format=%B%n', `${base}..${head}`]);
  }
  head = head || 'HEAD';
  const changed = git(['diff', '--name-only', '--no-renames', base, head]).split('\n').filter(Boolean);
  const v = goldenVerdict({
    changed,
    meta: { before: show(base, GOLDEN + 'meta.json'), after: show(head, GOLDEN + 'meta.json') },
    body,
    source,
  });
  for (const p of v.problems) console.error('FAIL ' + p);
  if (!v.ok) process.exit(1);
  if (v.data) console.log('golden-update: declared golden change (trailer and CHANGELOG entry present)');
  else if (!v.recorder) console.log('golden-update: no golden change');
  if (v.prove) {
    if (!argv.includes('--prove')) {
      console.log('golden-update: the recorder changed alone; prove it neutral with `node scripts/golden.mjs prove`');
      return;
    }
    const ref = recordedRuntimeRef(show(head, GOLDEN + 'meta.json'));
    if (!ref) {
      console.error('FAIL no commit holds the runtime the goldens name (meta.json srcManifest): re-record them');
      process.exit(1);
    }
    console.log(`golden-update: the recorder changed alone; proving it neutral on the recorded runtime (${ref})`);
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-golden-prove-'));
    const args = [path.join(ROOT, 'scripts', 'golden.mjs'), 'prove', '--baseline-ref', ref, '--scratch', scratch];
    const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
    fs.rmSync(scratch, { recursive: true, force: true });
    if (r.status !== 0) {
      console.error('FAIL the recorder change is not neutral (golden.mjs prove)');
      process.exit(1);
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (e) {
    console.error('golden-update: ' + e.message);
    process.exit(2);
  }
}
