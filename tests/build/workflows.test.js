'use strict';
// The GitHub workflows follow the CI hygiene of docs/SECURITE-CONCEPTION.md, checked on their text (a full YAML and schema check
// is actionlint's job, see CONTRIBUTING.md): every workflow closes the token by default; every action is GitHub-owned and
// pinned to a full commit SHA with its tag in a comment, the same SHA for the same tag everywhere; checkouts keep no
// credentials; no cache; no pull_request_target; no ${{ }} expression inside a script; every job has a timeout; the
// required check is ci-ok; only the release's publish job can write, behind the release environment, as a draft.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT } = require('../helpers/paths');

const DIR = path.join(ROOT, '.github', 'workflows');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.yml'));
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

// The jobs of a workflow: {name: text of its block}.
function jobs(text) {
  const lines = text.split('\n');
  const start = lines.indexOf('jobs:');
  const out = {};
  let cur = null;
  for (const l of lines.slice(start + 1)) {
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(l);
    if (m) out[(cur = m[1])] = '';
    else if (cur) out[cur] += l + '\n';
  }
  return out;
}
// The script lines of every run: step (block or single line).
function scripts(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (m[2] && m[2] !== '|') {
      out.push(m[2]);
      continue;
    }
    const indent = m[1].length;
    for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || lines[j].search(/\S/) > indent); j++)
      out.push(lines[j]);
  }
  return out;
}

test('the expected workflows exist', () => {
  assert.deepEqual(files.sort(), ['ci.yml', 'codeql.yml', 'maintenance.yml', 'nightly.yml', 'release.yml']);
});

for (const f of files) {
  test(`${f}: token closed by default, no pull_request_target, timeouts, no cache`, () => {
    const text = read(f);
    assert.match(text, /^permissions: \{\}$/m, 'permissions: {} at the top');
    const code = text.replace(/^\s*#.*$/gm, '');
    assert.ok(!/pull_request_target|workflow_run/.test(code), 'no pull_request_target or workflow_run');
    for (const [name, body] of Object.entries(jobs(text))) {
      if (/^\s{4}uses: \.\/\.github\/workflows\//m.test(body)) continue; // a reusable workflow call
      assert.match(body, /^\s{4}timeout-minutes: \d+$/m, `${f} ${name}: timeout-minutes`);
      assert.match(body, /^\s{4}permissions:/m, `${f} ${name}: explicit permissions`);
    }
    assert.ok(!/actions\/cache@/.test(text), 'no cache action');
    for (const m of text.matchAll(/package-manager-cache: (\w+)/g)) assert.equal(m[1], 'false');
    assert.ok(!/^\s+cache:/m.test(text), 'no setup-node cache');
  });

  test(`${f}: GitHub-owned actions pinned by full SHA with their tag; checkouts keep no credentials`, () => {
    const text = read(f);
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      const m = /^\s*(?:- )?uses: (\S+)(.*)$/.exec(l);
      if (!m) return;
      if (m[1].startsWith('./.github/workflows/')) return;
      assert.match(
        m[1],
        /^(actions|github)\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_./-]+)?@[0-9a-f]{40}$/,
        `${f}:${i + 1} ${m[1]}`,
      );
      assert.match(m[2], /^ # v\d+\.\d+\.\d+$/, `${f}:${i + 1} tag comment`);
      if (m[1].startsWith('actions/checkout@')) {
        const next = lines.slice(i + 1, i + 5).join('\n');
        assert.match(next, /persist-credentials: false/, `${f}:${i + 1} persist-credentials: false`);
      }
    });
  });

  test(`${f}: no expression inside a script (values go through env)`, () => {
    for (const line of scripts(read(f))) assert.ok(!line.includes('${{'), `${f}: ${line.trim()}`);
  });
}

