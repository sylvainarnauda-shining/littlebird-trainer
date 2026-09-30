'use strict';
// The privacy scanner (scripts/privacy-scan.mjs) on synthetic leaks: every rule catches its case, the matched text is
// never printed, soft findings are waived only up to their worklist count, binaries are allowed only by sha256 and a
// gzip fixture is scanned inside, git history and commit identities are checked; and the repository itself passes.
// Every leak below is assembled at run time, so this file contains none of them.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('../helpers/paths');

const SCANNER = path.join(ROOT, 'scripts', 'privacy-scan.mjs');
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'publish-policy.json'), 'utf8'));
const DENIED = 'zorblax' + 'quintet';
const LEAKS = {
  'user-profile-path': 'C:' + '\\Users\\' + 'someone' + '\\notes.txt',
  'unix-home-path': ' /home/' + 'someone' + '/notes',
  'secret-token': 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8',
  'hardware-model': 'RT' + 'X 4090',
  'recording-reference': 'clip ' + '2026-01-02' + ' 03-04-05' + '.mk' + 'v',
  'data-image-uri': 'data:ima' + 'ge/png;base64,AAAA',
  'email-address': 'alice' + '@' + 'mailhost.io',
  'machine-name': 'DESK' + 'TOP-ABC1234',
  'private-term': 'contact ' + DENIED,
};
const PERSONAL = 'dans ' + 'tes ' + 'vidéos';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lb-scan-'));
}
function writePolicy(dir, extra = {}) {
  const file = path.join(dir, 'policy.json');
  fs.writeFileSync(file, JSON.stringify({ ...policy, allowedPaths: ['**'], vendorChecksums: {}, ...extra }));
  return file;
}
function scan(args, env = {}) {
  const r = spawnSync(process.execPath, [SCANNER, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PUBLISH_DENYLIST: DENIED, ...env },
  });
  return { code: r.status, out: r.stdout + r.stderr };
}
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

