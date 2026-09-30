#!/usr/bin/env node
// Privacy and IP scanner of the public repository (zero dependencies). It reports "rule file:line" and never prints
// the text it matched, so a terminal or CI log cannot leak what it found.
//   node scripts/privacy-scan.mjs [--tracked]    the files git would publish (tracked, plus untracked files not ignored)
//   node scripts/privacy-scan.mjs --staged       the staged content a commit would record (type changes included), and
//                                                the commit identity
//   node scripts/privacy-scan.mjs --history      every path and blob of every commit reachable from HEAD (a blob is
//                                                checked under each path it ever had), every commit message and identity,
//                                                every annotated tag on one of those commits (tagger and message). In a
//                                                pull request run HEAD is GitHub's test merge commit: the base branch's
//                                                history and the pull request's commits, not other branches.
//     --rev <rev>                                the history reachable from <rev> instead of HEAD (repeatable; the
//                                                pre-push hook passes every revision being pushed); an annotated tag
//                                                is then scanned when it is itself given (a pushed tag), not because
//                                                it points into that history (a local tag that is not pushed)
//     --all-refs                                 the history reachable from every ref (local and remote branches, tags)
//   node scripts/privacy-scan.mjs --dir <path>   every file under a folder (a staging tree before git init)
//   node scripts/privacy-scan.mjs --dir <path> --shipped
//                                                the text files of a release (browser zip, app.asar, resources): every
//                                                content rule, no repository path, size or vendor rule; nominative
//                                                mentions allowed in shippedNominativeAllowed
// Options:
//   --require-denylist  fail when no private term is loaded
//   --strict            no worklist waiver, and the release files must exist (release and first-push gate)
//   --policy <file>     rules file (default: publish-policy.json of the scanned root, else of this repository)
//   --json              machine-readable report on stdout
//   --write-worklist    record the current soft findings as privacy-worklist.json (maintainers only)
// Rules: publish-policy.json (generic rules only). Private terms: the untracked file .publish-denylist and the
// PUBLISH_DENYLIST environment variable, one entry per line:
//   term            a plain term, case-insensitive; spaces also match "_", "-" and "%20"; also looked for in hex and
//                   base64 (a term of 6 characters or more)
//   /regex/flags    a regular expression (only the i flag is kept)
//   path:<entry>    a term or regular expression checked against file paths only (a private folder layout)
//   # ...           a comment
// A malformed entry stops the scan with its line number only: the entry itself is never printed.
// Text is also checked after normalisation (Unicode NFKC, invisible characters removed, %XX and HTML character
// references decoded), so that an encoded private term or path is found as well.
// Hard rules can never be waived. Soft rules (personal voice, nominative game-name mentions, game-settings lines
// outside the synthetic fixtures, claims about the game's files) may be listed in privacy-worklist.json with their
// counts; a count above the listed one fails, and so does an unlisted soft finding. Game-invented names the naming step
// replaced are forbidden terms, listed in the policy as sha256 hashes of the lower-cased word (forbiddenTermHashes) so
// that the policy does not spell them out.
// Commit identities: every author, committer and tagger address must match commitEmailPattern (GitHub noreply). Two
// exceptions, both exact: a committer listed in committerIdentitiesAllowed, GitHub's own web-flow identity (name
// "GitHub", address noreply at github.com), which commits squash merges, web edits and Dependabot updates and is never
// accepted as an author or a tagger; and the bots of botIdentities (Dependabot, GitHub Actions), each accepted only
// with its own name and its own noreply address. Any other identity in the bot form ("...[bot]") fails, and so does
// any other address (a person's own address in GitHub's test merge commit of a pull request, for example).
// Commit and tag messages: addresses of emailAllowDomains (GitHub noreply) are accepted anywhere, as in files, and the
// entries of commitMessageEmailsAllowed only in messages (GitHub's noreply address; its support address only on
// Dependabot's own sign-off line).
// Every regular expression below is written so that its own source text does not match it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKLIST_FILE = 'privacy-worklist.json';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += esc(c);
  }
  return new RegExp('^' + re + '$');
}
const matchAny = (file, globs) => (globs || []).some((g) => globToRegExp(g).test(file));
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ---------- private terms ----------
// An error whose message never contains private text (safe for a public CI log).
export class SafeError extends Error {}
// Entries of a private denylist: RegExp objects, each with .pathOnly (checked against paths only) and .plain (the plain
// term, for its hex and base64 forms; null for a regular expression). A malformed entry throws a SafeError that names
// the source and the line number only.
export function parseDenylist(text, source = 'denylist') {
  const out = [];
  String(text || '')
    .split(/\r?\n/)
    .forEach((raw, i) => {
      let line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const pathOnly = line.startsWith('path:');
      if (pathOnly) line = line.slice(5).trim();
      const m = /^\/(.+)\/([a-z]*)$/.exec(line);
      let re;
      try {
        if (m) re = new RegExp(m[1], m[2].includes('i') ? 'i' : '');
        else if (line.length >= 3) re = new RegExp(esc(line).replace(/(?:\\ |\s)+/g, '(?:\\s|%20|_|-)+'), 'i');
        else return;
      } catch {
        throw new SafeError(`${source} line ${i + 1}: invalid regular expression (the entry is not shown)`);
      }
      re.pathOnly = pathOnly;
      re.plain = m || pathOnly ? null : line;
      out.push(re);
    });
  return out;
}
function loadDenylist(root) {
  const terms = [];
  if (process.env.PUBLISH_DENYLIST) terms.push(...parseDenylist(process.env.PUBLISH_DENYLIST, 'PUBLISH_DENYLIST'));
  for (const dir of new Set([root, REPO])) {
    const f = path.join(dir, '.publish-denylist');
    if (fs.existsSync(f)) terms.push(...parseDenylist(fs.readFileSync(f, 'utf8'), '.publish-denylist'));
  }
  return terms;
}
// The hex and base64 forms of a plain private term (as written, lower case, upper case, capitalised), reduced to the
// characters that depend on the term alone, whatever the bytes around it: base64 at the three byte alignments, standard
// and URL-safe alphabets. Only forms of 8 characters or more are kept (shorter ones would match by chance).
export function encodedForms(term) {
  const variants = new Set([term, term.toLowerCase(), term.toUpperCase(), term[0].toUpperCase() + term.slice(1)]);
  const b64 = new Set();
  const hex = new Set();
  for (const v of variants) {
    const bytes = Buffer.from(v, 'utf8');
    hex.add(bytes.toString('hex'));
    for (let k = 0; k < 3; k++) {
      const enc = Buffer.concat([Buffer.alloc(k), bytes]).toString('base64');
      const n = k + bytes.length;
      const tail = n % 3 === 1 ? 3 : n % 3 === 2 ? 2 : 0;
      const core = enc.slice([0, 2, 3][k], enc.length - tail);
      if (core.length >= 8) {
        b64.add(core);
        b64.add(core.replace(/\+/g, '-').replace(/\//g, '_'));
      }
    }
  }
  return { base64: [...b64], hex: [...hex].filter((h) => h.length >= 12) };
}

// ---------- normalisation ----------
// Invisible characters (zero-width, joiners, bidirectional controls, variation selectors, soft hyphen, BOM).
/* eslint-disable no-misleading-character-class -- invisible and combining characters, listed on purpose */
const INVISIBLE =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g;
/* eslint-enable no-misleading-character-class */
const NAMED_REFS = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hyphen: '-',
  dash: '-',
  commat: '@',
  period: '.',
  lowbar: '_',
  sol: '/',
  bsol: '\\',
  colon: ':',
  num: '#',
  percnt: '%',
};
// The text as a reader would see it once decoded: NFKC, invisible characters removed, HTML character references and
// %XX sequences decoded (never into a line break, so that line numbers stay the same).
export function normalizeText(text) {
  let s = text.normalize('NFKC').replace(INVISIBLE, '');
  s = s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z]{2,8}));/g, (m, d, h, name) => {
    if (name) return Object.hasOwn(NAMED_REFS, name.toLowerCase()) ? NAMED_REFS[name.toLowerCase()] : m;
    const cp = d ? Number(d) : parseInt(h, 16);
    return cp > 0x10ffff || cp === 10 || cp === 13 ? m : String.fromCodePoint(cp);
  });
  s = s.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    try {
      const d = decodeURIComponent(run);
      return /[\r\n]/.test(d) ? run : d;
    } catch {
      return run;
    }
  });
  return s.replace(INVISIBLE, '');
}

