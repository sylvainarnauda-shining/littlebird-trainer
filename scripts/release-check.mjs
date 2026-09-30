#!/usr/bin/env node
// G-DESK on the release files (release workflow, job verify-artifacts; locally after `npm run dist`):
//  portable zip  extracted to a temporary folder: fuses read back, executable metadata (company, copyright, product,
//                version), app.asar allowlist and page equal to the reference page, then the packaged self-test;
//  installer     (Windows) a silent per-user install into a temporary folder (/S /D=...), never over an existing
//                installation: files, uninstall entry and the two shortcuts present; the installed app's fuses,
//                app.asar allowlist and page, and its self-test;
//                then the silent uninstall: files, entry and shortcuts gone, the player's profile folder kept;
//  report        size and sha256 of every release file.
// Nothing is installed for all users, nothing is started outside the hidden self-test, and a test installation is
// always removed (by its uninstaller, else by removing exactly what it created).
//   node scripts/release-check.mjs <release folder> [--page dist/web/index.html] [--warp] [--skip-install]
//                                  [--extract <dir>] [--json <file>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readZip } from './zip.mjs';
import { checkFuses } from './check-fuses.mjs';
import { checkAsar, ASAR_FILES } from './check-asar.mjs';
import { launch } from './desktop-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCT = 'LittleBird Trainer';
const EXE = 'LittleBirdTrainer.exe';
const OWNER = 'sylvainarnauda-shining and contributors';
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ps(command) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('powershell failed: ' + (r.stderr || '').trim().split('\n')[0]);
  return r.stdout.trim();
}
function versionInfo(exe) {
  const j = ps(
    `$v=(Get-Item -LiteralPath '${exe.replace(/'/g, "''")}').VersionInfo; ` +
      '[pscustomobject]@{CompanyName=$v.CompanyName;LegalCopyright=$v.LegalCopyright;ProductName=$v.ProductName;' +
      'FileDescription=$v.FileDescription;ProductVersion=$v.ProductVersion;FileVersion=$v.FileVersion} | ConvertTo-Json -Compress',
  );
  return JSON.parse(j);
}
// The uninstall entries of this product for the current user: [{key, UninstallString, DisplayVersion, Publisher}].
function uninstallEntries() {
  const j = ps(
    "Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' -ErrorAction SilentlyContinue | " +
      `ForEach-Object { $p = Get-ItemProperty $_.PSPath; if ($p.DisplayName -like '${PRODUCT}*') { ` +
      '[pscustomobject]@{key=$_.PSChildName;UninstallString=$p.UninstallString;DisplayVersion=$p.DisplayVersion;Publisher=$p.Publisher} } } | ' +
      'ConvertTo-Json -Compress',
  );
  if (!j) return [];
  const v = JSON.parse(j);
  return Array.isArray(v) ? v : [v];
}
function shortcuts() {
  const desktop = ps("[Environment]::GetFolderPath('Desktop')");
  const programs = ps("[Environment]::GetFolderPath('Programs')");
  return [path.join(desktop, `${PRODUCT}.lnk`), path.join(programs, `${PRODUCT}.lnk`)];
}
function run(exe, args, timeout = 300_000) {
  return new Promise((resolve) => {
    let child;
    try {
      // /D= must be the last argument and unquoted (NSIS): verbatim arguments.
      child = spawn(exe, args, { stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true });
    } catch (e) {
      return resolve({ code: null, error: e.code || String(e) });
    }
    const t = setTimeout(() => spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F']), timeout);
    child.on('error', (e) => resolve({ code: null, error: e.code || String(e) }));
    child.on('exit', (code) => {
      clearTimeout(t);
      resolve({ code });
    });
  });
}
async function waitFor(pred, ms) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(500)) if (pred()) return true;
  return pred();
}
function rmTree(dir) {
  for (let i = 0; i < 10; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return true;
    } catch {
      spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 700']);
    }
  }
  return !fs.existsSync(dir);
}

