#!/usr/bin/env node
// The browser download LittleBird-Trainer-<version>-navigateur.zip: the built page and three texts, deterministic
// (scripts/zip.mjs: fixed order, one timestamp, no platform attributes), so Linux and Windows give the same bytes.
// Timestamp: SOURCE_DATE_EPOCH, else the last commit's time, else 2026-01-01.
//   node scripts/make-web-zip.mjs [--page dist/web/index.html] [--out release]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeZip } from './zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WEB_ZIP_FILES = [
  ['index.html', null],
  ['LISEZ-MOI.txt', 'docs/LISEZ-MOI-navigateur.txt'],
  ['LICENSE.txt', 'LICENSE'],
  ['THIRD_PARTY_NOTICES.txt', 'THIRD_PARTY_NOTICES.md'],
];

export function sourceEpoch() {
  if (process.env.SOURCE_DATE_EPOCH) return Number.parseInt(process.env.SOURCE_DATE_EPOCH, 10);
  const r = spawnSync('git', ['log', '-1', '--format=%ct'], { cwd: ROOT, encoding: 'utf8' });
  const t = r.status === 0 ? Number.parseInt(r.stdout.trim(), 10) : NaN;
  return Number.isFinite(t) ? t : Date.UTC(2026, 0, 1) / 1000;
}

export function webZip(page, { epoch, root = ROOT } = {}) {
  const files = WEB_ZIP_FILES.map(([name, src]) => ({
    name,
    data: src ? Buffer.from(fs.readFileSync(path.join(root, src), 'utf8').replace(/\r\n?/g, '\n'), 'utf8') : page,
  }));
  return writeZip(files, { epoch });
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (k, d) => (argv.includes(k) ? path.resolve(argv[argv.indexOf(k) + 1]) : d);
  const page = fs.readFileSync(opt('--page', path.join(ROOT, 'dist', 'web', 'index.html')));
  const out = opt('--out', path.join(ROOT, 'release'));
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const file = path.join(out, `LittleBird-Trainer-${version}-navigateur.zip`);
  fs.mkdirSync(out, { recursive: true });
  const epoch = sourceEpoch();
  fs.writeFileSync(file, webZip(page, { epoch }));
  console.log(`make-web-zip: ${path.basename(file)} (${fs.statSync(file).size} bytes, time ${epoch})`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
