'use strict';
// The install-script gate (scripts/check-install-scripts.mjs, CI job deps): a package of the lockfile with an install
// script fails until its name@version is reviewed (a new package, or a new version of a reviewed one); a reviewed entry
// that a dependency update removed from the lockfile only warns and says how to prune it; --prune removes such entries
// and nothing else, keeping every other byte of publish-policy.json.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { ROOT } = require('../helpers/paths');

const SCRIPT = path.join(ROOT, 'scripts', 'check-install-scripts.mjs');
const load = () => import(pathToFileURL(SCRIPT).href);
const lockWith = (...ids) => ({
  lockfileVersion: 3,
  packages: Object.fromEntries([
    ['', { name: 'x' }],
    ['node_modules/plain', { version: '1.0.0' }],
    ...ids.map((id) => {
      const at = id.lastIndexOf('@');
      return ['node_modules/' + id.slice(0, at), { version: id.slice(at + 1), hasInstallScript: true }];
    }),
  ]),
});

function withFiles(lock, reviewed, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-install-'));
  try {
    const policyText = fs
      .readFileSync(path.join(ROOT, 'publish-policy.json'), 'utf8')
      .replace(/"installScriptsReviewed": \[[^\]]*\]/, '"installScriptsReviewed": ' + JSON.stringify(reviewed));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify(lock));
    fs.writeFileSync(path.join(dir, 'publish-policy.json'), policyText);
    const run = (...args) => {
      const r = spawnSync(process.execPath, [SCRIPT, ...args, 'package-lock.json', 'publish-policy.json'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: '' },
      });
      return { code: r.status, out: r.stdout + r.stderr };
    };
    return fn({ dir, run, policyText, read: () => fs.readFileSync(path.join(dir, 'publish-policy.json'), 'utf8') });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('verdict: reviewed passes; a new package or a new version fails; a removed entry is only reported', async () => {
  const { installScriptVerdict, packageName } = await load();
  assert.equal(packageName('@scope/tool@1.2.3'), '@scope/tool');
  assert.equal(packageName('tool@1.2.3'), 'tool');
  const reviewed = ['electron-winstaller@5.4.0', 'fsevents@2.3.2'];
  assert.deepEqual(installScriptVerdict([...reviewed], reviewed), { ok: true, added: [], changed: [], gone: [] });
  assert.deepEqual(installScriptVerdict(['electron-winstaller@5.4.0'], reviewed), {
    ok: true,
    added: [],
    changed: [],
    gone: ['fsevents@2.3.2'],
  });
  const v = installScriptVerdict(['electron-winstaller@5.4.0', 'fsevents@2.3.3', '@scope/new@1.0.0'], reviewed);
  assert.equal(v.ok, false);
  assert.deepEqual(v.added, ['@scope/new@1.0.0']);
  assert.deepEqual(v.changed, [{ package: 'fsevents@2.3.3', reviewed: ['fsevents@2.3.2'] }]);
  assert.deepEqual(v.gone, [], 'the reviewed version of a changed package is not reported as removed');
  // Once the new version is reviewed, the old one is a stale entry.
  const w = installScriptVerdict(['electron-winstaller@5.4.0', 'fsevents@2.3.3'], [...reviewed, 'fsevents@2.3.3']);
  assert.deepEqual([w.ok, w.gone], [true, ['fsevents@2.3.2']]);
});

test('a dependency update that removes a reviewed package: exit 0 with a warning that says how to prune', () => {
  withFiles(lockWith('electron-winstaller@5.4.0'), ['electron-winstaller@5.4.0', 'fsevents@2.3.2'], ({ run }) => {
    const r = run();
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /WARN listed in installScriptsReviewed but no longer in the lockfile .*fsevents@2\.3\.2/);
    assert.match(r.out, /node scripts\/check-install-scripts\.mjs --prune/);
    assert.match(r.out, /0 not reviewed, 1 stale entry/);
  });
});

test('--prune removes only the stale entries and keeps every other byte of the policy', () => {
  withFiles(lockWith('electron-winstaller@5.4.0'), ['electron-winstaller@5.4.0', 'fsevents@2.3.2'], (f) => {
    const r = f.run('--prune');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /pruned from installScriptsReviewed .*fsevents@2\.3\.2/);
    const after = f.read();
    assert.deepEqual(JSON.parse(after).installScriptsReviewed, ['electron-winstaller@5.4.0']);
    assert.equal(
      after.replace(/"installScriptsReviewed": \[[^\]]*\]/, 'LIST'),
      f.policyText.replace(/"installScriptsReviewed": \[[^\]]*\]/, 'LIST'),
      'nothing else changed',
    );
    assert.match(after, /"installScriptsReviewed": \["electron-winstaller@5\.4\.0"\],/);
    const again = f.run();
    assert.equal(again.code, 0);
    assert.ok(!/WARN/.test(again.out), 'nothing left to prune');
  });
});

test('a new package with an install script, or a new version of a reviewed one, fails until reviewed (--prune too)', () => {
  withFiles(
    lockWith('electron-winstaller@5.4.0', 'fsevents@2.3.2', 'evil@1.0.0'),
    ['electron-winstaller@5.4.0', 'fsevents@2.3.2'],
    ({ run }) => {
      const r = run();
      assert.equal(r.code, 1);
      assert.match(r.out, /FAIL NEW install script, review it then add it to installScriptsReviewed: evil@1\.0\.0/);
    },
  );
  withFiles(
    lockWith('electron-winstaller@5.4.0', 'fsevents@2.3.3'),
    ['electron-winstaller@5.4.0', 'fsevents@2.3.2'],
    (f) => {
      let r = f.run();
      assert.equal(r.code, 1);
      assert.match(r.out, /FAIL CHANGED version .*fsevents@2\.3\.3 \(reviewed: fsevents@2\.3\.2\)/);
      assert.ok(!/WARN/.test(r.out), 'the replaced version is not reported as a harmless removal: ' + r.out);
      r = f.run('--prune');
      assert.equal(r.code, 1, 'pruning never reviews');
      assert.deepEqual(
        JSON.parse(f.read()).installScriptsReviewed,
        ['electron-winstaller@5.4.0', 'fsevents@2.3.2'],
        'the reviewed version stays listed until the new one is reviewed',
      );
    },
  );
});

test('prune formatting: one line when it fits in 120 columns, one entry per line otherwise', async () => {
  const { pruneReviewed } = await load();
  const long = Array.from({ length: 8 }, (_, i) => `a-rather-long-package-name-${i}@10.20.30`);
  const text = '{\n  "x": 1,\n  "installScriptsReviewed": ' + JSON.stringify(long) + ',\n  "y": 2\n}\n';
  const out = pruneReviewed(text, [long[0]]);
  assert.deepEqual(JSON.parse(out).installScriptsReviewed, long.slice(1));
  assert.match(out, /"installScriptsReviewed": \[\n {4}"a-rather-long-package-name-1@10\.20\.30",\n/);
  assert.ok(out.split('\n').every((l) => l.length <= 120));
  assert.equal(pruneReviewed(text, long).includes('"installScriptsReviewed": [],'), true);
});

test('the repository: every install script of the lockfile is reviewed, and the command passes', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
