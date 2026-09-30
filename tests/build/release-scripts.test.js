'use strict';
// The release tooling (zero dependencies): the deterministic zip writer and reader, the browser zip, SHA256SUMS.txt,
// the release gate and notes, the SBOM, the install-script and Electron support-window gates, and the scanner's mode
// for shipped files.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT } = require('../helpers/paths');

const load = (f) => import(pathToFileURL(path.join(ROOT, 'scripts', f)).href);
const tmp = (fn) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-release-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

test('zip: CRC-32, round trip, same bytes for the same inputs, fixed time', async () => {
  const { crc32, writeZip, readZip } = await load('zip.mjs');
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const files = [
    { name: 'index.html', data: Buffer.from('<html>' + 'x'.repeat(5000)) },
    { name: 'LISEZ-MOI.txt', data: Buffer.from('é') },
    { name: 'empty.txt', data: Buffer.alloc(0) },
  ];
  const a = writeZip(files, { epoch: 1790000000 });
  const b = writeZip(files, { epoch: 1790000000 });
  assert.ok(a.equals(b));
  assert.ok(!a.equals(writeZip(files, { epoch: 1790000002 })));
  const back = readZip(a);
  assert.deepEqual(
    back.map((e) => e.name),
    files.map((f) => f.name),
  );
  back.forEach((e, i) => assert.ok(e.data().equals(files[i].data), e.name));
  assert.equal(back[0].method, 8, 'deflated');
  assert.equal(back[2].method, 0, 'stored when deflating does not help');
  const bad = Buffer.from(a);
  bad[40] ^= 1;
  assert.throws(() => readZip(bad)[0].data());
});

test('browser zip: the page and three texts, deterministic', async () => {
  const { webZip, WEB_ZIP_FILES } = await load('make-web-zip.mjs');
  const { readZip } = await load('zip.mjs');
  const page = Buffer.from('<!doctype html><title>t</title>');
  const z = webZip(page, { epoch: 1790000000 });
  assert.ok(z.equals(webZip(page, { epoch: 1790000000 })));
  const entries = readZip(z);
  assert.deepEqual(
    entries.map((e) => e.name),
    WEB_ZIP_FILES.map(([n]) => n),
  );
  assert.ok(entries[0].data().equals(page));
  assert.match(entries[1].data().toString('utf8'), /index\.html/);
  assert.match(entries[2].data().toString('utf8'), /^MIT License/);
});

test('SHA256SUMS.txt: sha256sum format; the check finds a changed, a missing and an unlisted file', async () => {
  const { sums, check, SUMS } = await load('checksums.mjs');
  tmp((dir) => {
    fs.writeFileSync(path.join(dir, 'b.zip'), 'bbb');
    fs.writeFileSync(path.join(dir, 'a.exe'), 'aaa');
    const text = sums(dir);
    const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
    assert.equal(text, `${sha('aaa')}  a.exe\n${sha('bbb')}  b.zip\n`);
    fs.writeFileSync(path.join(dir, SUMS), text);
    assert.deepEqual(check(dir), []);
    fs.writeFileSync(path.join(dir, 'a.exe'), 'AAA');
    fs.writeFileSync(path.join(dir, 'c.txt'), 'c');
    fs.rmSync(path.join(dir, 'b.zip'));
    assert.deepEqual(check(dir).sort(), ['missing: b.zip', 'not listed: c.txt', 'sha256 differs: a.exe']);
  });
});

