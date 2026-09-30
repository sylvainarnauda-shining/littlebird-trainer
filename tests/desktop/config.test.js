'use strict';
// The desktop packaging configuration stays consistent with the shell and docs/SECURITE-CONCEPTION.md: frozen identifiers,
// the app.asar allowlist, a per-user one-click installer that keeps the profile, no publishing, fuses flipped by our
// afterPack hook with every fuse decided, exact pins, and a shell that loads nothing from src/ or node_modules.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT } = require('../helpers/paths');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pkg = JSON.parse(read('package.json'));
const yml = read('electron-builder.yml');
const policy = require(path.join(ROOT, 'desktop', 'policy.cjs'));
// Top-level scalar "key: value" of the YAML file, and the items of a top-level or nested list.
const scalar = (key, text = yml) => {
  const m = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(text);
  return m ? m[1].trim().replace(/^'(.*)'$/, '$1') : undefined;
};
const block = (key) => {
  const lines = yml.split('\n');
  const i = lines.findIndex((l) => l === key + ':');
  assert.ok(i >= 0, key + ' block');
  const out = [];
  for (const l of lines.slice(i + 1)) {
    if (/^\S/.test(l)) break;
    out.push(l);
  }
  return out.join('\n');
};

test('frozen identifiers: app id, product and executable names, origin', () => {
  assert.equal(scalar('appId'), policy.APP_ID);
  assert.equal(policy.APP_ID, 'io.github.sylvainarnauda-shining.littlebird-trainer');
  assert.equal(scalar('productName'), 'LittleBird Trainer');
  assert.equal(pkg.productName, 'LittleBird Trainer');
  assert.equal(scalar('executableName'), 'LittleBirdTrainer');
  assert.equal(policy.ORIGIN, 'app://littlebird');
  assert.equal(scalar('copyright'), 'Copyright (c) 2026 sylvainarnauda-shining and contributors');
  assert.equal(pkg.author.name, 'sylvainarnauda-shining and contributors');
  assert.equal(pkg.main, 'desktop/main.cjs');
});

test('app.asar holds exactly the allowlisted files (electron-builder.yml = scripts/check-asar.mjs)', async () => {
  const { ASAR_FILES } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'check-asar.mjs')).href);
  const files = block('files')
    .split('\n')
    .map((l) => /^\s+-\s+(.+)$/.exec(l))
    .filter(Boolean)
    .map((m) => m[1].trim());
  assert.deepEqual(files, ASAR_FILES);
  for (const f of ASAR_FILES.filter((f) => !f.startsWith('dist/'))) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  assert.equal(scalar('asar'), 'true');
});

test('installer: one click, per user, no elevation, shortcuts, profile kept; portable zip; nothing published', () => {
  const nsis = block('nsis');
  const n = (k) => scalar('  ' + k, nsis);
  assert.equal(n('oneClick'), 'true');
  assert.equal(n('perMachine'), 'false');
  assert.equal(n('allowElevation'), 'false');
  assert.equal(n('packElevateHelper'), 'false');
  assert.equal(n('createDesktopShortcut'), 'true');
  assert.equal(n('createStartMenuShortcut'), 'true');
  assert.equal(n('deleteAppDataOnUninstall'), 'false');
  assert.equal(n('warningsAsErrors'), 'true');
  assert.equal(n('differentialPackage'), 'false');
  assert.equal(n('artifactName'), 'LittleBird-Trainer-Setup-${version}.${ext}');
  const win = block('win');
  assert.match(win, /- target: nsis\n\s+arch: \[x64\]\n\s+- target: zip\n\s+arch: \[x64\]/);
  assert.equal(scalar('  requestedExecutionLevel', win), 'asInvoker');
  assert.equal(scalar('  artifactName', win), 'LittleBird-Trainer-${version}-win-${arch}.${ext}');
  assert.equal(scalar('publish'), 'null');
  for (const script of ['dist', 'dist:dir']) assert.match(pkg.scripts[script], /--publish never/);
});

test('fuses: flipped by build/after-pack.cjs from build/fuses.cjs, every fuse of @electron/fuses decided', async () => {
  assert.equal(scalar('afterPack'), 'build/after-pack.cjs');
  assert.ok(!/^electronFuses:/m.test(yml), 'no electronFuses block (the hook decides every fuse)');
  const { FUSES } = require(path.join(ROOT, 'build', 'fuses.cjs'));
  const { FuseV1Options } = await import('@electron/fuses');
  const names = Object.keys(FuseV1Options).filter((k) => Number.isNaN(Number(k)));
  assert.deepEqual(Object.keys(FUSES).sort(), names.sort());
  assert.deepEqual(FUSES, {
    RunAsNode: false,
    EnableCookieEncryption: true,
    EnableNodeOptionsEnvironmentVariable: false,
    EnableNodeCliInspectArguments: false,
    EnableEmbeddedAsarIntegrityValidation: true,
    OnlyLoadAppFromAsar: true,
    LoadBrowserProcessSpecificV8Snapshot: false,
    GrantFileProtocolExtraPrivileges: false,
    WasmTrapHandlers: true,
  });
  assert.match(read('build/after-pack.cjs'), /strictlyRequireAllFuses: true/);
});

test('exact pins of the desktop toolchain, no runtime dependency, version 0.9.0 in the changelog', () => {
  assert.equal(pkg.version, '0.9.0');
  assert.equal(pkg.dependencies, undefined, 'the app has no npm runtime dependency');
  for (const [name, v] of Object.entries({
    electron: '44.5.1',
    'electron-builder': '26.15.3',
    '@electron/fuses': '2.1.3',
    '@electron/asar': '4.3.1',
  }))
    assert.equal(pkg.devDependencies[name], v, name);
  for (const v of Object.values(pkg.devDependencies)) assert.match(v, /^\d+\.\d+\.\d+$/, 'exact pin');
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.packages['node_modules/electron'].version, '44.5.1');
  assert.match(read('CHANGELOG.md'), /^## \[0\.9\.0\]/m);
});

test('the shell loads only Electron, Node built-ins and its own files', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'desktop'))) {
    const text = read('desktop/' + f);
    for (const m of text.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const dep = m[1];
      assert.ok(
        dep === 'electron' || dep.startsWith('node:') || /^\.\/[a-z-]+\.cjs$/.test(dep),
        `${f}: require('${dep}')`,
      );
    }
    assert.ok(!/\bimport\s*\(/.test(text), f + ': no dynamic import');
  }
});

test('the icon is our own drawing and build/icon.svg is its current design', async () => {
  const { svg, SIZES, makeIcon } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'make-icon.mjs')).href);
  assert.equal(read('build/icon.svg').replace(/\r\n/g, '\n'), svg());
  const a = makeIcon();
  const b = makeIcon();
  assert.ok(a.ico.equals(b.ico), 'same bytes on every run');
  assert.equal(a.ico.readUInt16LE(2), 1, 'icon resource');
  assert.equal(a.ico.readUInt16LE(4), SIZES.length);
  const sizes = SIZES.map((_, i) => a.ico[6 + 16 * i] || 256);
  assert.deepEqual(sizes, SIZES);
  const last = a.ico.readUInt32LE(6 + 16 * (SIZES.length - 1) + 12);
  assert.equal(a.ico.subarray(last, last + 8).toString('latin1'), '\x89PNG\r\n\x1a\n', '256 px as PNG');
  assert.match(yml, /icon: dist\/icon\/icon\.ico/);
  assert.match(pkg.scripts.dist, /npm run icon/);
});
