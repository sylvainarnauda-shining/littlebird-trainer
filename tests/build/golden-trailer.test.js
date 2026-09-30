'use strict';
// The Golden-Update protocol (scripts/check-golden-trailer.mjs, CI job golden-update): a change of the golden data needs
// a "Golden-Update: <reason>" line in the pull request description and a CHANGELOG.md entry; the provenance fields of
// meta.json (recorderManifest, srcManifest) and MANIFEST.json are not data; a recorder change alone is proven neutral.
// A ci/** branch pushed for a test run is judged against main with its commit messages as the description, and a push to
// main (a fast-forward of several commits) with the messages of every pushed commit.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { ROOT } = require('../helpers/paths');

const load = () => import(pathToFileURL(path.join(ROOT, 'scripts', 'check-golden-trailer.mjs')).href);
const G = 'tests/fixtures/golden/';
const meta = (extra = {}) =>
  JSON.stringify({
    recorder: 2,
    recorderManifest: { 'a.cjs': { sha256_lf: '1' } },
    srcManifest: { 'app.js': { sha256_lf: '2' } },
    suites: ['ui'],
    ...extra,
  });

test('no golden change: nothing required', async () => {
  const { goldenVerdict } = await load();
  const v = goldenVerdict({ changed: ['src/app.js', 'README.md'] });
  assert.deepEqual([v.ok, v.data, v.prove], [true, false, false]);
});

test('golden data changed: the trailer and a CHANGELOG entry are both required', async () => {
  const { goldenVerdict } = await load();
  let v = goldenVerdict({ changed: [G + 'ui.json', G + 'MANIFEST.json'], body: 'Reword a label' });
  assert.equal(v.ok, false);
  assert.equal(v.problems.length, 2);
  assert.match(v.problems[0], /the pull request description needs a line "Golden-Update: <reason>"/);
  // The message names where the line is read.
  v = goldenVerdict({ changed: [G + 'ui.json', 'CHANGELOG.md'], body: 'x', source: 'commits' });
  assert.match(v.problems[0], /a commit message of the ci\/\*\* branch needs a line .*pull request description/);
  v = goldenVerdict({ changed: [G + 'ui.json', 'CHANGELOG.md'], body: 'x', source: 'pushed' });
  assert.match(v.problems[0], /a message of the pushed commits needs a line/);
  v = goldenVerdict({ changed: [G + 'ui.json', 'CHANGELOG.md'], body: 'Golden-Update: short' });
  assert.equal(v.ok, false, 'a reason of fewer than 10 characters');
  v = goldenVerdict({
    changed: [G + 'ui.json', G + 'MANIFEST.json', 'CHANGELOG.md'],
    body: 'Reword the chase label.\n\nGolden-Update: wording step of the chase-view label',
  });
  assert.deepEqual([v.ok, v.data], [true, true]);
});

test('meta.json: only its provenance fields may change without a declaration', async () => {
  const { goldenVerdict } = await load();
  const before = meta();
  let v = goldenVerdict({
    changed: [G + 'meta.json', G + 'MANIFEST.json'],
    meta: { before, after: meta({ srcManifest: { 'app.js': { sha256_lf: '3' } } }) },
  });
  assert.deepEqual([v.ok, v.data], [true, false]);
  v = goldenVerdict({
    changed: [G + 'meta.json', G + 'MANIFEST.json'],
    meta: { before, after: meta({ suites: ['ui', 'hud'] }) },
  });
  assert.deepEqual([v.ok, v.data], [false, true]);
});

test('a recorder change without golden data change must be proven neutral', async () => {
  const { goldenVerdict } = await load();
  const v = goldenVerdict({
    changed: ['tools/golden/canon.cjs', G + 'meta.json', G + 'MANIFEST.json'],
    meta: { before: meta(), after: meta({ recorderManifest: { 'a.cjs': { sha256_lf: '9' } } }) },
  });
  assert.deepEqual([v.ok, v.data, v.recorder, v.prove], [true, false, true, true]);
  const w = goldenVerdict({
    changed: ['tools/golden/canon.cjs', G + 'ui.json', 'CHANGELOG.md'],
    body: 'Golden-Update: recorder hashes a new field of the interface',
  });
  assert.deepEqual([w.ok, w.data, w.prove], [true, true, false], 'a declared update is not proven neutral');
});

