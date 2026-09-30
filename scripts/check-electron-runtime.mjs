#!/usr/bin/env node
// G-DESK: the Electron runtime files of a packaged app are the official ones. The official release zip of the pinned
// Electron (electron-builder's download cache, or --zip) is first checked against the sha256 published in the pinned
// electron package (node_modules/electron/checksums.json); then every file of the packaged folder is compared with
// its entry in that zip, byte for byte. Allowed differences, and only these: the executable (renamed, icon and version
// strings edited, fuses flipped, asar integrity resource added: checked by check-fuses and the self-test), Electron's
// LICENSE renamed LICENSE.electron.txt, the locales other than fr and en-US removed, the default app replaced by our
// resources (app.asar, LICENSE.txt, THIRD_PARTY_NOTICES.txt).
//   node scripts/check-electron-runtime.mjs <win-unpacked folder> [--zip <electron-vX-win32-x64.zip>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readZip } from './zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OURS = [
  'LittleBirdTrainer.exe',
  'resources/app.asar',
  'resources/LICENSE.txt',
  'resources/THIRD_PARTY_NOTICES.txt',
];
const RENAMED = { 'LICENSE.electron.txt': 'LICENSE' };
const KEPT_LOCALES = ['locales/fr.pak', 'locales/en-US.pak'];
const REMOVED = ['electron.exe', 'resources/default_app.asar', 'LICENSE', 'version'];

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function walk(dir, rel = '', out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r, out);
    else out.push(r);
  }
  return out;
}
function findZip(name) {
  const roots = [process.env.ELECTRON_CACHE, path.join(process.env.LOCALAPPDATA || os.homedir(), 'electron', 'Cache')];
  roots.push(path.join(os.homedir(), '.cache', 'electron'), path.join(os.homedir(), 'Library', 'Caches', 'electron'));
  for (const r of roots.filter(Boolean)) {
    if (!fs.existsSync(r)) continue;
    const hit = walk(r).find((f) => path.basename(f) === name);
    if (hit) return path.join(r, hit);
  }
  return null;
}

export function checkRuntime(folder, { zip = null } = {}) {
  const version = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8'),
  ).version;
  const name = `electron-v${version}-win32-x64.zip`;
  const sums = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'checksums.json'), 'utf8'));
  const zipPath = zip || findZip(name);
  const problems = [];
  if (!zipPath) return { problems: [`${name} not found in the Electron download cache (pass --zip)`] };
  const buf = fs.readFileSync(zipPath);
  if (sha(buf) !== sums[name]) problems.push(`${name} does not match its published sha256`);
  const entries = new Map(
    readZip(buf)
      .filter((e) => !e.directory)
      .map((e) => [e.name, e]),
  );
  const files = walk(folder);
  let same = 0;
  for (const f of files) {
    if (OURS.includes(f)) continue;
    const entry = entries.get(RENAMED[f] || f);
    if (!entry) {
      problems.push('not an official Electron file: ' + f);
      continue;
    }
    if (!entry.data().equals(fs.readFileSync(path.join(folder, f))))
      problems.push('differs from the official file: ' + f);
    else same++;
  }
  for (const e of entries.keys()) {
    const kept = files.includes(e) || Object.values(RENAMED).includes(e);
    const removed = REMOVED.includes(e) || (e.startsWith('locales/') && !KEPT_LOCALES.includes(e));
    if (!kept && !removed) problems.push('official file missing from the package: ' + e);
  }
  for (const f of OURS) if (!files.includes(f)) problems.push('missing: ' + f);
  return { problems, version, same, zip: path.basename(zipPath) };
}

function main() {
  const argv = process.argv.slice(2);
  const folder = argv[0];
  if (!folder) {
    console.error('usage: node scripts/check-electron-runtime.mjs <win-unpacked folder> [--zip <file>]');
    process.exit(2);
  }
  const i = argv.indexOf('--zip');
  const r = checkRuntime(path.resolve(folder), { zip: i > 0 ? path.resolve(argv[i + 1]) : null });
  for (const p of r.problems) console.error('FAIL ' + p);
  if (r.problems.length) process.exit(1);
  console.log(
    `check-electron-runtime: OK Electron ${r.version}: ${r.same} runtime files equal the official ${r.zip} (sha256 as published)`,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