async function checkPortable(zipFile, { page, warp, extract, problems, out }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-portable-'));
  try {
    for (const e of readZip(fs.readFileSync(zipFile))) {
      const target = path.join(dir, ...e.name.split('/'));
      if (!target.startsWith(dir + path.sep)) throw new Error('zip entry outside the folder: ' + e.name);
      if (e.directory) fs.mkdirSync(target, { recursive: true });
      else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, e.data());
      }
    }
    const exe = path.join(dir, EXE);
    if (!fs.existsSync(exe)) return problems.push('portable zip: no ' + EXE + ' at its root');
    const fuses = await checkFuses(exe);
    problems.push(...fuses.problems.map((p) => 'portable fuses: ' + p));
    const asar = checkAsar(path.join(dir, 'resources', 'app.asar'), page);
    problems.push(...asar.problems.map((p) => 'portable app.asar: ' + p));
    out.portable = {
      fuses: fuses.problems.length === 0,
      asarPageSha256: asar.pageSha256,
      asarHeaderSha256: asar.headerSha256,
    };
    if (process.platform === 'win32') {
      const v = versionInfo(exe);
      out.portable.versionInfo = v;
      const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      const want = {
        CompanyName: OWNER,
        LegalCopyright: `Copyright (c) 2026 ${OWNER}`,
        ProductName: PRODUCT,
        FileDescription: PRODUCT,
      };
      for (const [k, w] of Object.entries(want))
        if (v[k] !== w) problems.push(`portable ${EXE} ${k} is "${v[k]}", expected "${w}"`);
      if (!String(v.ProductVersion).startsWith(version))
        problems.push(`portable ${EXE} version ${v.ProductVersion}, expected ${version}`);
      const st = await launch(exe, ['--lb-self-test=<nonce>', ...(warp ? ['--lb-warp'] : [])]);
      out.portable.selfTest = st.report
        ? { ok: st.report.ok, failure: st.report.failure, parity: st.report.steps?.parity?.engine }
        : st;
      if (!st.report || !st.report.ok)
        problems.push(
          'portable self-test failed: ' + (st.report ? st.report.failure : st.spawnError || `exit ${st.code}`),
        );
    }
    if (extract) {
      for (const f of ['resources/LICENSE.txt', 'resources/THIRD_PARTY_NOTICES.txt']) {
        fs.mkdirSync(path.join(extract, 'portable', path.dirname(f)), { recursive: true });
        fs.copyFileSync(path.join(dir, f), path.join(extract, 'portable', f));
      }
      const { extractFile } = await import('@electron/asar');
      for (const f of ASAR_FILES) {
        fs.mkdirSync(path.join(extract, 'app.asar', path.dirname(f)), { recursive: true });
        fs.writeFileSync(
          path.join(extract, 'app.asar', f),
          extractFile(path.join(dir, 'resources', 'app.asar'), f.split('/').join(path.sep)),
        );
      }
    }
  } finally {
    rmTree(dir);
  }
}

async function checkInstaller(setup, { page, warp, problems, out }) {
  const before = uninstallEntries();
  const links = shortcuts();
  if (before.length || links.some((l) => fs.existsSync(l))) {
    out.installer = {
      skipped: 'an installation or a shortcut of the product already exists for this user: not touched',
    };
    return;
  }
  const appData = path.join(process.env.APPDATA, PRODUCT);
  const profileExisted = fs.existsSync(appData);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-install-'));
  const dir = path.join(base, PRODUCT);
  const result = (out.installer = { dir: '%TEMP%\\' + path.basename(base) + '\\' + PRODUCT });
  let entry = null;
  try {
    const inst = await run(setup, ['/S', `/D=${dir}`]);
    result.install = inst;
    if (inst.error || inst.code !== 0) {
      problems.push(`installer: exit ${inst.code}${inst.error ? ' (' + inst.error + ')' : ''}`);
      return;
    }
    await waitFor(() => fs.existsSync(path.join(dir, EXE)) && uninstallEntries().length > 0, 30_000);
    entry = uninstallEntries()[0] || null;
    // electron-builder names the uninstaller after the executable and registers it (quoted) in the uninstall entry.
    const uninstaller = path.join(dir, `Uninstall ${path.basename(EXE, '.exe')}.exe`);
    const registered = entry && /^"([^"]+)"/.exec(entry.UninstallString || '');
    const real = (p) => (fs.existsSync(p) ? fs.realpathSync.native(p).toLowerCase() : p);
    result.installed = {
      exe: fs.existsSync(path.join(dir, EXE)),
      uninstaller: fs.existsSync(uninstaller),
      entry: !!registered && real(registered[1]) === real(uninstaller),
      version: entry && entry.DisplayVersion,
      publisher: entry && entry.Publisher,
      shortcuts: links.map((l) => fs.existsSync(l)),
    };
    const ok = result.installed;
    if (!ok.exe || !ok.uninstaller || !ok.entry || !ok.shortcuts.every(Boolean))
      problems.push('installer: incomplete installation ' + JSON.stringify(ok));
    if (ok.exe) {
      // The installed copy, not only the portable one: fuses read back, app.asar allowlist and page.
      const fuses = await checkFuses(path.join(dir, EXE));
      problems.push(...fuses.problems.map((p) => 'installed fuses: ' + p));
      const asar = checkAsar(path.join(dir, 'resources', 'app.asar'), page);
      problems.push(...asar.problems.map((p) => 'installed app.asar: ' + p));
      result.checks = { fuses: fuses.problems.length === 0, asarPageSha256: asar.pageSha256 };
      const st = await launch(path.join(dir, EXE), ['--lb-self-test=<nonce>', ...(warp ? ['--lb-warp'] : [])]);
      result.selfTest = st.report
        ? { ok: st.report.ok, failure: st.report.failure, parity: st.report.steps?.parity?.engine }
        : st;
      if (!st.report || !st.report.ok)
        problems.push(
          'installed self-test failed: ' + (st.report ? st.report.failure : st.spawnError || `exit ${st.code}`),
        );
    }
    // A stand-in for the player's profile, only if the folder did not exist: the uninstall must keep it.
    if (!profileExisted) {
      fs.mkdirSync(appData, { recursive: true });
      fs.writeFileSync(path.join(appData, 'release-check-marker.txt'), 'test marker\n');
    }
    if (ok.uninstaller) {
      const un = await run(uninstaller, ['/currentuser', '/S']);
      result.uninstall = un;
      // The NSIS uninstaller copies itself to %TEMP% and returns at once: wait for the real removal.
      const gone = await waitFor(() => !fs.existsSync(path.join(dir, EXE)) && uninstallEntries().length === 0, 90_000);
      result.removed = {
        files: !fs.existsSync(path.join(dir, EXE)),
        entry: uninstallEntries().length === 0,
        shortcuts: links.map((l) => !fs.existsSync(l)),
        profileKept: profileExisted
          ? 'not tested (the folder existed)'
          : fs.existsSync(path.join(appData, 'release-check-marker.txt')),
      };
      if (!gone || !result.removed.shortcuts.every(Boolean))
        problems.push('uninstall incomplete ' + JSON.stringify(result.removed));
      if (result.removed.profileKept === false) problems.push('the uninstaller removed the profile folder');
    }
  } finally {
    // Whatever happened, leave nothing of the test installation behind.
    const left = uninstallEntries();
    if (left.length && entry && left.some((e) => e.key === entry.key)) {
      result.forcedCleanup = true;
      problems.push('the test installation had to be removed by hand');
      ps(
        `Remove-Item -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${entry.key}' -Recurse -Force`,
      );
      // The installer's own key (Software\<app GUID>, the same GUID as the uninstall entry for a per-user install).
      if (/^[0-9a-f-]{36}$/i.test(entry.key))
        ps(
          `if (Test-Path 'HKCU:\\Software\\${entry.key}') { Remove-Item -LiteralPath 'HKCU:\\Software\\${entry.key}' -Recurse -Force }`,
        );
    }
    for (const l of links) if (fs.existsSync(l)) fs.rmSync(l, { force: true });
    rmTree(base);
    if (!profileExisted) rmTree(appData);
  }
}