// ---------- rules ----------
// level: hard (never waived), soft (worklist), info (counted only). make(file) returns a global RegExp or null;
// keep(match), when present, filters the matches.
function buildRules(policy, denylist, { shipped = false } = {}) {
  const nominative = shipped ? policy.shippedNominativeAllowed : policy.nominativeAllowed;
  const R = [];
  const add = (level, id, make, extra = {}) => R.push({ level, id, make, ...extra });
  const content = denylist.filter((r) => !r.pathOnly);
  if (content.length) {
    let combined = null;
    try {
      combined = new RegExp(content.map((r) => '(?:' + r.source + ')').join('|'), 'gi');
    } catch {
      combined = null; // e.g. the same group name in two entries: one rule per entry instead
    }
    if (combined) add('hard', 'private-term', () => combined);
    else for (const r of content) add('hard', 'private-term', () => new RegExp(r.source, 'gi'));
    const needles = { base64: new Set(), hex: new Set() };
    for (const r of content)
      if (r.plain && r.plain.length >= 6) {
        const f = encodedForms(r.plain);
        f.base64.forEach((x) => needles.base64.add(x));
        f.hex.forEach((x) => needles.hex.add(x));
      }
    if (needles.base64.size) {
      const re = new RegExp([...needles.base64].map(esc).join('|'), 'g');
      add('hard', 'private-term-encoded', () => re, { rawOnly: true });
    }
    if (needles.hex.size) {
      const re = new RegExp([...needles.hex].map(esc).join('|'), 'gi');
      add('hard', 'private-term-encoded', () => re, { rawOnly: true });
    }
  }
  add(
    'hard',
    'user-profile-path',
    () =>
      /\b[A-Za-z]:(?:\\\\|\\|\/)(?:Users|Documents and Settings)(?:\\\\|\\|\/)(?!Public\b|Default\b|runneradmin\b)[^\\/\s"'`<>|]+/gi,
  );
  add('hard', 'unix-home-path', () => /(?:^|[\s"'`(=])\/(?:home|Users)\/(?!runner\b|user\b|me\b)[A-Za-z0-9._-]+\//g);
  add('hard', 'short-8dot3-name', () => /\b[A-Z0-9]{2,6}~[1-9]\b/g);
  add('hard', 'machine-name', () => /\b(?:DESKTOP|LAPTOP)-[A-Z0-9]{7}\b/g);
  add(
    'hard',
    'secret-token',
    () =>
      /\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}|\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|\bAKIA[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_-]{35}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  );
  add(
    'hard',
    'secret-assignment',
    () =>
      /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|stream[_-]?key|client[_-]?secret)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']/gi,
  );
  add('hard', 'steam-id64', () => /\b7656119\d{10}\b/g);
  add(
    'hard',
    'hardware-model',
    () =>
      /\b(?:RTX|GTX)\s?\d{4}(?:\s?(?:Ti|SUPER))?\b|\bRX\s?\d{4}(?:\s?XTX?)?\b|\bRyzen\s\d\s\d{4}X?3?D?\b|\bCore\s(?:i[3579]|Ultra\s\d)[-\s]\d{4,5}[A-Z]{0,2}\b/gi,
  );
  add(
    'hard',
    'recording-reference',
    () => /[\w)\]-]\.(?:mk[v]|mp[4]|mo[v])\b|\b\d{4}-\d{2}-\d{2}[ _]\d{2}-\d{2}-\d{2}\b/gi,
  );
  add('hard', 'data-image-uri', () => /data:imag[e]\//gi);
  const forbidden = (policy.forbiddenTerms || []).filter(Boolean);
  if (forbidden.length) {
    const re = new RegExp('\\b(?:' + forbidden.map(esc).join('|') + ')\\b', 'gi');
    add('hard', 'forbidden-term', () => re);
  }
  // Terms the repository must not use but should not spell out either (the game-invented names replaced by the naming
  // step): sha256 of the lower-cased word; every word of three or more letters and digits is hashed and looked up.
  const hashed = new Set((policy.forbiddenTermHashes || []).map((h) => String(h).toLowerCase()));
  if (hashed.size) {
    const seen = new Map();
    const keep = (w) => {
      const k = w.toLowerCase();
      if (!seen.has(k)) seen.set(k, hashed.has(sha256(k)));
      return seen.get(k);
    };
    R.push({ level: 'hard', id: 'forbidden-term', make: () => /[A-Za-z][A-Za-z0-9]{2,}/g, keep });
  }
  add(
    'soft',
    'personal-voice',
    () =>
      /\b(?:tes|mes) (?:vid[ée]os|enregistrements|r[ée]glages|captures)\b|\b(?:ton|mon) (?:jeu|fichier|profil|Windows)\b|\bta RTX\b|\bthe o[w]ner(?:'s)?\b|\bo[w]ner's\b/gi,
  );
  add('soft', 'game-name-mention', (f) => (matchAny(f, nominative) ? null : /\bw[a]rdogs\b/gi));
  add(
    'soft',
    'game-files-claim',
    () =>
      /extraites? des fichiers du je[u]|from the gam[e](?:'s)? files|datamin(?:ed|ing)\b|serve[r] data|donn[ée]es de serveu[r]/gi,
  );
  add('soft', 'game-settings-line', (f) =>
    matchAny(f, policy.syntheticFixtures)
      ? null
      : /^\s*(?:RotaryMouse\w+|AirVehicleSensitivityMultiplier|bInvertYAxis\w*|\w*VehicleFieldOfView|bCollectiveSelfCentering)\s*=\s*\S|^\s*\[\/Script\/[\w.]+\]/gm,
  );
  return R;
}
// E-mail addresses, found from each '@' (a single regex over long hex strings backtracks quadratically): a local part
// of 1-64 characters right before it and a dotted domain after it. Brackets count as local-part characters so that a
// bot address such as name[bot]@... is seen whole; a leading '[' is not part of it (Markdown link text such as
// "[name@host](mailto:...)"). Yields {index, domain, address}.
const LOCAL_CHAR = /[A-Za-z0-9._%+[\]-]/;
const DOMAIN = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
function* emails(text) {
  for (let at = text.indexOf('@'); at >= 0; at = text.indexOf('@', at + 1)) {
    let s = at;
    while (s > 0 && at - s < 64 && LOCAL_CHAR.test(text[s - 1])) s--;
    while (s < at && text[s] === '[') s++;
    if (s === at) continue;
    const m = DOMAIN.exec(text.slice(at + 1, at + 254));
    if (m) yield { index: s, domain: m[0].toLowerCase(), address: text.slice(s, at + 1 + m[0].length).toLowerCase() };
  }
}
// The addresses a commit or tag message may name besides emailAllowDomains: [{address: RegExp, line: RegExp|null}]
// from the policy's commitMessageEmailsAllowed ({email, line} regular expressions; line = the whole line it must be on).
export function messageEmailRules(policy) {
  return (policy.commitMessageEmailsAllowed || []).map((x) => ({
    address: new RegExp(x.email, 'i'),
    line: x.line ? new RegExp(x.line) : null,
  }));
}

const isText = (b) => {
  const n = Math.min(b.length, 8192);
  for (let i = 0; i < n; i++) if (b[i] === 0) return false;
  return true;
};
function lineIndex(txt) {
  const starts = [0];
  for (let i = 0; i < txt.length; i++) if (txt.charCodeAt(i) === 10) starts.push(i + 1);
  return (idx) => {
    let lo = 0,
      hi = starts.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (starts[m] <= idx) lo = m;
      else hi = m - 1;
    }
    return lo + 1;
  };
}

// The whole line of text that holds position i (without its line break).
function lineAround(t, i) {
  const end = t.indexOf('\n', i);
  return t.slice(t.lastIndexOf('\n', i - 1) + 1, end < 0 ? t.length : end).replace(/\r$/, '');
}

// ---------- scanning ----------
// messageEmails: for a commit or tag message only, the addresses of messageEmailRules(policy) it may name.
export function scanContent({ file, buf, policy, rules, findings, emailDomains, messageEmails = [] }) {
  let text;
  if (!isText(buf)) {
    const allowed = (policy.binaryAllowed || []).find((b) => b.path === file);
    if (!allowed) return findings.push({ rule: 'binary-file', level: 'hard', file, line: 0 });
    if (sha256(buf) !== allowed.sha256) return findings.push({ rule: 'binary-checksum', level: 'hard', file, line: 0 });
    if (allowed.decompress !== 'gzip') return;
    text = zlib.gunzipSync(buf).toString('utf8');
  } else text = buf.toString('utf8');
  // Per-file allowances: public addresses that third-party metadata puts in a generated file (npm deprecation notices
  // in package-lock.json).
  const domains = emailDomains.concat((policy.emailAllowedIn || {})[file] || []);
  const raw = new Set();
  const decodedSeen = new Set();
  // One pass over the text as stored, then (hard rules only) over its decoded form when that differs; a decoded finding
  // already reported on the same line by the first pass is not repeated.
  const pass = (t, decoded) => {
    const lineAt = lineIndex(t);
    const where = (rule, line) => {
      const key = rule.id + '\0' + line;
      if (decoded) {
        if (raw.has(key) || decodedSeen.has(key)) return;
        decodedSeen.add(key);
      } else raw.add(key);
      findings.push({ rule: rule.id, level: rule.level, file, line, ...(decoded ? { decoded: true } : {}) });
    };
    for (const rule of rules) {
      if (decoded && (rule.level !== 'hard' || rule.rawOnly)) continue;
      const re = rule.make(file);
      if (!re) continue;
      re.lastIndex = 0;
      let m,
        n = 0;
      while ((m = re.exec(t)) && n < 1000) {
        if (!m[0].length) re.lastIndex++;
        if (rule.keep && !rule.keep(m[0])) continue;
        where(rule, lineAt(m.index + Math.max(0, m[0].search(/\S/))));
        n++;
      }
    }
    const emailRule = { id: 'email-address', level: 'hard' };
    for (const { index, domain, address } of emails(t)) {
      if (/\.(png|jpe?g|webp|svg|gif|js|mjs|cjs|css|json)$/.test(domain)) continue;
      if (domains.some((d) => domain === d || domain.endsWith('.' + d))) continue;
      if (messageEmails.some((r) => r.address.test(address) && (!r.line || r.line.test(lineAround(t, index)))))
        continue;
      where(emailRule, lineAt(index));
    }
  };
  pass(text, false);
  const norm = normalizeText(text);
  if (norm !== text) pass(norm, true);
}
export function checkPath({ file, size, policy, denylist, findings, shipped = false }) {
  const hard = (rule) => findings.push({ rule, level: 'hard', file, line: 0 });
  if ((policy.forbiddenPathPatterns || []).some((p) => new RegExp(p, 'i').test(file))) hard('forbidden-path');
  const decoded = normalizeText(file);
  if (denylist.some((re) => re.test(file) || re.test(decoded))) hard('private-term-in-path');
  if (shipped) return; // release files: their own layout, their own sizes
  if (!matchAny(file, policy.allowedPaths)) hard('path-not-allowed');
  const ext = path.posix.extname(file).toLowerCase();
  const binOk = (policy.binaryAllowed || []).some((b) => b.path === file);
  if (!binOk && (policy.forbiddenExtensions || []).includes(ext)) hard('forbidden-extension');
  const limit = Object.entries(policy.sizeExceptions || {}).find(([g]) => matchAny(file, [g]));
  if (size > (limit ? limit[1] : policy.maxFileBytes || 1048576)) hard('file-too-large');
}

function git(root, args, input) {
  const r = spawnSync('git', args, { cwd: root, maxBuffer: 1 << 30, input });
  if (r.status !== 0)
    throw Error('git ' + args.slice(0, 2).join(' ') + ' failed: ' + String(r.stderr).trim().split('\n')[0]);
  return r.stdout;
}
const zsplit = (b) => b.toString('utf8').split('\0').filter(Boolean);
// Reads blobs through one `git cat-file --batch`.
function readBlobs(root, oids) {
  const out = new Map();
  if (!oids.length) return out;
  const buf = git(root, ['cat-file', '--batch'], oids.join('\n') + '\n');
  let at = 0;
  while (at < buf.length) {
    const nl = buf.indexOf(10, at);
    const [oid, type, size] = buf.toString('utf8', at, nl).split(' ');
    if (type === 'missing') {
      at = nl + 1;
      continue;
    }
    const n = +size,
      start = nl + 1;
    out.set(oid, buf.subarray(start, start + n));
    at = start + n + 1;
  }
  return out;
}
function walkDir(dir, rel = '', out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walkDir(path.join(dir, e.name), r, out);
    else if (e.isFile()) out.push(r);
  }
  return out;
}

// Bot identities (GitHub's "name[bot]" accounts): accepted only as listed in botIdentities, name and address exact.
export const isBotIdentity = (name, email) =>
  /\[bot\]/i.test(String(name || '')) || /\[bot\]@/i.test(String(email || ''));
export const botAllowed = (policy, name, email) =>
  (policy.botIdentities || []).some(
    (b) => b.name === name && b.email.toLowerCase() === String(email || '').toLowerCase(),
  );

// The history a --history scan covers: what is reachable from HEAD (default), from the --rev values, or from every ref
// (--all-refs). Returns the git arguments that name it (object ids or --all, never a user's text), the tips, and
// whether the annotated tags that point into it belong to it (HEAD: the tags a clone of the repository holds; --rev:
// only the tags given, which are what a push publishes).
export function historyScope(root, { revs = [], allRefs = false } = {}) {
  const run = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 30 });
  if (allRefs) {
    const any = git(root, ['for-each-ref', '--format=%(objectname)']).toString('utf8').trim() !== '';
    return {
      label: 'every ref',
      all: true,
      commits: any ? ['--all'] : [],
      objects: any ? ['--all'] : [],
      tips: new Set(),
      tagsInHistory: true,
    };
  }
  const ids = [];
  const commits = [];
  for (const rev of revs.length ? revs : ['HEAD']) {
    if (!rev || rev.startsWith('-')) throw new SafeError('--rev takes a revision name or id, not an option');
    const r = run(['rev-parse', '--verify', '--quiet', rev]);
    if (r.status !== 0) {
      if (!revs.length)
        return { label: 'HEAD', all: false, commits: [], objects: [], tips: new Set(), tagsInHistory: true }; // no commit yet
      throw new SafeError('a --rev value is not a revision of this repository (the value is not shown)');
    }
    const id = r.stdout.trim();
    ids.push(id);
    const c = run(['rev-parse', '--verify', '--quiet', id + '^{commit}']);
    if (c.status === 0) commits.push(c.stdout.trim());
  }
  return {
    label: revs.length ? revs.length + ' revision(s)' : 'HEAD',
    all: false,
    commits: [...new Set(commits)],
    objects: [...new Set(ids)],
    tips: new Set(ids),
    tagsInHistory: !revs.length,
  };
}

