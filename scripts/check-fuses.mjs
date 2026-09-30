#!/usr/bin/env node
// G-DESK: reads the fuse wire of a packaged executable back and compares it with build/fuses.cjs. Fails on any
// difference, on a fuse the table does not decide, or on a missing wire.
//   node scripts/check-fuses.mjs <LittleBirdTrainer.exe>
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getCurrentFuseWire, FuseV1Options, FuseState } from '@electron/fuses';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { FUSES } = createRequire(import.meta.url)(path.join(ROOT, 'build', 'fuses.cjs'));

export async function checkFuses(exe) {
  const wire = await getCurrentFuseWire(exe);
  const problems = [];
  const seen = [];
  if (wire.version !== '1') problems.push(`fuse wire version ${wire.version}, expected 1`);
  for (const key of Object.keys(wire).filter((k) => k !== 'version')) {
    const name = FuseV1Options[key];
    const state = wire[key];
    if (!name || !(name in FUSES)) {
      if (state !== FuseState.REMOVED) problems.push(`fuse ${name || '#' + key} is not decided by build/fuses.cjs`);
      continue;
    }
    const want = FUSES[name] ? FuseState.ENABLE : FuseState.DISABLE;
    seen.push(name);
    if (state !== want) problems.push(`${name} is ${stateName(state)}, expected ${stateName(want)}`);
  }
  for (const name of Object.keys(FUSES)) if (!seen.includes(name)) problems.push(`${name} is absent from the wire`);
  return { problems, fuses: Object.fromEntries(seen.map((n) => [n, FUSES[n]])) };
}
const stateName = (s) =>
  ({ [FuseState.ENABLE]: 'on', [FuseState.DISABLE]: 'off', [FuseState.REMOVED]: 'removed' })[s] || s;

async function main() {
  const exe = process.argv[2];
  if (!exe) {
    console.error('usage: node scripts/check-fuses.mjs <LittleBirdTrainer.exe>');
    process.exit(2);
  }
  const { problems, fuses } = await checkFuses(path.resolve(exe));
  for (const p of problems) console.error('FAIL ' + p);
  if (problems.length) process.exit(1);
  const list = Object.entries(fuses).map(([n, on]) => `${n} ${on ? 'on' : 'off'}`);
  console.log(`check-fuses: OK ${path.basename(exe)}: ${list.join(', ')}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
