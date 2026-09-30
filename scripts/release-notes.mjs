#!/usr/bin/env node
// Release gate and notes (release workflow, job preflight). Fails unless the tag is vX.Y.Z, equals package.json's
// version, CHANGELOG.md has a "## [X.Y.Z] — AAAA-MM-JJ" section (a real release must be dated; a dry run accepts the
// undated "non publiée" heading) and the French release notes docs/notes-de-version/<version>.md exist. The notes are
// written by hand for players (what the program is, its status, which file to take, the Windows SmartScreen and Smart
// App Control notice with the browser version as the fallback, how to check SHA-256 sums and attestations); their
// placeholders {{version}}, {{repo}} and {{page_sha256}} are filled here, the sha256 of the browser page letting anyone
// rebuild it from the tag and compare. The CHANGELOG section follows them. A 0.x version is a pre-release (the release
// workflow creates the draft with --prerelease).
//   node scripts/release-notes.mjs <tag|--dry-run> <out.md> [--page dist/web/index.html]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'sylvainarnauda-shining/littlebird-trainer';
export const notesPath = (version) => `docs/notes-de-version/${version}.md`;
// A 0.x version is published as a pre-release.
export const isPrerelease = (version) => /^0\./.test(version);
// What the hand-written notes must tell every player (checked after the placeholders are filled).
export const REQUIRED_IN_NOTES = [
  ['SmartScreen', 'the SmartScreen notice'],
  ['Contrôle intelligent des applications', 'the Smart App Control notice'],
  ['navigateur.zip', 'the browser version as the fallback'],
  ['SHA256SUMS.txt', 'the SHA-256 sums'],
  ['gh attestation verify', 'the attestation check'],
];

export function releaseNotes({ tag, dryRun = false, pkg, changelog, notes = null, pageSha256 = null }) {
  const version = dryRun ? pkg.version : /^v(\d+\.\d+\.\d+)$/.exec(tag || '')?.[1];
  if (!version) throw new Error(`tag "${tag}" is not vX.Y.Z`);
  if (version !== pkg.version) throw new Error(`tag ${tag} does not match package.json version ${pkg.version}`);
  const esc = version.replace(/\./g, '\\.');
  const start = changelog.search(new RegExp(`^## \\[${esc}\\]`, 'm'));
  if (start < 0) throw new Error(`CHANGELOG.md has no "## [${version}]" section`);
  const next = changelog.slice(start + 1).search(/^## \[/m);
  const section = (next < 0 ? changelog.slice(start) : changelog.slice(start, start + 1 + next)).trim();
  const heading = section.split('\n')[0];
  if (!dryRun && !/— \d{4}-\d{2}-\d{2}\s*$/.test(heading))
    throw new Error(
      `the CHANGELOG.md heading of ${version} must carry the release date ("## [${version}] — AAAA-MM-JJ")`,
    );
  const body = section.replace(/^## .*\n/, '').trim();
  if (!body) throw new Error(`the CHANGELOG.md section of ${version} is empty`);
  if (!notes) throw new Error(`${notesPath(version)} is missing (the French release notes of ${version})`);
  if (!pageSha256 && !dryRun) throw new Error('the sha256 of the browser page is required (--page)');
  const filled = notes
    .replaceAll('{{version}}', version)
    .replaceAll('{{repo}}', REPO)
    .replaceAll('{{page_sha256}}', pageSha256 || 'non calculée (essai sans --page)')
    .trim();
  const left = /\{\{[^}]*\}\}/.exec(filled);
  if (left) throw new Error(`${notesPath(version)}: unknown placeholder ${left[0]}`);
  for (const [text, what] of REQUIRED_IN_NOTES)
    if (!filled.includes(text)) throw new Error(`${notesPath(version)} must give ${what} ("${text}")`);
  if (isPrerelease(version) && !/préversion/i.test(filled))
    throw new Error(`${notesPath(version)} must say that ${version} is a pre-release ("préversion")`);
  return `${filled}

---

## Journal des modifications

${body}
`;
}

function main() {
  const argv = process.argv.slice(2);
  const [tag, out] = argv;
  if (!tag || !out) {
    console.error('usage: node scripts/release-notes.mjs <vX.Y.Z|--dry-run> <out.md> [--page <index.html>]');
    process.exit(2);
  }
  const i = argv.indexOf('--page');
  const page = i > 0 ? fs.readFileSync(path.resolve(argv[i + 1])) : null;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const notesFile = path.join(ROOT, notesPath(pkg.version));
    const notes = releaseNotes({
      tag,
      dryRun: tag === '--dry-run',
      pkg,
      changelog: fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'),
      notes: fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8') : null,
      pageSha256: page ? crypto.createHash('sha256').update(page).digest('hex') : null,
    });
    fs.writeFileSync(out, notes);
    console.log(`release-notes: ${out} written (${isPrerelease(pkg.version) ? 'pre-release' : 'release'})`);
  } catch (e) {
    console.error('release gate: ' + e.message);
    process.exit(1);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