test('release gate: tag = version, a changelog section, dated for a real release, the French notes filled', async () => {
  const { releaseNotes, isPrerelease, notesPath } = await load('release-notes.mjs');
  const pkg = { version: '1.2.3' };
  const log = (h) => `# Journal\n\n## [1.2.3]${h}\n\n- Un changement.\n\n## [1.2.2] — 2026-01-01\n\n- Avant.\n`;
  const notes =
    '# LittleBird Trainer {{version}}\n\nSmartScreen ; Contrôle intelligent des applications : ' +
    '`LittleBird-Trainer-{{version}}-navigateur.zip`. `SHA256SUMS.txt`, page `{{page_sha256}}`, ' +
    '`gh attestation verify <fichier> --repo {{repo}} --signer-workflow {{repo}}/.github/workflows/release.yml`.\n';
  const dated = log(' — 2026-10-01');
  const page = 'ab'.repeat(32);
  assert.throws(() => releaseNotes({ tag: 'v1.2.4', pkg, changelog: dated, notes }), /does not match/);
  assert.throws(() => releaseNotes({ tag: '1.2.3', pkg, changelog: dated, notes }), /not vX\.Y\.Z/);
  assert.throws(() => releaseNotes({ tag: 'v1.2.3', pkg, changelog: '# Journal\n', notes }), /no "## \[1\.2\.3\]"/);
  assert.throws(() => releaseNotes({ tag: 'v1.2.3', pkg, changelog: log(' — non publiée'), notes }), /release date/);
  // The hand-written notes: present, every placeholder known, every notice given; the page hash on a real release.
  assert.throws(() => releaseNotes({ tag: 'v1.2.3', pkg, changelog: dated, pageSha256: page }), /notes-de-version/);
  assert.throws(() => releaseNotes({ tag: 'v1.2.3', pkg, changelog: dated, notes }), /--page/);
  const bad = (n, re) =>
    assert.throws(() => releaseNotes({ tag: 'v1.2.3', pkg, changelog: dated, notes: n, pageSha256: page }), re);
  bad(notes + '{{date}}', /unknown placeholder \{\{date\}\}/);
  bad(notes.replace('SmartScreen', 'Écran'), /SmartScreen/);
  bad(notes.replace('Contrôle intelligent des applications', 'Contrôle'), /Smart App Control/);
  bad(notes.replace('navigateur.zip', 'web.zip'), /browser version/);
  bad(notes.replace('gh attestation verify', 'gh verify'), /attestation/);
  const dry = releaseNotes({ tag: '--dry-run', dryRun: true, pkg, changelog: log(' — non publiée'), notes });
  assert.match(dry, /^# LittleBird Trainer 1\.2\.3$/m);
  assert.match(dry, /^- Un changement\./m);
  assert.ok(!dry.includes('Avant.'), 'only this version');
  const out = releaseNotes({ tag: 'v1.2.3', pkg, changelog: dated, notes, pageSha256: page });
  assert.match(out, /LittleBird-Trainer-1\.2\.3-navigateur\.zip/);
  assert.match(
    out,
    /gh attestation verify .* --signer-workflow sylvainarnauda-shining\/littlebird-trainer\/\.github\/workflows\/release\.yml/,
  );
  assert.match(out, new RegExp(page));
  assert.ok(!out.includes('{{'), 'every placeholder filled');
  // A 0.x version is a pre-release, and its notes must say so.
  assert.deepEqual(['0.9.0', '0.10.1', '1.0.0', '10.0.0'].map(isPrerelease), [true, true, false, false]);
  const zero = { version: '0.1.0' };
  const log0 = '## [0.1.0] — 2026-10-01\n\n- Un changement.\n';
  const notes0 = notes.replace('# LittleBird Trainer {{version}}', '# LittleBird Trainer {{version}} (préversion)');
  assert.throws(
    () => releaseNotes({ tag: 'v0.1.0', pkg: zero, changelog: log0, notes, pageSha256: page }),
    /pre-release/,
  );
  assert.match(
    releaseNotes({ tag: 'v0.1.0', pkg: zero, changelog: log0, notes: notes0, pageSha256: page }),
    /préversion/,
  );
  // The project's own changelog and notes pass the gate for the current version (dry run; dated: a real tag too).
  const own = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const args = {
    pkg: own,
    changelog: fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'),
    notes: fs.readFileSync(path.join(ROOT, notesPath(own.version)), 'utf8'),
    pageSha256: page,
  };
  assert.match(releaseNotes({ tag: '--dry-run', dryRun: true, ...args }), /Vérifier les fichiers/);
  assert.match(releaseNotes({ tag: 'v' + own.version, ...args }), /Journal des modifications/);
});

test('SBOM: CycloneDX 1.6, Electron with its official zip sha256, three.js with the pinned file sha256, deterministic', async () => {
  const { sbom } = await load('sbom.mjs');
  const a = sbom({ epoch: 1790000000 });
  assert.deepEqual(a, sbom({ epoch: 1790000000 }));
  assert.equal(a.bomFormat, 'CycloneDX');
  assert.equal(a.specVersion, '1.6');
  assert.match(a.serialNumber, /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const electron = a.components.find((c) => c.name === 'electron');
  const sums = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'checksums.json'), 'utf8'));
  assert.equal(electron.version, '44.5.1');
  assert.equal(electron.hashes[0].content, sums['electron-v44.5.1-win32-x64.zip']);
  const three = a.components.find((c) => c.name === 'three');
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'publish-policy.json'), 'utf8'));
  assert.equal(three.hashes[0].content, policy.vendorChecksums['src/vendor/three.min.js']);
  assert.equal(a.metadata.timestamp, '2026-09-21T14:13:20Z');
});

test('install-script gate: every install script of the lockfile is reviewed (details: install-scripts.test.js)', async () => {
  const { installScripts, installScriptVerdict } = await load('check-install-scripts.mjs');
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'publish-policy.json'), 'utf8'));
  const v = installScriptVerdict(installScripts(lock), policy.installScriptsReviewed);
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.deepEqual(
    installScripts({
      lockfileVersion: 3,
      packages: { '': {}, 'node_modules/x': { version: '1.0.0', hasInstallScript: true } },
    }),
    ['x@1.0.0'],
  );
  assert.throws(() => installScripts({ lockfileVersion: 1 }));
});