test('one SHA per action tag across the workflows (Dependabot bumps them together)', () => {
  const seen = new Map();
  for (const f of files)
    for (const m of read(f).matchAll(/uses: ([^@\s]+)@([0-9a-f]{40}) # (v[\d.]+)/g)) {
      const key = m[1].split('/').slice(0, 2).join('/') + '@' + m[3];
      if (seen.has(key)) assert.equal(m[2], seen.get(key), key);
      else seen.set(key, m[2]);
    }
  assert.ok(seen.size >= 8, 'pinned actions: ' + seen.size);
});

test('ci.yml: ci-ok aggregates every job and is the single check to require', async () => {
  const text = read('ci.yml');
  const j = jobs(text);
  const needs = /needs: \[([^\]]+)\]/
    .exec(j['ci-ok'])[1]
    .split(',')
    .map((s) => s.trim());
  assert.deepEqual(
    needs.sort(),
    Object.keys(j)
      .filter((k) => k !== 'ci-ok')
      .sort(),
  );
  assert.match(j['ci-ok'], /if: always\(\)/);
  assert.match(text, /workflow_call:/);
  assert.match(j.desktop, /desktop-smoke\.mjs .*--tamper/);
  assert.match(j.browser, /LB_GL: warp/);
  // Software WebGL: the CI scope of the browser specs (the @gpu ones run on a GPU), in two shards, bounded.
  assert.match(j.browser, /shard: \[1, 2\]/);
  assert.match(j.browser, /SHARD: \$\{\{ matrix\.shard \}\}\/2/);
  assert.match(j.browser, /run: npm run test:browser:ci -- --shard="\$SHARD"/);
  assert.match(j.browser, /name: browser-test-results-\$\{\{ matrix\.shard \}\}/);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['test:browser:ci'], 'npm run build && playwright test --grep-invert @gpu');
  assert.equal(pkg.scripts['test:browser'], 'npm run build && playwright test', 'locally: every spec');
  const cfg = fs.readFileSync(path.join(ROOT, 'playwright.config.mjs'), 'utf8');
  assert.match(cfg, /globalTimeout: ci \? budgetMinutes \* 60_000 : 0/);
  assert.match(cfg, /fullyParallel: ci,/, 'shards split test by test (still one worker)');
  assert.match(j.privacy, /privacy-scan\.mjs --tracked --history --strict/);
  assert.ok(!/npm ci/.test(j.privacy), 'no npm in the job that holds the private denylist');
  // Golden-Update protocol: no npm, whole history, the pull request description through env only.
  assert.match(j['golden-update'], /node scripts\/check-golden-trailer\.mjs --prove/);
  assert.match(j['golden-update'], /fetch-depth: 0/);
  assert.match(j['golden-update'], /PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/);
  assert.match(j['golden-update'], /PUSH_REF: \$\{\{ github\.ref \}\}/);
  assert.ok(!/npm ci/.test(j['golden-update']));
  // Triggers: pull requests to main; pushes to main and to ci/** branches (a maintainer's test of a branch); the
  // manual run and the release's call. Nothing else (no pull_request_target, no workflow_run: checked above).
  const on = text.slice(text.indexOf('\non:\n') + 1, text.indexOf('\npermissions:'));
  assert.match(on, /^ {2}pull_request:\n {4}branches: \[main\]$/m);
  assert.match(on, /^ {2}push:\n {4}branches: \[main, 'ci\/\*\*'\]$/m);
  assert.deepEqual(
    [...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]),
    ['pull_request', 'push', 'workflow_dispatch', 'workflow_call'],
  );
  // Advisory jobs only outside the release (strict: true there).
  assert.match(text, /workflow_call:\n {4}inputs:\n {6}strict:/);
  assert.match(j['ci-ok'], /ADVISORY: \$\{\{ inputs\.strict == true && 'none' \|\| 'browser desktop' \}\}/);
  // The aggregate is "ci-ok" everywhere but on a ci/** push, whose run (the branch tip, not its test merge) must never
  // stand for a pull request's required check on the same commit.
  const name = /^ {4}name: (.*)$/m.exec(j['ci-ok'])[1];
  assert.equal(
    name,
    "${{ (github.event_name == 'push' && startsWith(github.ref, 'refs/heads/ci/')) && 'ci-ok (ci branch)' || 'ci-ok' }}",
  );
  const { REQUIRED_CHECK } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'github-settings.mjs')).href);
  assert.equal(REQUIRED_CHECK, 'ci-ok');
  for (const [job, body] of Object.entries(j))
    if (job !== 'ci-ok') assert.ok(!new RegExp(`^ {4}name: ${REQUIRED_CHECK}\\b`, 'm').test(body), job);
});

test('maintenance.yml: the weekly privacy scan covers every branch and tag, with the private denylist', () => {
  const j = jobs(read('maintenance.yml'));
  assert.match(j.privacy, /fetch-depth: 0/);
  assert.match(j.privacy, /node scripts\/privacy-scan\.mjs --tracked --history --all-refs --strict --require-denylist/);
  assert.match(j.privacy, /PUBLISH_DENYLIST: \$\{\{ secrets\.PUBLISH_DENYLIST \}\}/);
  assert.ok(!/npm ci/.test(j.privacy), 'no npm next to the denylist');
});