export function runScan(argv) {
  const has = (k) => argv.includes(k);
  const val = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : null;
  };
  const vals = (k) => argv.flatMap((a, i) => (a === k && i + 1 < argv.length ? [argv[i + 1]] : []));
  const mode = has('--dir') ? 'dir' : has('--staged') ? 'staged' : 'tracked';
  const root = mode === 'dir' ? path.resolve(val('--dir')) : REPO;
  const shipped = has('--shipped');
  if (shipped && mode !== 'dir') throw Error('--shipped goes with --dir');
  const policyFile = val('--policy')
    ? path.resolve(val('--policy'))
    : fs.existsSync(path.join(root, 'publish-policy.json'))
      ? path.join(root, 'publish-policy.json')
      : path.join(REPO, 'publish-policy.json');
  const policy = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
  const denylist = loadDenylist(root);
  const rules = buildRules(policy, denylist, { shipped });
  const emailDomains = policy.emailAllowDomains || [];
  const findings = [];
  const notes = [];
  let files = 0,
    bytes = 0;
  const scanOne = (file, buf) => {
    files++;
    bytes += buf.length;
    checkPath({ file, size: buf.length, policy, denylist, findings, shipped });
    scanContent({ file, buf, policy, rules, findings, emailDomains });
  };
  const messageEmails = messageEmailRules(policy);
  // committer: true for the committer of a commit already in the history, the only role GitHub's own identity may hold.
  const identity = (label, name, email, { committer = false } = {}) => {
    const address = String(email || '');
    if (isBotIdentity(name, address)) {
      // A bot: only a listed one, under its own name and its own noreply address.
      if (!botAllowed(policy, name, address))
        findings.push({ rule: 'identity-bot-not-listed', level: 'hard', file: label, line: 0 });
    } else {
      const github =
        committer &&
        (policy.committerIdentitiesAllowed || []).some(
          (x) => x.name === name && new RegExp(x.emailPattern, 'i').test(address),
        );
      if (!github && !new RegExp(policy.commitEmailPattern || '$^', 'i').test(address))
        findings.push({ rule: 'identity-email-not-noreply', level: 'hard', file: label, line: 0 });
    }
    if (denylist.some((re) => re.test(name || '') || re.test(address)))
      findings.push({ rule: 'identity-private-term', level: 'hard', file: label, line: 0 });
  };
  if (mode === 'dir') {
    for (const f of walkDir(root).sort()) scanOne(f, fs.readFileSync(path.join(root, f)));
  } else if (mode === 'staged') {
    // Added, copied, modified, renamed and type-changed entries (a file turned into a symbolic link is a new blob).
    const names = zsplit(git(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMRT', '-z']));
    if (names.length) {
      const entries = zsplit(git(root, ['ls-files', '-s', '-z', '--', ...names])).map((l) => {
        const [meta, file] = l.split('\t');
        return { oid: meta.split(' ')[1], file };
      });
      const blobs = readBlobs(
        root,
        entries.map((e) => e.oid),
      );
      for (const e of entries) scanOne(e.file, blobs.get(e.oid));
    }
    for (const who of ['GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT']) {
      const id = git(root, ['var', who]).toString('utf8').trim();
      const m = /^(.*) <([^>]*)>/.exec(id) || [];
      identity(who === 'GIT_AUTHOR_IDENT' ? '(author identity)' : '(committer identity)', m[1], m[2]);
    }
  } else {
    const list = zsplit(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']));
    for (const f of [...new Set(list)].sort()) {
      const abs = path.join(root, f);
      if (!fs.existsSync(abs)) continue;
      scanOne(f, fs.readFileSync(abs));
    }
  }
  if (has('--history') && mode !== 'dir') {
    // The scope: HEAD, the --rev values or every ref (historyScope). Other branches are not this history: a pull request
    // run fetches every branch of the repository, but only HEAD (its test merge commit) is what the merge would publish.
    const scope = historyScope(root, { revs: vals('--rev'), allRefs: has('--all-refs') });
    const logOf = (format) =>
      scope.commits.length ? git(root, ['log', format, ...scope.commits, '--']).toString('utf8') : '';
    // Every (path, blob) pair of every tree in the scope: a blob is checked under each path it ever had (the same
    // content at a forbidden path, or at a path that names a private term, is not excused by an earlier allowed path).
    // Blobs reachable otherwise (a tag on a blob or a tree) come from rev-list with their first path.
    const pairs = new Map();
    const trees = new Set(logOf('--format=%T').split('\n').filter(Boolean));
    for (const tree of trees)
      for (const entry of zsplit(git(root, ['ls-tree', '-r', '-z', '--full-tree', tree]))) {
        const tab = entry.indexOf('\t');
        const [, type, oid] = entry.slice(0, tab).split(' ');
        const file = entry.slice(tab + 1);
        if (type === 'commit') {
          findings.push({ rule: 'submodule', level: 'hard', file: 'history:' + file, line: 0 });
          continue;
        }
        if (type === 'blob') pairs.set(file + '\0' + oid, { file, oid });
      }
    const seenBlobs = new Set([...pairs.values()].map((p) => p.oid));
    const lines = scope.objects.length
      ? git(root, ['rev-list', '--objects', ...scope.objects, '--'])
          .toString('utf8')
          .split('\n')
          .filter(Boolean)
      : [];
    const firstPath = new Map();
    for (const l of lines) {
      const i = l.indexOf(' ');
      if (i > 0 && !firstPath.has(l.slice(0, i))) firstPath.set(l.slice(0, i), l.slice(i + 1));
    }
    const check = firstPath.size
      ? git(root, ['cat-file', '--batch-check'], [...firstPath.keys()].join('\n') + '\n')
          .toString('utf8')
          .split('\n')
      : [];
    for (const l of check) {
      const [oid, type] = l.split(' ');
      if (type === 'blob' && !seenBlobs.has(oid))
        pairs.set(firstPath.get(oid) + '\0' + oid, { file: firstPath.get(oid), oid });
    }
    const oids = [...new Set([...pairs.values()].map((p) => p.oid))];
    const content = readBlobs(root, oids);
    const hist = [];
    for (const { file, oid } of pairs.values()) {
      const buf = content.get(oid);
      const one = [];
      checkPath({ file, size: buf.length, policy, denylist, findings: one });
      scanContent({ file, buf, policy, rules, findings: one, emailDomains });
      for (const f of one) hist.push({ ...f, blob: oid });
    }
    for (const f of hist) findings.push({ ...f, file: 'history:' + f.file });
    const hardRules = rules.filter((r) => r.level === 'hard');
    const log = logOf('--format=%H%x00%an%x00%ae%x00%cn%x00%ce%x00%B%x1e')
      .split('\x1e')
      .filter((s) => s.trim());
    for (const rec of log) {
      const [h, an, ae, cn, ce, msg] = rec.replace(/^\n/, '').split('\0');
      const label = 'commit:' + h.slice(0, 12);
      identity(label + ' (author)', an, ae);
      identity(label + ' (committer)', cn, ce, { committer: true });
      scanContent({
        file: label + ' (message)',
        buf: Buffer.from(msg || ''),
        policy,
        rules: hardRules,
        findings,
        emailDomains,
        messageEmails,
      });
    }
    // Annotated tags: every one (--all-refs), those on a commit of HEAD's history (default), and those given as a --rev
    // (a pushed tag): the tagger identity and the tag message.
    const reachable =
      scope.all || !scope.tagsInHistory
        ? null
        : new Set(
            scope.commits.length
              ? git(root, ['rev-list', ...scope.commits, '--'])
                  .toString('utf8')
                  .split('\n')
                  .filter(Boolean)
              : [],
          );
    const tags = git(root, ['for-each-ref', 'refs/tags', '--format=%(objecttype) %(objectname) %(*objectname)'])
      .toString('utf8')
      .split('\n')
      .filter((l) => l.startsWith('tag '))
      .map((l) => l.split(' '))
      .filter(([, oid, target]) => scope.all || scope.tips.has(oid) || (reachable && reachable.has(target)))
      .map(([, oid]) => oid);
    for (const oid of tags) {
      const obj = git(root, ['cat-file', 'tag', oid]).toString('utf8');
      const cut = obj.indexOf('\n\n');
      const head = cut < 0 ? obj : obj.slice(0, cut);
      const tagger = /^tagger (.*) <([^>]*)>/m.exec(head);
      const label = 'tag:' + oid.slice(0, 12);
      if (tagger) identity(label + ' (tagger)', tagger[1], tagger[2]);
      scanContent({
        file: label + ' (message)',
        buf: Buffer.from(cut < 0 ? '' : obj.slice(cut + 2)),
        policy,
        rules: hardRules,
        findings,
        emailDomains,
        messageEmails,
      });
    }
    notes.push(
      `history (${scope.label}): ${pairs.size} path and blob pair(s) (${oids.length} blob(s)), ${log.length} commit(s), ${tags.length} annotated tag(s)`,
    );
  }
  // Repository-level rules.
  if (mode !== 'staged' && !shipped) {
    for (const [f, sum] of Object.entries(policy.vendorChecksums || {})) {
      const abs = path.join(root, f);
      if (!fs.existsSync(abs)) findings.push({ rule: 'vendor-missing', level: 'hard', file: f, line: 0 });
      else if (sha256(fs.readFileSync(abs)) !== sum)
        findings.push({ rule: 'vendor-checksum', level: 'hard', file: f, line: 0 });
    }
    if (bytes > (policy.maxTotalBytes || Infinity))
      findings.push({ rule: 'repository-too-large', level: 'hard', file: '(total)', line: 0 });
    if (has('--strict')) {
      for (const f of policy.requiredFiles || [])
        if (!fs.existsSync(path.join(root, f)))
          findings.push({ rule: 'missing-required-file', level: 'hard', file: f, line: 0 });
      const readme = path.join(root, 'README.md');
      if (
        fs.existsSync(readme) &&
        !new RegExp(policy.readmeDisclaimer || '.', 'i').test(fs.readFileSync(readme, 'utf8'))
      )
        findings.push({ rule: 'readme-without-disclaimer', level: 'hard', file: 'README.md', line: 0 });
    }
  }
  if (has('--require-denylist') && !denylist.length)
    findings.push({ rule: 'no-denylist-loaded', level: 'hard', file: '(configuration)', line: 0 });

  // Soft findings against the worklist.
  const worklistPath = path.join(root, WORKLIST_FILE);
  const worklist =
    !has('--strict') && fs.existsSync(worklistPath)
      ? JSON.parse(fs.readFileSync(worklistPath, 'utf8')).items || []
      : [];
  const soft = new Map();
  for (const f of findings.filter((x) => x.level === 'soft')) {
    const key = f.rule + '\0' + f.file.replace(/^history:/, '');
    if (!soft.has(key)) soft.set(key, []);
    soft.get(key).push(f);
  }
  const errors = findings.filter((x) => x.level === 'hard');
  const waived = [];
  for (const [key, list] of soft) {
    const [rule, file] = key.split('\0');
    const history = list.some((x) => x.file.startsWith('history:'));
    const allowed = worklist.find((w) => w.rule === rule && w.file === file);
    // In history mode a path's blobs are counted separately (one blob per version); each version must fit the count.
    const counts = history
      ? Object.values(Object.groupBy(list, (x) => x.file + '#' + (x.blob || ''))).map((l) => l.length)
      : [list.length];
    const n = Math.max(...counts);
    if (allowed && n <= allowed.count) waived.push({ rule, file, count: n, allowed: allowed.count });
    else
      for (const f of list) errors.push({ ...f, level: 'soft', unlisted: !allowed, over: allowed ? allowed.count : 0 });
  }
  // Entries that can shrink (not meaningful for --staged, which sees only the staged files).
  const stale =
    mode === 'staged'
      ? []
      : worklist.filter((w) => !soft.has(w.rule + '\0' + w.file) || soft.get(w.rule + '\0' + w.file).length < w.count);
  const info = {};
  for (const f of findings.filter((x) => x.level === 'info')) info[f.rule] = (info[f.rule] || 0) + 1;
  const infoFiles = new Set(findings.filter((x) => x.level === 'info').map((x) => x.file)).size;

  if (has('--write-worklist')) {
    const items = [...soft].map(([key, list]) => {
      const [rule, file] = key.split('\0');
      return { rule, file, count: list.length };
    });
    items.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.rule < b.rule ? -1 : 1));
    const doc = {
      _comment:
        'Known soft findings, waived until they are fixed. Counts only, never the matched text. Each count may only go down; the release gate (--strict) requires an empty list.',
      items,
    };
    fs.writeFileSync(worklistPath, JSON.stringify(doc, null, 1) + '\n');
  }
  // A path that itself contains a private term is never printed either: it is replaced by a hash of the path.
  const mask = (f) => (denylist.some((re) => re.test(f)) ? '(path withheld: ' + sha256(f).slice(0, 12) + ')' : f);
  const masked = (list) => list.map((x) => ({ ...x, file: mask(x.file) }));
  return {
    mode,
    root,
    files,
    bytes,
    privateTerms: denylist.length,
    errors: masked(errors),
    waived: masked(waived),
    stale: masked(stale),
    info,
    infoFiles,
    notes,
  };
}

