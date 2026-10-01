'use strict';
// `golden.mjs baseline` and the proofs built on it: the runtime as committed at a ref, read the way the recorder reads it,
// that is the template first, then the files its script tags name. A ref that predates the menus' scripts is extracted
// without them (the recorded runtime is one, and a recorder change is proven on it after the menus have landed), a ref
// that holds them is extracted with them, and a ref whose template names a file it lacks is refused. The repository is
// a temporary one, with the script and the recorder module it needs: nothing here touches the real history.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, TEMPLATE } = require('../helpers/paths');
const { MENUS_SCRIPTS: MENUS, templateScriptFiles, templateWithMenus } = require('../helpers/html');

// The runtime that predates the menus' scripts, whichever of them the real template names by now.
const html = templateWithMenus(fs.readFileSync(TEMPLATE, 'utf8'));
const NAMED = templateScriptFiles(html);

test('baseline: the files the ref names, the menus only if its template does; a missing file is refused', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-baseline-'));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: '1+t@users.noreply.github.com',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: '1+t@users.noreply.github.com',
  };
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: base, encoding: 'utf8', env });
    assert.equal(r.status, 0, args.join(' ') + ': ' + r.stderr);
    return r.stdout.trim();
  };
  const write = (f, text) => {
    fs.mkdirSync(path.dirname(path.join(base, f)), { recursive: true });
    fs.writeFileSync(path.join(base, f), text);
  };
  const commit = (message) => {
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  // Every file of a ref, by its path under src/ (a runtime folder holds no other file).
  const extract = (ref, name) => {
    const out = path.join(base, 'out-' + name);
    const r = spawnSync(process.execPath, ['scripts/golden.mjs', 'baseline', '--ref', ref, '--out', out], {
      cwd: base,
      encoding: 'utf8',
    });
    const files = r.status === 0 ? fs.readdirSync(out, { recursive: true, withFileTypes: true }) : [];
    return {
      status: r.status,
      stderr: r.stderr,
      out,
      files: files
        .filter((e) => e.isFile())
        .map((e) => path.relative(out, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
        .sort(),
    };
  };
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'core.autocrlf', 'false');
    git('config', 'core.hooksPath', 'no-hooks');
    for (const f of ['scripts/golden.mjs', 'tools/golden/template.cjs']) write(f, fs.readFileSync(path.join(ROOT, f)));
    // The runtime that predates the menus' scripts (CRLF in every file: the extraction gives LF, but three.js as it is).
    write('src/index.template.html', html);
    for (const f of NAMED) write('src/' + f, `// ${f}\r\nvar x = 1;\r\n`);
    const before = commit('before the menus');
    // The runtime that has them.
    write('src/index.template.html', templateWithMenus(html, MENUS));
    for (const f of MENUS) write('src/' + f, `// ${f}\n`);
    const after = commit('the menus');
    // A runtime whose template names a script it does not hold.
    fs.rmSync(path.join(base, 'src', 'menus.js'));
    const broken = commit('a script lost');

    const old = extract(before, 'before');
    assert.equal(old.status, 0, old.stderr);
    assert.deepEqual(old.files, [...NAMED, 'index.template.html'].sort(), 'the template and the scripts it names');
    const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
    assert.equal(read(old.out, 'models.js'), '// models.js\nvar x = 1;\n', 'line endings normalised to LF');
    assert.equal(read(old.out, 'vendor/three.min.js'), '// vendor/three.min.js\r\nvar x = 1;\r\n', 'three.js as it is');

    const recent = extract(after, 'after');
    assert.equal(recent.status, 0, recent.stderr);
    assert.deepEqual(recent.files, [...NAMED, ...MENUS, 'index.template.html'].sort());

    const lost = extract(broken, 'broken');
    assert.notEqual(lost.status, 0, 'a missing script stops the extraction');
    assert.match(lost.stderr, /git show .*:src\/menus\.js failed/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
