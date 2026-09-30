#!/usr/bin/env node
// Weekly gate (maintenance workflow, docs/PUBLIER-UNE-VERSION.md): the Chromium shipped in the desktop app must stay patched. Electron
// supports its latest three major lines and ships security fixes as patch releases. Fails (a failed scheduled run
// e-mails the maintainer) when:
//  - the pinned Electron major is out of support (older than the latest major minus 2), or
//  - a newer release of the pinned major line has been public for more than 30 days (chosen: release within 30 days of
//    an Electron patch; within 7 days when Chromium marks a fixed bug as exploited in the wild, which the maintainer
//    reads in the Electron release notes: this script cannot see it).
// Reads the pinned version from package-lock.json and the public npm registry (no token). Zero dependencies.
//   node scripts/check-support-window.mjs [package-lock.json]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const GRACE_DAYS = 30;

// pinned: exact version; tags: npm dist-tags of electron; time: npm publication times; now: ms.
export function supportProblems({ pinned, tags, time, now }) {
  const problems = [];
  const notes = [];
  const major = Number(pinned.split('.')[0]);
  const latestMajor = Number(String(tags.latest).split('.')[0]);
  if (major < latestMajor - 2)
    problems.push(`Electron ${major} is out of support (latest major ${latestMajor}): move to a supported major line.`);
  const newest = tags[`${major}-x-y`] || pinned;
  if (newest !== pinned) {
    const days = (now - Date.parse(time[newest])) / 86400000;
    const msg = `Electron ${newest} has been public for ${days.toFixed(0)} day(s); ${pinned} is shipped.`;
    if (days > GRACE_DAYS)
      problems.push(`${msg} Merge the Dependabot update and release (the rule: within ${GRACE_DAYS} days).`);
    else notes.push(`${msg} Within the ${GRACE_DAYS}-day window (7 days if it fixes a bug exploited in the wild).`);
  }
  return { problems, notes, major, latestMajor, newest };
}

async function main() {
  const lock = JSON.parse(fs.readFileSync(process.argv[2] || 'package-lock.json', 'utf8'));
  const pinned = lock.packages?.['node_modules/electron']?.version;
  if (!/^\d+\.\d+\.\d+$/.test(pinned || ''))
    throw new Error('electron is not pinned to an exact version in package-lock.json');
  const get = async (url) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  };
  const tags = await get('https://registry.npmjs.org/-/package/electron/dist-tags');
  const { time } = await get('https://registry.npmjs.org/electron');
  const r = supportProblems({ pinned, tags, time, now: Date.now() });
  console.log(`Pinned electron ${pinned}; latest ${tags.latest}; newest ${r.major}.x: ${r.newest}.`);
  for (const n of r.notes) console.log(n);
  for (const p of r.problems) console.error(p);
  process.exit(r.problems.length ? 1 : 0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