export async function releaseCheck(folder, { page, warp = false, install = true, extract = null } = {}) {
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const names = {
    setup: `LittleBird-Trainer-Setup-${version}.exe`,
    portable: `LittleBird-Trainer-${version}-win-x64.zip`,
    web: `LittleBird-Trainer-${version}-navigateur.zip`,
  };
  const problems = [];
  const out = { version, files: {} };
  for (const f of fs.readdirSync(folder).sort()) {
    const p = path.join(folder, f);
    if (fs.statSync(p).isFile() && /\.(exe|zip|json|txt)$/.test(f))
      out.files[f] = { bytes: fs.statSync(p).size, sha256: sha(p) };
  }
  for (const k of ['setup', 'portable']) if (!out.files[names[k]]) problems.push('missing ' + names[k]);
  if (out.files[names.portable])
    await checkPortable(path.join(folder, names.portable), { page, warp, extract, problems, out });
  if (install && process.platform === 'win32' && out.files[names.setup])
    await checkInstaller(path.join(folder, names.setup), { page, warp, problems, out });
  return { ok: problems.length === 0, problems, ...out };
}

async function main() {
  const argv = process.argv.slice(2);
  const folder = argv[0];
  if (!folder || folder.startsWith('--')) {
    console.error(
      'usage: node scripts/release-check.mjs <release folder> [--page <index.html>] [--warp] [--skip-install] [--extract <dir>] [--json <file>]',
    );
    process.exit(2);
  }
  const opt = (k, d) => (argv.includes(k) ? path.resolve(argv[argv.indexOf(k) + 1]) : d);
  const r = await releaseCheck(path.resolve(folder), {
    page: opt('--page', path.join(ROOT, 'dist', 'web', 'index.html')),
    warp: argv.includes('--warp'),
    install: !argv.includes('--skip-install'),
    extract: opt('--extract', null),
  });
  if (argv.includes('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(r, null, 1) + '\n');
  for (const [f, { bytes, sha256 }] of Object.entries(r.files))
    console.log(`${sha256}  ${f}  (${(bytes / 1048576).toFixed(1)} MB)`);
  for (const p of r.problems) console.error('FAIL ' + p);
  if (!r.ok) process.exit(1);
  console.log(
    'release-check: OK' +
      (r.installer && r.installer.skipped ? ' (installer not run: ' + r.installer.skipped + ')' : ''),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