test('events: a pull request, a ci/** branch (against main), a push to main; nothing to judge otherwise', async () => {
  const { rangeFor } = await load();
  assert.deepEqual(rangeFor({ EVENT: 'pull_request', PR_BODY: 'x' }), {
    base: 'HEAD^1',
    head: 'HEAD',
    body: 'x',
    source: 'description',
  });
  const zero = '0'.repeat(40);
  for (const before of [zero, 'a'.repeat(40)])
    assert.deepEqual(rangeFor({ EVENT: 'push', PUSH_REF: 'refs/heads/ci/determinism', PUSH_BEFORE: before }), {
      base: 'merge-base',
      head: 'HEAD',
      body: null,
      source: 'commits',
    });
  assert.deepEqual(rangeFor({ EVENT: 'push', PUSH_REF: 'refs/heads/main', PUSH_BEFORE: 'b'.repeat(40) }), {
    base: 'b'.repeat(40),
    head: 'HEAD',
    body: null,
    source: 'pushed',
  });
  assert.equal(rangeFor({ EVENT: 'push', PUSH_REF: 'refs/heads/main', PUSH_BEFORE: zero }), null);
  assert.equal(rangeFor({ EVENT: 'push', PUSH_REF: 'refs/tags/v1.0.0', PUSH_BEFORE: zero }), null);
  assert.equal(rangeFor({ EVENT: 'push', PUSH_REF: 'refs/heads/cix/other', PUSH_BEFORE: zero }), null);
  assert.equal(rangeFor({ EVENT: 'workflow_dispatch' }), null);
});

test('a ci/** branch is judged against main, a push to main on every pushed commit: the trailer in any message', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-trailer-'));
  const run = (args, env = {}) =>
    spawnSync(args[0] === 'git' ? 'git' : process.execPath, args[0] === 'git' ? args.slice(1) : args, {
      cwd: base,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: '1+t@users.noreply.github.com',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: '1+t@users.noreply.github.com',
        ...env,
      },
    });
  const ok = (...args) => {
    const r = run(['git', ...args]);
    assert.equal(r.status, 0, args.join(' ') + ': ' + r.stderr);
  };
  const write = (f, text) => {
    fs.mkdirSync(path.dirname(path.join(base, f)), { recursive: true });
    fs.writeFileSync(path.join(base, f), text);
  };
  const check = (branch, before = '0'.repeat(40)) =>
    run(['scripts/check-golden-trailer.mjs'], { EVENT: 'push', PUSH_REF: 'refs/heads/' + branch, PUSH_BEFORE: before });
  try {
    ok('init', '-q', '-b', 'main');
    ok('config', 'commit.gpgsign', 'false');
    ok('config', 'core.hooksPath', 'no-hooks');
    write('scripts/check-golden-trailer.mjs', fs.readFileSync(path.join(ROOT, 'scripts', 'check-golden-trailer.mjs')));
    write(G + 'meta.json', meta());
    write(G + 'ui.json', '{"a":1}\n');
    write('CHANGELOG.md', '# Journal\n');
    ok('add', '-A');
    ok('commit', '-q', '-m', 'base');
    ok('update-ref', 'refs/remotes/origin/main', 'HEAD');
    // Declared in the first commit of the branch, not in its last one.
    ok('checkout', '-q', '-b', 'ci/declared');
    write(G + 'ui.json', '{"a":2}\n');
    write('CHANGELOG.md', '# Journal\n\n- A declared change.\n');
    ok('add', '-A');
    ok('commit', '-q', '-m', 'Change a label\n\nGolden-Update: wording step of a label (test)');
    write('README.md', 'x\n');
    ok('add', '-A');
    ok('commit', '-q', '-m', 'Docs');
    let r = check('ci/declared');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /judged against main/);
    assert.match(r.stdout, /declared golden change/);
    // The same change with no trailer anywhere on the branch.
    ok('checkout', '-q', '-b', 'ci/undeclared', 'main');
    write(G + 'ui.json', '{"a":3}\n');
    write('CHANGELOG.md', '# Journal\n\n- A change.\n');
    ok('add', '-A');
    ok('commit', '-q', '-m', 'Change a label');
    r = check('ci/undeclared');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a commit message of the ci\/\*\* branch needs a line "Golden-Update: <reason>"/);
    // A branch that changes no golden.
    ok('checkout', '-q', '-b', 'ci/tools', 'main');
    write('README.md', 'y\n');
    ok('add', '-A');
    ok('commit', '-q', '-m', 'Docs only');
    r = check('ci/tools');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /no golden change/);
    // main fast-forwarded to the declared branch (several commits in one push): the line is read in any of the pushed
    // commits, not only in the last one; without it anywhere in the push, the push fails.
    const before = run(['git', 'rev-parse', 'main']).stdout.trim();
    ok('checkout', '-q', 'main');
    ok('merge', '-q', '--ff-only', 'ci/declared');
    r = check('main', before);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /declared golden change/);
    ok('reset', '-q', '--hard', before);
    ok('merge', '-q', '--ff-only', 'ci/undeclared');
    r = check('main', before);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a message of the pushed commits needs a line "Golden-Update: <reason>"/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