test('every hard rule catches its synthetic leak, and the output never contains the leaked text', () => {
  const base = tmp();
  const dir = path.join(base, 'tree');
  try {
    fs.mkdirSync(dir);
    for (const [rule, text] of Object.entries(LEAKS))
      fs.writeFileSync(path.join(dir, rule + '.txt'), 'line one\n' + text + '\n');
    const r = scan(['--dir', dir, '--policy', writePolicy(base)]);
    assert.equal(r.code, 1);
    for (const rule of Object.keys(LEAKS)) assert.match(r.out, new RegExp(`ERROR ${rule}\\s+${rule}\\.txt:2`), rule);
    for (const text of Object.values(LEAKS)) assert.ok(!r.out.includes(text.trim()), 'leaked text printed');
    assert.ok(!r.out.includes(DENIED), 'private term printed');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('forbidden terms listed by hash: any word whose lower-cased sha256 is listed fails, and is never printed', () => {
  const base = tmp();
  const dir = path.join(base, 'tree');
  try {
    fs.mkdirSync(dir);
    const word = 'Quork' + 'ville';
    fs.writeFileSync(path.join(dir, 'a.txt'), 'first line\nthe ' + word.toUpperCase() + ' camp\n');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'quorkvilles are fine: another word\n');
    const r = scan(['--dir', dir, '--policy', writePolicy(base, { forbiddenTermHashes: [sha(word.toLowerCase())] })]);
    assert.equal(r.code, 1);
    assert.match(r.out, /ERROR forbidden-term\s+a\.txt:2/);
    assert.ok(!/b\.txt/.test(r.out), 'a longer word is not the term');
    assert.ok(!r.out.toLowerCase().includes(word.toLowerCase()), 'the term is not printed');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('path rules: forbidden folders and extensions, paths outside the allowlist, private terms in names', () => {
  const base = tmp();
  const dir = path.join(base, 'tree');
  try {
    fs.mkdirSync(path.join(dir, 'raw-captures'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'raw-captures', 'a.txt'), 'x\n');
    fs.writeFileSync(path.join(dir, 'src', 'settings.ini'), 'x\n');
    fs.writeFileSync(path.join(dir, 'stray.txt'), 'x\n');
    fs.writeFileSync(path.join(dir, 'src', DENIED + '.txt'), 'x\n');
    const pol = writePolicy(base, {
      allowedPaths: ['src/**', 'raw-captures/**'],
      forbiddenPathPatterns: ['(^|/)raw-captures(/|$)'],
    });
    const r = scan(['--dir', dir, '--policy', pol]);
    assert.equal(r.code, 1);
    assert.match(r.out, /ERROR forbidden-path\s+raw-captures\/a\.txt/);
    assert.match(r.out, /ERROR forbidden-extension\s+src\/settings\.ini/);
    assert.match(r.out, /ERROR path-not-allowed\s+stray\.txt/);
    assert.match(r.out, /ERROR private-term-in-path\s+\(path withheld: [0-9a-f]{12}\)/);
    assert.ok(!r.out.includes(DENIED), 'private term printed (in a path)');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('the public policy names no private folder or tool: they come from path: entries of the private denylist', () => {
  // A private folder layout is a path-only entry: it refuses a path, not a word in a text.
  const layout = 'path:/(^|\\/)vault-[a-z]+(\\/|$)/i';
  const base = tmp();
  const dir = path.join(base, 'tree');
  try {
    fs.mkdirSync(path.join(dir, 'vault-notes'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'vault-notes', 'a.txt'), 'x\n');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'the vault-notes folder is mentioned here\n');
    const r = scan(['--dir', dir, '--policy', writePolicy(base)], { PUBLISH_DENYLIST: DENIED + '\n' + layout });
    assert.equal(r.code, 1);
    assert.match(r.out, /ERROR private-term-in-path\s+\(path withheld: [0-9a-f]{12}\)/);
    assert.ok(!/b\.txt/.test(r.out), 'a path-only entry does not match text');
    assert.ok(!r.out.includes('vault'), 'the path is withheld');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
  const text = fs.readFileSync(path.join(ROOT, 'publish-policy.json'), 'utf8') + fs.readFileSync(SCANNER, 'utf8');
  for (const word of [
    'OB' + 'S',
    'Stream' + 'Deck',
    'Over' + 'lay',
    'cod' + 'ex',
    'captures-' + 'jeu',
    'Enregistre' + 'ment',
  ])
    assert.ok(!text.includes(word), 'a private layout name in the public rules');
});

test('a malformed private entry stops the scan with its line number, never with its text', () => {
  const base = tmp();
  const dir = path.join(base, 'tree');
  try {
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x\n');
    const bad = 'zorblax' + 'broken';
    const r = scan(['--dir', dir, '--policy', writePolicy(base)], { PUBLISH_DENYLIST: DENIED + '\n/(' + bad + '/i\n' });
    assert.equal(r.code, 2);
    assert.match(r.out, /PUBLISH_DENYLIST line 2: invalid regular expression/);
    assert.ok(!r.out.includes(bad) && !r.out.includes(DENIED), 'nothing of the denylist printed');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('encoded forms: HTML character references, %XX, invisible characters, NFKC, base64 and hex of a private term', () => {
  const base = tmp();
  const dir = path.join(base, 'tree');
  try {
    fs.mkdirSync(dir);
    // The term with its fifth letter encoded.
    const [a, c, z] = [DENIED.slice(0, 4), DENIED[4], DENIED.slice(5)];
    const hexOf = (ch) => ch.charCodeAt(0).toString(16);
    const cases = {
      'entity.txt': a + '&#x' + hexOf(c) + ';' + z,
      'percent.txt': a + '%' + hexOf(c) + z,
      'invisible.txt': a + '\u200B' + c + z,
      'fullwidth.txt': a + String.fromCharCode(c.charCodeAt(0) + 0xfee0) + z,
      'base64.txt': 'blob ' + Buffer.from('prefix ' + DENIED + ' suffix').toString('base64'),
      'hex.txt': 'hex ' + Buffer.from(DENIED).toString('hex'),
      'email.txt': 'alice' + '&#' + '64;' + 'mailhost.io',
      'path.txt': 'C:' + '%5C' + 'Users' + '%5C' + 'someone' + '%5C' + 'x',
    };
    for (const [f, t] of Object.entries(cases)) fs.writeFileSync(path.join(dir, f), 'first\n' + t + '\n');
    fs.writeFileSync(path.join(dir, 'clean.txt'), 'café &amp; thé, 100 %20 plain\n');
    const r = scan(['--dir', dir, '--policy', writePolicy(base)]);
    assert.equal(r.code, 1);
    for (const f of ['entity', 'percent', 'invisible', 'fullwidth'])
      assert.match(r.out, new RegExp(`ERROR private-term\\s+${f}\\.txt:2`), f);
    assert.match(r.out, /ERROR private-term-encoded\s+base64\.txt:2/);
    assert.match(r.out, /ERROR private-term-encoded\s+hex\.txt:2/);
    assert.match(r.out, /ERROR email-address\s+email\.txt:2/);
    assert.match(r.out, /ERROR user-profile-path\s+path\.txt:2/);
    assert.ok(!/clean\.txt/.test(r.out), 'ordinary text is not flagged');
    assert.ok(!r.out.includes(DENIED));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('binaries: refused unless allowed by sha256; an allowed gzip fixture is scanned inside', () => {
  const base = tmp();
  const dir = path.join(base, 'tree');
  try {
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'blob.bin'), Buffer.from([1, 0, 2, 0, 3]));
    const gz = zlib.gzipSync('t,x\n0,' + LEAKS['user-profile-path'] + '\n');
    fs.writeFileSync(path.join(dir, 'series.csv.gz'), gz);
    const allowed = [{ path: 'series.csv.gz', sha256: sha(gz), decompress: 'gzip' }];
    let r = scan(['--dir', dir, '--policy', writePolicy(base, { binaryAllowed: allowed })]);
    assert.match(r.out, /ERROR binary-file\s+blob\.bin/);
    assert.match(r.out, /ERROR user-profile-path\s+series\.csv\.gz:2/, 'the leak inside the gzip is found');
    fs.rmSync(path.join(dir, 'blob.bin'));
    r = scan([
      '--dir',
      dir,
      '--policy',
      writePolicy(base, { binaryAllowed: [{ ...allowed[0], sha256: '0'.repeat(64) }] }),
    ]);
    assert.match(r.out, /ERROR binary-checksum\s+series\.csv\.gz/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('soft findings: an error when unlisted, waived up to the worklist count, an error again above it, never with --strict', () => {
  const base = tmp();
  const dir = path.join(base, 'tree');
  try {
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'a.txt'), PERSONAL + '\n');
    const pol = writePolicy(base);
    let r = scan(['--dir', dir, '--policy', pol]);
    assert.equal(r.code, 1);
    assert.match(r.out, /ERROR personal-voice\s+a\.txt:1\s+\(soft rule, not in the worklist\)/);
    fs.writeFileSync(
      path.join(dir, 'privacy-worklist.json'),
      JSON.stringify({ items: [{ rule: 'personal-voice', file: 'a.txt', count: 1 }] }),
    );
    r = scan(['--dir', dir, '--policy', pol]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /worklist: 1 known soft finding group/);
    fs.writeFileSync(path.join(dir, 'a.txt'), PERSONAL + '\n' + PERSONAL + '\n');
    r = scan(['--dir', dir, '--policy', pol]);
    assert.equal(r.code, 1, 'above the listed count');
    fs.writeFileSync(path.join(dir, 'a.txt'), PERSONAL + '\n');
    r = scan(['--dir', dir, '--policy', pol, '--strict']);
    assert.equal(r.code, 1, 'no waiver in the release gate');
    assert.ok(!r.out.includes(PERSONAL));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('history: every blob of every commit is scanned; commit identities must be the noreply address', () => {
  const base = tmp();
  try {
    const git = (...a) => {
      const r = spawnSync('git', a, { cwd: base, encoding: 'utf8' });
      assert.equal(r.status, 0, 'git ' + a.join(' ') + ': ' + r.stderr);
      return r.stdout;
    };
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'tester');
    git('config', 'user.email', 'tester' + '@' + 'mailhost.io');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'core.hooksPath', 'no-hooks');
    fs.copyFileSync(path.join(ROOT, 'publish-policy.json'), path.join(base, 'publish-policy.json'));
    fs.mkdirSync(path.join(base, 'src'));
    fs.writeFileSync(path.join(base, 'src', 'a.js'), '// ' + LEAKS['secret-token'] + '\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'first');
    fs.writeFileSync(path.join(base, 'src', 'a.js'), '// clean now\n');
    git('commit', '-q', '-am', 'second');
    // The scanner scans the repository that holds it: run a copy inside the temporary repository.
    fs.mkdirSync(path.join(base, 'scripts'));
    fs.copyFileSync(SCANNER, path.join(base, 'scripts', 'privacy-scan.mjs'));
    const r = spawnSync(process.execPath, [path.join(base, 'scripts', 'privacy-scan.mjs'), '--tracked', '--history'], {
      cwd: base,
      encoding: 'utf8',
      env: { ...process.env, PUBLISH_DENYLIST: DENIED },
    });
    const out = r.stdout + r.stderr;
    assert.equal(r.status, 1);
    assert.match(
      out,
      /ERROR secret-token\s+history:src\/a\.js:1/,
      'the leak removed later is still found in the history',
    );
    assert.match(out, /ERROR identity-email-not-noreply\s+commit:/);
    assert.ok(!out.includes('mailhost.io') && !out.includes(LEAKS['secret-token']), 'nothing printed');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('history: GitHub may commit (never author or tag); annotated tags; a blob is checked under each of its paths; staged type changes', () => {
  const base = tmp();
  try {
    const NOREPLY = '1+tester' + '@users.noreply.github.com';
    const ME = {
      GIT_AUTHOR_NAME: 'tester',
      GIT_AUTHOR_EMAIL: NOREPLY,
      GIT_COMMITTER_NAME: 'tester',
      GIT_COMMITTER_EMAIL: NOREPLY,
    };
    const WEB = 'noreply' + '@' + 'github.com';
    const git = (args, env = {}, input) => {
      const r = spawnSync('git', args, { cwd: base, encoding: 'utf8', input, env: { ...process.env, ...ME, ...env } });
      assert.equal(r.status, 0, 'git ' + args.join(' ') + ': ' + r.stderr);
      return r.stdout.trim();
    };
    git(['init', '-q', '-b', 'main']);
    git(['config', 'commit.gpgsign', 'false']);
    git(['config', 'tag.gpgsign', 'false']);
    git(['config', 'core.hooksPath', 'no-hooks']);
    git(['config', 'core.autocrlf', 'false']);
    const policy2 = { ...policy, allowedPaths: ['src/**', 'scripts/**', 'publish-policy.json'], vendorChecksums: {} };
    fs.writeFileSync(path.join(base, 'publish-policy.json'), JSON.stringify(policy2));
    fs.mkdirSync(path.join(base, 'src'));
    fs.mkdirSync(path.join(base, 'scripts'));
    fs.copyFileSync(SCANNER, path.join(base, 'scripts', 'privacy-scan.mjs'));
    fs.writeFileSync(path.join(base, 'src', 'a.js'), 'console.log(1);\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'base']);
    const run = (args) => {
      const r = spawnSync(process.execPath, [path.join(base, 'scripts', 'privacy-scan.mjs'), ...args], {
        cwd: base,
        encoding: 'utf8',
        env: { ...process.env, ...ME, PUBLISH_DENYLIST: DENIED },
      });
      return { code: r.status, out: r.stdout + r.stderr };
    };
    // A squash merge made on GitHub: author the contributor (noreply), committer GitHub itself.
    fs.writeFileSync(path.join(base, 'src', 'b.js'), 'console.log(2);\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'Squash merge (#1)'], { GIT_COMMITTER_NAME: 'GitHub', GIT_COMMITTER_EMAIL: WEB });
    let r = run(['--tracked', '--history']);
    assert.equal(r.code, 0, 'GitHub as committer is accepted: ' + r.out);
    // GitHub as the author is not.
    fs.writeFileSync(path.join(base, 'src', 'c.js'), 'console.log(3);\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'web'], { GIT_AUTHOR_NAME: 'GitHub', GIT_AUTHOR_EMAIL: WEB });
    r = run(['--tracked', '--history']);
    assert.match(r.out, /ERROR identity-email-not-noreply\s+commit:[0-9a-f]{12} \(author\)/);
    assert.ok(!/\(committer\)/.test(r.out), 'the committer of that commit is the noreply tester');
    git(['reset', '-q', '--hard', 'HEAD^']);
    // The same content as an allowed file, at a path naming a private term, committed then removed.
    fs.writeFileSync(path.join(base, 'src', DENIED + '.js'), 'console.log(1);\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'dup']);
    git(['rm', '-q', 'src/' + DENIED + '.js']);
    git(['commit', '-q', '-m', 'undup']);
    // An annotated tag by a private identity, naming the private term.
    git(['tag', '-a', 'v0.0.1', '-m', 'tagged by ' + DENIED], {
      GIT_COMMITTER_NAME: 'someone',
      GIT_COMMITTER_EMAIL: 'someone' + '@' + 'mailhost.io',
    });
    r = run(['--tracked', '--history']);
    assert.equal(r.code, 1);
    assert.match(r.out, /ERROR private-term-in-path\s+\(path withheld: [0-9a-f]{12}\)/);
    assert.match(r.out, /ERROR identity-email-not-noreply\s+tag:[0-9a-f]{12} \(tagger\)/);
    assert.match(r.out, /ERROR private-term\s+tag:[0-9a-f]{12} \(message\)/);
    assert.ok(!r.out.includes(DENIED) && !r.out.includes('mailhost'), 'nothing printed');
    // Pre-commit: a file turned into a symbolic link whose target is a private path.
    git(['tag', '-d', 'v0.0.1']);
    const target = 'C:/' + 'Users/' + DENIED + '/x.txt';
    const blob = git(['hash-object', '-w', '--stdin'], {}, target);
    git(['update-index', '--cacheinfo', `120000,${blob},src/a.js`]);
    r = run(['--staged']);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /ERROR user-profile-path\s+src\/a\.js/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('the repository itself: no error on the files git would publish (known soft findings waived by the worklist)', () => {
  const r = spawnSync(process.execPath, [SCANNER, '--tracked'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
