#!/usr/bin/env node
// G-DESK / G-REPRO: the packaged app.asar holds exactly the allowlisted files, nothing unpacked beside it; its page is
// byte for byte the reference page (the local build, or in the release workflow the page built on Linux); its shell
// files are the repository's desktop/ files; its package.json is the project's, without scripts or dependencies.
//   node scripts/check-asar.mjs <app.asar> <reference index.html> [--extract <dir>]
// --extract writes every file of the archive under <dir> (for the privacy scan of the shipped text).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listPackage, extractFile, statFile, getRawHeader } from '@electron/asar';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Equal to the files list of electron-builder.yml (tests/desktop/config.test.js).
export const ASAR_FILES = [
  'package.json',
  'desktop/main.cjs',
  'desktop/policy.cjs',
  'desktop/self-test.cjs',
  'desktop/parity.cjs',
  'dist/web/index.html',
];
const DIRS = ['desktop', 'dist', 'dist/web'];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const native = (f) => f.split('/').join(path.sep);
const lf = (b) => Buffer.from(b.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8');

export function checkAsar(archive, referencePage, { root = ROOT } = {}) {
  const problems = [];
  const entries = listPackage(archive, { isPack: false })
    .map((p) => p.replace(/\\/g, '/').replace(/^\//, ''))
    .sort();
  const want = [...ASAR_FILES, ...DIRS].sort();
  for (const e of entries) if (!want.includes(e)) problems.push('unexpected entry in app.asar: ' + e);
  for (const w of want) if (!entries.includes(w)) problems.push('missing from app.asar: ' + w);
  for (const f of ASAR_FILES.filter((f) => entries.includes(f))) {
    const st = statFile(archive, native(f));
    if (st.unpacked) problems.push(f + ' is unpacked beside the archive');
  }
  const unpackedDir = archive + '.unpacked';
  if (fs.existsSync(unpackedDir)) problems.push('app.asar.unpacked exists');
  const page = entries.includes('dist/web/index.html')
    ? extractFile(archive, native('dist/web/index.html'))
    : Buffer.alloc(0);
  const ref = fs.readFileSync(referencePage);
  if (!page.equals(ref)) problems.push('the page in app.asar differs from ' + path.basename(referencePage));
  for (const f of ASAR_FILES.filter((f) => f.startsWith('desktop/') && entries.includes(f))) {
    const mine = lf(fs.readFileSync(path.join(root, f)));
    if (!lf(extractFile(archive, native(f))).equals(mine)) problems.push(f + ' differs from the repository file');
  }
  let pkg = null;
  if (entries.includes('package.json')) {
    pkg = JSON.parse(extractFile(archive, native('package.json')).toString('utf8'));
    const own = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    for (const k of ['name', 'productName', 'version', 'main', 'license'])
      if (pkg[k] !== own[k])
        problems.push(`package.json ${k} is ${JSON.stringify(pkg[k])}, expected ${JSON.stringify(own[k])}`);
    for (const k of ['scripts', 'dependencies', 'optionalDependencies'])
      if (pkg[k] && Object.keys(pkg[k]).length) problems.push(`package.json in app.asar has ${k}`);
  }
  const { headerString } = getRawHeader(archive);
  return {
    problems,
    entries,
    pageSha256: sha(page),
    headerSha256: sha(Buffer.from(headerString, 'utf8')),
    version: pkg && pkg.version,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const [archive, reference] = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--extract');
  if (!archive || !reference) {
    console.error('usage: node scripts/check-asar.mjs <app.asar> <reference index.html> [--extract <dir>]');
    process.exit(2);
  }
  const r = checkAsar(path.resolve(archive), path.resolve(reference));
  const i = argv.indexOf('--extract');
  if (i >= 0) {
    const dir = path.resolve(argv[i + 1]);
    for (const f of ASAR_FILES) {
      if (!r.entries.includes(f)) continue;
      fs.mkdirSync(path.join(dir, 'app.asar', path.dirname(f)), { recursive: true });
      fs.writeFileSync(path.join(dir, 'app.asar', f), extractFile(path.resolve(archive), native(f)));
    }
  }
  for (const p of r.problems) console.error('FAIL ' + p);
  if (r.problems.length) process.exit(1);
  console.log(
    `check-asar: OK ${ASAR_FILES.length} files, nothing unpacked; page sha256 ${r.pageSha256} equals the reference; ` +
      `shell files equal desktop/; header sha256 ${r.headerSha256}`,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