test('Electron support window (the 30-day rule): out-of-support major, a newer patch older than 30 days', async () => {
  const { supportProblems, GRACE_DAYS } = await load('check-support-window.mjs');
  const day = 86400000;
  const now = Date.parse('2026-10-30T00:00:00Z');
  const tags = { latest: '46.1.0', '44-x-y': '44.5.0' };
  assert.equal(GRACE_DAYS, 30);
  const fresh = supportProblems({
    pinned: '44.4.5',
    tags,
    time: { '44.5.0': new Date(now - 10 * day).toISOString() },
    now,
  });
  assert.deepEqual(fresh.problems, []);
  assert.equal(fresh.notes.length, 1);
  const stale = supportProblems({
    pinned: '44.4.5',
    tags,
    time: { '44.5.0': new Date(now - 31 * day).toISOString() },
    now,
  });
  assert.equal(stale.problems.length, 1);
  const old = supportProblems({ pinned: '43.1.0', tags: { latest: '46.0.0', '43-x-y': '43.1.0' }, time: {}, now });
  assert.match(old.problems[0], /out of support/);
  assert.deepEqual(supportProblems({ pinned: '44.5.0', tags, time: {}, now }).problems, []);
});

test('GitHub settings as code: required check ci-ok, SHA pinning, read-only token, release environment, no bypass', async () => {
  const { desired, REQUIRED_CHECK, OWNER_ID } = await load('github-settings.mjs');
  const items = desired();
  const by = (w) => items.find((i) => i.what.startsWith(w));
  assert.equal(REQUIRED_CHECK, 'ci-ok');
  assert.equal(OWNER_ID, 267130464, 'the numeric id of the noreply commit address');
  assert.deepEqual(by('Actions: GitHub-owned').body, {
    enabled: true,
    allowed_actions: 'selected',
    sha_pinning_required: true,
  });
  assert.deepEqual(by('Actions: read-only').body, {
    default_workflow_permissions: 'read',
    can_approve_pull_request_reviews: false,
  });
  const main = by('Ruleset protect-main').body;
  assert.deepEqual(main.bypass_actors, []);
  const checks = main.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks;
  assert.deepEqual(checks, [{ context: 'ci-ok' }]);
  assert.deepEqual(by('Environment release: the maintainer').body.reviewers, [{ type: 'User', id: 267130464 }]);
  // The squash commit keeps the pull request description, where the Golden-Update trailer is written.
  const merges = by('Merges: squash only').body;
  assert.equal(merges.squash_merge_commit_message, 'PR_BODY');
  assert.equal(merges.allow_merge_commit, false);
  assert.equal(merges.allow_rebase_merge, false);
  assert.ok(by('Releases are immutable'), 'immutable releases');
  // verify's checks report differences instead of passing silently.
  assert.deepEqual(
    by('Actions: GitHub-owned').check({ enabled: true, allowed_actions: 'all', sha_pinning_required: true }).length,
    1,
  );
  assert.deepEqual(by('Ruleset protect-main').check({ enforcement: 'active', rules: main.rules }), []);
  assert.ok(by('Ruleset protect-main').check({ enforcement: 'active', rules: [{ type: 'deletion' }] }).length >= 1);
  assert.deepEqual(by('Code scanning default setup').check({ state: 'configured' }).length, 1);
});

test('privacy scan of shipped files: content rules apply, repository path and size rules do not', async () => {
  const { runScan } = await load('privacy-scan.mjs');
  // Assembled at run time, so that this file itself holds neither a user path nor the game's name.
  const game = ['WAR', 'DOGS'].join('');
  const userPath = ['C:', 'Users', 'Someone', 'Desktop', 'x'].join('\\');
  tmp((dir) => {
    fs.mkdirSync(path.join(dir, 'navigateur'));
    // A large built page naming the game nominatively (allowed for index.html), and a notice.
    fs.writeFileSync(
      path.join(dir, 'navigateur', 'index.html'),
      `<p>Importer les réglages de ${game}</p>` + 'x'.repeat(1100000),
    );
    fs.writeFileSync(path.join(dir, 'navigateur', 'LICENSE.txt'), 'MIT License\n');
    const clean = runScan(['--dir', dir, '--shipped']);
    assert.deepEqual(clean.errors, []);
    fs.writeFileSync(path.join(dir, 'navigateur', 'LISEZ-MOI.txt'), userPath + '\n');
    fs.writeFileSync(path.join(dir, 'navigateur', 'notes.txt'), game + '\n');
    const dirty = runScan(['--dir', dir, '--shipped']);
    assert.deepEqual(dirty.errors.map((e) => e.rule).sort(), ['game-name-mention', 'user-profile-path']);
  });
  assert.throws(() => runScan(['--tracked', '--shipped']), /--shipped goes with --dir/);
});