test('release.yml: preflight gates, verification before publishing, publish writes only a draft', () => {
  const text = read('release.yml');
  const j = jobs(text);
  for (const [name, body] of Object.entries(j)) {
    if (name === 'publish') continue;
    assert.ok(!/contents: write|id-token: write|attestations: write/.test(body), name + ' is read-only');
  }
  const pub = j.publish;
  assert.match(pub, /environment: release/);
  assert.match(pub, /if: needs\.preflight\.outputs\.publish == 'true'/);
  assert.match(pub, /needs: \[preflight, ci, web, package, verify-artifacts, artifact-privacy\]/);
  assert.ok(!/npm |checkout@|node scripts/.test(pub), 'publish runs no project code');
  // Only a draft, a pre-release for 0.x (decided in preflight), with the notes, checksums and attestations.
  assert.match(pub, /gh release create .* --draft --verify-tag --prerelease="\$PRERELEASE"/);
  assert.match(pub, /PRERELEASE: \$\{\{ needs\.preflight\.outputs\.prerelease \}\}/);
  assert.match(pub, /test "\$PRERELEASE" = true \|\| test "\$PRERELEASE" = false/);
  assert.match(pub, /--notes-file in\/notes\/release-notes\.md/);
  assert.match(j.preflight, /prerelease: \$\{\{ steps\.gate\.outputs\.prerelease \}\}/);
  assert.match(j.preflight, /isPrerelease/);
  assert.match(pub, /sha256sum -- \* > SHA256SUMS\.txt/);
  assert.match(
    pub,
    /attest-build-provenance@[0-9a-f]{40} # v[\d.]+\n\s+with:\n\s+subject-path: \|\n(\s+out\/\S+\n)*\s+out\/SHA256SUMS\.txt/,
  );
  assert.match(pub, /attest-sbom@/);
  assert.match(j.preflight, /git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/);
  assert.match(j.preflight, /release-notes\.mjs "\$TAG" release-notes\.md --page dist\/web\/index\.html/);
  assert.match(j['verify-artifacts'], /release-check\.mjs/);
  assert.match(j['artifact-privacy'], /privacy-scan\.mjs --dir shipped --shipped/);
  assert.ok(!/npm ci/.test(j['artifact-privacy']) && !/npm ci/.test(j.preflight), 'no npm next to the denylist');
  assert.match(text, /tags: \['v\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+'\]/);
});

test('release.yml: the shipped files are bound to their building jobs by sha256 outputs; no test code runs beside them', () => {
  const text = read('release.yml');
  const j = jobs(text);
  // The whole CI (strict) ends before any shipped file is built.
  assert.match(j.ci, /uses: \.\/\.github\/workflows\/ci\.yml\n\s+with:\n\s+strict: true/);
  for (const name of ['web', 'package']) assert.match(j[name], /needs: \[preflight, ci\]/, name);
  for (const out of ['zip_sha256', 'sbom_sha256', 'page_sha256'])
    assert.match(j.web, new RegExp(`${out}: \\$\\{\\{ steps`));
  for (const out of ['setup_sha256', 'portable_sha256', 'page_sha256'])
    assert.match(j.package, new RegExp(`${out}: \\$\\{\\{ steps`));
  // Every download names its artifact (never "all the artifacts of the run").
  for (const [name, body] of Object.entries(j)) {
    const blocks = body.split(/- uses: /).filter((b) => b.startsWith('actions/download-artifact@'));
    for (const b of blocks) assert.match(b, /\n\s+name: [a-z-]+\n/, name + ': a named download');
  }
  // verify-artifacts and publish compare the files with the job outputs, and the page with the release notes' page.
  const va = j['verify-artifacts'];
  for (const v of [
    'needs.web.outputs.zip_sha256',
    'needs.package.outputs.setup_sha256',
    'needs.preflight.outputs.page_sha256',
  ])
    assert.ok(va.includes(v), 'verify-artifacts reads ' + v);
  assert.match(va, /needs: \[preflight, web, package\]/);
  for (const v of [
    'needs.web.outputs.zip_sha256',
    'needs.web.outputs.sbom_sha256',
    'needs.package.outputs.setup_sha256',
    'needs.package.outputs.portable_sha256',
  ])
    assert.ok(j.publish.includes(v), 'publish reads ' + v);
  assert.match(j.publish, /sha256sum --check --strict \.\.\/expected\.sha256/);
  assert.ok(!/web\.sha256/.test(text), 'no sum file carried inside the artifact it checks');
});

test('dependabot.yml: npm and actions, weekly, with a cooldown', () => {
  const text = fs.readFileSync(path.join(ROOT, '.github', 'dependabot.yml'), 'utf8');
  assert.match(text, /^version: 2$/m);
  assert.match(text, /package-ecosystem: npm/);
  assert.match(text, /package-ecosystem: github-actions/);
  assert.equal((text.match(/interval: weekly/g) || []).length, 2);
  assert.equal((text.match(/default-days: 7/g) || []).length, 2);
});
