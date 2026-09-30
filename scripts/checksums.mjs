#!/usr/bin/env node
// SHA256SUMS.txt of a release folder, in the format of GNU sha256sum ("<hex>  <name>", names sorted), so that
// `sha256sum --check SHA256SUMS.txt` and PowerShell's Get-FileHash can both verify a download.
//   node scripts/checksums.mjs <folder>            writes <folder>/SHA256SUMS.txt (every file but itself)
//   node scripts/checksums.mjs <folder> --check    verifies <folder>/SHA256SUMS.txt (every listed file, no other)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const SUMS = 'SHA256SUMS.txt';
const sha256File = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

export function sums(dir) {
  const names = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== SUMS)
    .map((e) => e.name)
    .sort();
  if (!names.length) throw new Error('no file to list in ' + dir);
  for (const n of names) if (/[\s*\\]/.test(n)) throw new Error('file name with a space, star or backslash: ' + n);
  return names.map((n) => `${sha256File(path.join(dir, n))}  ${n}`).join('\n') + '\n';
}

export function check(dir) {
  const text = fs.readFileSync(path.join(dir, SUMS), 'utf8');
  const problems = [];
  const listed = new Set();
  for (const line of text.split('\n').filter(Boolean)) {
    const m = /^([0-9a-f]{64}) {2}(\S+)$/.exec(line);
    if (!m) {
      problems.push('malformed line: ' + line.slice(0, 80));
      continue;
    }
    listed.add(m[2]);
    const f = path.join(dir, m[2]);
    if (!fs.existsSync(f)) problems.push('missing: ' + m[2]);
    else if (sha256File(f) !== m[1]) problems.push('sha256 differs: ' + m[2]);
  }
  for (const e of fs.readdirSync(dir, { withFileTypes: true }))
    if (e.isFile() && e.name !== SUMS && !listed.has(e.name)) problems.push('not listed: ' + e.name);
  return problems;
}

function main() {
  const [dir, flag] = process.argv.slice(2);
  if (!dir) {
    console.error('usage: node scripts/checksums.mjs <folder> [--check]');
    process.exit(2);
  }
  if (flag === '--check') {
    const problems = check(dir);
    for (const p of problems) console.error('FAIL ' + p);
    if (problems.length) process.exit(1);
    console.log(`checksums: OK ${SUMS} matches every file of ${path.basename(path.resolve(dir))}`);
    return;
  }
  const text = sums(dir);
  fs.writeFileSync(path.join(dir, SUMS), text);
  process.stdout.write(text);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
