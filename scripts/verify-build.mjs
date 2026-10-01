#!/usr/bin/env node
// Checks a built page against the page policy (scripts/page-policy.mjs), fail closed:
//  - exactly one Content-Security-Policy meta tag, right after the charset and before any inline block, whose content
//    is exactly the expected string: default-src 'none', the sha256 of each inline script in order (the error
//    handler, then one per file of the build's script list), the sha256 of the one inline stylesheet, every other fetch
//    directive plus base-uri and form-action 'none';
//  - no external reference, inline handler, javascript: URL or style attribute in the markup;
//  - the three.js block is the pinned file; no network or dynamic-code API in the page's own scripts, and in three.js
//    exactly the recorded counts;
//  - with the sources: each inline script equals its source file (LF), the stylesheet equals style.css;
//  - no version placeholder left; with a version (the command line passes package.json's), the menu header and the
//    "À propos" tab both show exactly that version.
//   node scripts/verify-build.mjs [--page dist/web/index.html] [--src src] [--no-rebuild]
// The command line also checks csp.txt beside the page and, unless --no-rebuild, that a fresh build of the sources
// gives the page byte for byte (reproducible build).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CHARSET,
  THREE_API_COUNTS,
  apiCounts,
  cspMeta,
  cspPolicy,
  inlineBlocks,
  markupProblems,
  shownVersions,
} from './page-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lf = (s) => s.replace(/\r\n?/g, '\n');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// scripts: the build's script list (scripts/build.mjs SCRIPTS), which the page inlines in order after its error handler.
export function verifyPage(html, { threeSha256, srcDir = null, scripts, version = null } = {}) {
  const problems = [];
  const metas = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g)];
  if (metas.length !== 1 || (html.match(/http-equiv/gi) || []).length !== 1)
    problems.push('exactly one Content-Security-Policy meta tag expected, found ' + metas.length);
  const csp = metas.length ? metas[0][1] : '';
  const blocks = inlineBlocks(html);
  if (blocks.scripts.length !== scripts.length + 1)
    problems.push(`${scripts.length + 1} inline scripts expected, found ${blocks.scripts.length}`);
  if (blocks.styles.length !== 1) problems.push('1 inline stylesheet expected, found ' + blocks.styles.length);
  const expected = cspPolicy(blocks);
  if (csp !== expected) problems.push('the policy is not the expected string');
  if (/'unsafe-|'strict-dynamic'|\*|https?:|data:|blob:|filesystem:/i.test(csp))
    problems.push('the policy opens a source it must not');
  const at = html.indexOf(CHARSET + cspMeta(csp));
  // The first <script or <style start tag, in any letter case (a policy in a <meta> does not cover what comes before it).
  const first = html.search(/<(script|style)[\t\n\f\r />]/i);
  if (at < 0 || (first >= 0 && at > first))
    problems.push('the policy must follow the charset and come before any inline block');
  problems.push(...markupProblems(html.replace(cspMeta(csp), '')));
  const three = blocks.scripts[1] || '';
  if (!three.startsWith('\n') || !three.endsWith('\n')) problems.push('three.js block framing');
  else if (threeSha256 && crypto.createHash('sha256').update(three.slice(1, -1), 'utf8').digest('hex') !== threeSha256)
    problems.push('the three.js block is not the pinned file');
  if (!same(apiCounts(three), THREE_API_COUNTS))
    problems.push('three.js API counts differ from the recorded ones: ' + JSON.stringify(apiCounts(three)));
  blocks.scripts.forEach((body, i) => {
    if (i === 1) return;
    const found = apiCounts(body);
    if (Object.keys(found).length) problems.push(`inline script ${i} uses ${Object.keys(found).join(', ')}`);
  });
  if (srcDir) {
    scripts.forEach((f, i) => {
      const src = lf(fs.readFileSync(path.join(srcDir, f), 'utf8')).replace(/<\/script/gi, '<\\/script');
      if (blocks.scripts[i + 1] !== '\n' + src + '\n') problems.push(f + ' is not inlined unchanged');
    });
    if (blocks.styles[0] !== lf(fs.readFileSync(path.join(srcDir, 'style.css'), 'utf8')))
      problems.push('style.css is not inlined unchanged');
  }
  if (version !== null) {
    const shown = shownVersions(html);
    if (shown.menu !== version || shown.about !== version)
      problems.push(`the page shows version ${JSON.stringify(shown)}, expected ${version} in the menu and À propos`);
  }
  return { ok: problems.length === 0, problems, csp, scripts: blocks.scripts.length, styles: blocks.styles.length };
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (k, d) => (argv.includes(k) ? path.resolve(argv[argv.indexOf(k) + 1]) : d);
  const page = opt('--page', path.join(ROOT, 'dist', 'web', 'index.html'));
  const src = opt('--src', path.join(ROOT, 'src'));
  const { SCRIPTS, pinnedThree, buildPage, packageVersion } = await import('./build.mjs');
  if (!fs.existsSync(page)) {
    console.error('verify-build: ' + page + ' is missing (npm run build)');
    process.exit(1);
  }
  const html = fs.readFileSync(page, 'utf8');
  const version = packageVersion();
  const report = verifyPage(html, { threeSha256: pinnedThree(), srcDir: src, scripts: SCRIPTS, version });
  const txt = path.join(path.dirname(page), 'csp.txt');
  if (!fs.existsSync(txt) || fs.readFileSync(txt, 'utf8') !== report.csp + '\n')
    report.problems.push('csp.txt does not hold the page policy');
  if (!argv.includes('--no-rebuild') && buildPage(src) !== html)
    report.problems.push('a fresh build of the sources differs from the page');
  if (report.problems.length) {
    for (const p of report.problems) console.error('FAIL ' + p);
    process.exit(1);
  }
  const sum = crypto.createHash('sha256').update(html).digest('hex');
  console.log(
    `verify-build: OK ${path.relative(ROOT, page).replace(/\\/g, '/')} sha256 ${sum}: ${report.scripts} scripts and ${report.styles} stylesheet hashed, policy exact, nothing else allowed; shows version ${version}.`,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
