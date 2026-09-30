#!/usr/bin/env node
// Supply-chain gate (CI job deps): the packages of package-lock.json that declare an install script
// (preinstall/install/postinstall, recorded by npm as "hasInstallScript") must be exactly the reviewed list in
// publish-policy.json (installScriptsReviewed). With ignore-scripts=true (.npmrc) none of them runs; the gate makes a
// new one visible in review, because it would run on a machine without that setting. Zero dependencies.
//   node scripts/check-install-scripts.mjs [package-lock.json] [publish-policy.json]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function installScripts(lock) {
  if (!lock.packages || lock.lockfileVersion < 2) throw new Error('lockfileVersion 2 or 3 required');
  const found = new Set();
  for (const [key, entry] of Object.entries(lock.packages))
    if (key && entry.hasInstallScript) found.add(`${key.replace(/^.*node_modules\//, '')}@${entry.version}`);
  return [...found].sort();
}

function main() {
  const lockPath = process.argv[2] || 'package-lock.json';
  const policyPath = process.argv[3] || 'publish-policy.json';
  const found = installScripts(JSON.parse(fs.readFileSync(lockPath, 'utf8')));
  const reviewed = JSON.parse(fs.readFileSync(policyPath, 'utf8')).installScriptsReviewed || [];
  const added = found.filter((p) => !reviewed.includes(p));
  const gone = reviewed.filter((p) => !found.includes(p));
  for (const p of added) console.error(`NEW install script, review it then add it to installScriptsReviewed: ${p}`);
  for (const p of gone) console.error(`listed in installScriptsReviewed but no longer in the lockfile: ${p}`);
  console.log(
    `check-install-scripts: ${found.length} package(s) declare install scripts (none runs: ignore-scripts=true); ` +
      `${added.length + gone.length} difference(s) with the reviewed list`,
  );
  process.exit(added.length || gone.length ? 1 : 0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