function main() {
  const argv = process.argv.slice(2);
  let r;
  try {
    r = runScan(argv);
  } catch (e) {
    // A SafeError never holds private text; any other message is printed with user folders masked (a git error may
    // name a path).
    const msg =
      e instanceof SafeError
        ? e.message
        : String(e && e.message).replace(
            /\b[A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]+[^\\/\s"'`]+/gi,
            '<user folder>',
          );
    console.error('privacy-scan: ' + msg);
    process.exit(2);
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ...r, root: path.basename(r.root) }, null, 1));
  } else {
    for (const x of r.errors)
      console.log(
        `ERROR ${x.rule.padEnd(28)} ${x.file}${x.line ? ':' + x.line : ''}${x.level === 'soft' ? (x.unlisted ? '  (soft rule, not in the worklist)' : `  (soft rule, above the worklist count ${x.over})`) : ''}`,
      );
    if (r.waived.length)
      console.log(
        `worklist: ${r.waived.length} known soft finding group(s) waived (${r.waived.reduce((n, w) => n + w.count, 0)} occurrence(s)); see ${WORKLIST_FILE}`,
      );
    for (const w of r.stale) console.log(`note  the worklist entry ${w.rule} ${w.file} can shrink or go`);
    for (const [k, n] of Object.entries(r.info))
      console.log(`info  ${k}: ${n} occurrence(s) in ${r.infoFiles} file(s)`);
    for (const n of r.notes) console.log('note  ' + n);
    console.log(
      `${r.mode}: ${r.files} file(s), ${(r.bytes / 1048576).toFixed(2)} MB, ${r.privateTerms} private term(s) loaded: ${r.errors.length} error(s)`,
    );
    if (!r.privateTerms)
      console.log('note  no private term loaded (.publish-denylist or PUBLISH_DENYLIST): only the generic rules ran');
  }
  process.exit(r.errors.length ? 1 : 0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
