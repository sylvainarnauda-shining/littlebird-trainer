#!/usr/bin/env node
// Supply-chain gate (CI job deps): every package of package-lock.json that declares an install script
// (preinstall/install/postinstall, recorded by npm as "hasInstallScript") must be in the reviewed list of
// publish-policy.json (installScriptsReviewed, name@version). With ignore-scripts=true (.npmrc) none of them runs; the
// gate makes a new one visible in review, because it would run on a machine without that setting. Zero dependencies.
//  - a package with an install script that is not listed fails: a NEW one (no version of it is listed) or a CHANGED one
//    (another version is listed; the new version is reviewed and listed like a new package);
//  - a listed entry that is no longer in the lockfile (a dependency update removed it) is no risk: a warning names it
//    and says how to prune it; `--prune` removes such entries from publish-policy.json and never adds one. A listed
//    version whose package is in the lockfile at an unreviewed version stays listed (the CHANGED failure names it) until
//    the new version is reviewed.
//   node scripts/check-install-scripts.mjs [--prune] [package-lock.json] [publish-policy.json]
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

// The package name of a name@version entry (a scoped name keeps its leading @).
export const packageName = (id) => id.slice(0, id.lastIndexOf('@') > 0 ? id.lastIndexOf('@') : id.length);

// found: the lockfile's install-script packages; reviewed: the policy's list. ok is false when a package of the
// lockfile is not reviewed (added: no version of it listed; changed: another version listed); gone lists the reviewed
// entries the lockfile no longer holds, except the versions of a changed package (a warning, never a failure).
export function installScriptVerdict(found, reviewed) {
  const listed = new Set(reviewed);
  const versions = new Map();
  for (const r of reviewed) versions.set(packageName(r), [...(versions.get(packageName(r)) || []), r]);
  const unreviewed = found.filter((p) => !listed.has(p));
  const changed = unreviewed
    .filter((p) => versions.has(packageName(p)))
    .map((p) => ({ package: p, reviewed: versions.get(packageName(p)) }));
  const replaced = new Set(changed.map((c) => packageName(c.package)));
  return {
    ok: unreviewed.length === 0,
    added: unreviewed.filter((p) => !versions.has(packageName(p))),
    changed,
    gone: reviewed.filter((p) => !found.includes(p) && !replaced.has(packageName(p))),
  };
}

// The policy text with the given entries removed from installScriptsReviewed and every other byte kept (the list is
// written as Prettier writes it: on one line when it fits in 120 columns, one entry per line otherwise).
export function pruneReviewed(policyText, remove) {
  const policy = JSON.parse(policyText);
  const keep = (policy.installScriptsReviewed || []).filter((p) => !remove.includes(p));
  const re = /^( *)("installScriptsReviewed"\s*:\s*)\[[^\]]*\]/m;
  const m = re.exec(policyText);
  if (!m) throw new Error('installScriptsReviewed not found in the policy');
  const inline = m[1] + m[2] + '[' + keep.map((p) => JSON.stringify(p)).join(', ') + ']';
  const list =
    inline.length + 1 <= 120 || !keep.length
      ? inline
      : m[1] + m[2] + '[\n' + keep.map((p) => m[1] + '  ' + JSON.stringify(p)).join(',\n') + '\n' + m[1] + ']';
  const out = policyText.slice(0, m.index) + list + policyText.slice(m.index + m[0].length);
  const back = JSON.parse(out);
  if (JSON.stringify(back.installScriptsReviewed) !== JSON.stringify(keep)) throw new Error('prune: unexpected result');
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const prune = argv.includes('--prune');
  const [lockPath = 'package-lock.json', policyPath = 'publish-policy.json'] = argv.filter((a) => a !== '--prune');
  const found = installScripts(JSON.parse(fs.readFileSync(lockPath, 'utf8')));
  const policyText = fs.readFileSync(policyPath, 'utf8');
  const reviewed = JSON.parse(policyText).installScriptsReviewed || [];
  const v = installScriptVerdict(found, reviewed);
  for (const p of v.added)
    console.error(`FAIL NEW install script, review it then add it to installScriptsReviewed: ${p}`);
  for (const c of v.changed)
    console.error(
      `FAIL CHANGED version of a package with an install script, review it then list it in installScriptsReviewed: ` +
        `${c.package} (reviewed: ${c.reviewed.join(', ')})`,
    );
  if (v.gone.length && prune) {
    fs.writeFileSync(policyPath, pruneReviewed(policyText, v.gone));
    console.log(`pruned from installScriptsReviewed (no longer in the lockfile): ${v.gone.join(', ')}`);
  } else
    for (const p of v.gone) {
      const msg =
        `listed in installScriptsReviewed but no longer in the lockfile (a dependency update removed it; no risk): ${p}. ` +
        'Prune the list with: node scripts/check-install-scripts.mjs --prune';
      console.log((process.env.GITHUB_ACTIONS === 'true' ? '::warning::' : 'WARN ') + msg);
    }
  console.log(
    `check-install-scripts: ${found.length} package(s) declare install scripts (none runs: ignore-scripts=true); ` +
      `${v.added.length + v.changed.length} not reviewed, ${prune ? 0 : v.gone.length} stale entr${v.gone.length === 1 && !prune ? 'y' : 'ies'} in the reviewed list`,
  );
  process.exit(v.ok ? 0 : 1);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
