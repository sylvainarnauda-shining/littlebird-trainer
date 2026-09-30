'use strict';
// The desktop shell's security rules (desktop/policy.cjs), without Electron: one origin, one page, no network, two
// permissions (none during a self-test), JSON exports only, a fail-closed page policy, refused debugging switches, the
// window settings (sandbox, context isolation, no Node in the page, no DevTools when packaged), and one external
// address (the releases page of the À propos tab), handed to the default browser by exact match, never in a self-test.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/paths');

const p = require(path.join(ROOT, 'desktop', 'policy.cjs'));

test('only the app origin and its blob: URLs count as ours', () => {
  for (const ok of ['app://littlebird/', 'app://littlebird/index.html#carte=gen-42', 'blob:app://littlebird/0b9f-11aa'])
    assert.equal(p.isAppUrl(ok), true, ok);
  for (const bad of [
    'https://littlebird/',
    'app://littlebird.evil/',
    'app://evil/',
    'app://user:pw@littlebird/',
    'app://littlebird:8080/',
    'file:///C:/index.html',
    'blob:https://example.com/x',
    'blob:app://littlebird.evil/x',
    'devtools://devtools/',
    'javascript:alert(1)',
    'data:text/html,x',
    '',
    null,
    undefined,
    42,
    'app://' + 'a'.repeat(5000),
    'blob:app://littlebird/' + 'a'.repeat(5000),
  ])
    assert.equal(p.isAppUrl(bad), false, String(bad).slice(0, 40));
});

test('network requests are cancelled; DevTools only in an unpacked run', () => {
  for (const u of [
    'https://api.github.com/',
    'http://127.0.0.1:9222/',
    'wss://example.com/',
    'file:///C:/Windows/win.ini',
  ])
    for (const packaged of [true, false]) assert.equal(p.requestAllowed(u, { packaged }), false, u);
  assert.equal(p.requestAllowed('devtools://devtools/bundled/x.html', { packaged: true }), false);
  assert.equal(p.requestAllowed('devtools://devtools/bundled/x.html', { packaged: false }), true);
  assert.equal(p.requestAllowed('app://littlebird/index.html', { packaged: true }), true);
  assert.equal(p.requestAllowed('blob:app://littlebird/1', { packaged: true }), true);
});

test('two permissions, from our origin only, and none at all during a self-test', () => {
  assert.equal(p.permissionAllowed('pointerLock', 'app://littlebird/index.html'), true);
  assert.equal(p.permissionAllowed('fullscreen', 'app://littlebird/'), true);
  for (const perm of [
    'media',
    'geolocation',
    'notifications',
    'clipboard-read',
    'clipboard-sanitized-write',
    'hid',
    'serial',
    'usb',
    'openExternal',
    'keyboardLock',
    'midi',
    'midiSysex',
    'display-capture',
    'idle-detection',
    'window-management',
    'storage-access',
    'fileSystem',
    'mediaKeySystem',
    'speaker-selection',
    'unknown',
  ])
    assert.equal(p.permissionAllowed(perm, 'app://littlebird/'), false, perm);
  assert.equal(p.permissionAllowed('pointerLock', 'https://example.com/'), false);
  assert.equal(p.permissionAllowed('pointerLock', undefined), false);
  for (const perm of ['pointerLock', 'fullscreen', 'keyboardLock'])
    assert.equal(p.permissionAllowed(perm, 'app://littlebird/', { selfTest: true }), false, 'self-test ' + perm);
});

test('downloads: the JSON exports of the page only', () => {
  assert.equal(p.downloadAllowed('blob:app://littlebird/1234', 'little-bird-profil.json'), true);
  assert.equal(p.downloadAllowed('blob:app://littlebird/1234', 'little-bird-profil-2026-09-29.json'), true);
  for (const [url, name] of [
    ['blob:app://littlebird/1234', 'little-bird-x.exe'],
    ['blob:app://littlebird/1234', 'little-bird-x.json.lnk'],
    ['blob:app://littlebird/1234', 'little-bird-probe.exe'],
    ['blob:app://littlebird/1234', 'profile.json'],
    ['https://example.com/little-bird-a.json', 'little-bird-a.json'],
    ['blob:https://example.com/1', 'little-bird-a.json'],
    ['blob:app://littlebird/1234', ''],
  ])
    assert.equal(p.downloadAllowed(url, name), false, name);
  // A path in the suggested name is reduced to its last part, which must itself match.
  assert.equal(p.downloadAllowed('blob:app://littlebird/1', '..\\..\\little-bird-a.json'), true);
  assert.equal(p.downloadAllowed('blob:app://littlebird/1', 'little-bird-a.json/../../evil.exe'), false);
});

test('the protocol handler serves exactly one file', () => {
  assert.equal(p.pageFor('GET', 'app://littlebird/'), 'index.html');
  assert.equal(p.pageFor('GET', 'app://littlebird/index.html?x=1#carte=vallee'), 'index.html');
  for (const [m, u] of [
    ['POST', 'app://littlebird/'],
    ['HEAD', 'app://littlebird/index.html'],
    ['GET', 'app://littlebird/../package.json'],
    ['GET', 'app://littlebird/package.json'],
    ['GET', 'app://littlebird/desktop/main.cjs'],
    ['GET', 'app://littlebird/%2e%2e/package.json'],
    ['GET', 'app://littlebird/dist/web/index.html'],
    ['GET', 'app://littlebird/favicon.ico'],
    ['GET', 'app://other/'],
    ['GET', 'app://u@littlebird/'],
    ['GET', 'https://littlebird/'],
  ])
    assert.equal(p.pageFor(m, u), null, `${m} ${u}`);
});

test('the releases page is the only external link, and it is this repository', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const repo = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
  assert.equal(p.RELEASES_URL, repo + '/releases');
  const parsed = new URL(p.RELEASES_URL);
  assert.deepEqual(
    [parsed.protocol, parsed.host, parsed.search, parsed.hash, parsed.href],
    ['https:', 'github.com', '', '', p.RELEASES_URL],
  );
  assert.equal(p.externalAllowed(p.RELEASES_URL), true);
  // Exactly that https address: no other page of the site, no query, fragment, credentials, port, scheme or case.
  for (const u of [
    p.RELEASES_URL + '/../../evil',
    p.RELEASES_URL + '/',
    p.RELEASES_URL + '/latest',
    p.RELEASES_URL + '/tag/v0.9.0',
    p.RELEASES_URL + '/download/v0.9.0/LittleBird-Trainer-Setup-0.9.0.exe',
    p.RELEASES_URL + '?q=1',
    p.RELEASES_URL + '#x',
    p.RELEASES_URL + '\n',
    ' ' + p.RELEASES_URL,
    p.RELEASES_URL.replace('https:', 'http:'),
    p.RELEASES_URL.replace('https://', 'https://user@'),
    p.RELEASES_URL.replace('github.com', 'github.com:443'),
    p.RELEASES_URL.replace('github.com', 'GITHUB.COM'),
    p.RELEASES_URL.replace('/releases', '/Releases'),
    p.RELEASES_URL.replace('github.com', 'github.com.evil.example'),
    'https://github.com/evil/littlebird-trainer/releases',
    'https://github.com/sylvainarnauda-shining/littlebird-trainer',
    'file:///C:/Windows/System32/calc.exe',
    'app://littlebird/index.html',
    'javascript:alert(1)',
    '',
    null,
    undefined,
    42,
    new URL(p.RELEASES_URL),
    { toString: () => p.RELEASES_URL },
  ])
    assert.equal(p.externalAllowed(u), false, String(u));
});

test('the releases link goes to the default browser by its exact address only, and never during a self-test', () => {
  const main = fs
    .readFileSync(path.join(ROOT, 'desktop', 'main.cjs'), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/ .*$/gm, '');
  // The window-open handler (links with target=_blank, window.open): the shell's constant, not the page's string, is
  // what reaches the default browser, and only when the page asked for exactly it; no window is ever created.
  assert.match(
    main,
    /contents\.setWindowOpenHandler\(\(\{ url \}\) => \{\s*if \(!selfTest && policy\.externalAllowed\(url\)\) shell\.openExternal\(policy\.RELEASES_URL\);\s*return \{ action: 'deny' \};\s*\}\);/,
  );
  assert.equal(main.match(/openExternal\(/g).length, 1, 'one call to shell.openExternal');
  assert.equal(main.match(/action: '(allow|deny)'/g).join(), "action: 'deny'", 'never a new window');
});

test('page policy: taken from the page, fails closed, header-only directive added', () => {
  const h = "'sha256-" + 'A'.repeat(43) + "='";
  const closed =
    "img-src 'none'; font-src 'none'; connect-src 'none'; media-src 'none'; worker-src 'none'; " +
    "manifest-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const policy = `default-src 'none'; script-src ${h} ${h}; style-src ${h}; ${closed}`;
  const meta = (c) => `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${c}">`;
  assert.equal(p.cspFromPage(meta(policy)), policy + "; frame-ancestors 'none'");
  assert.throws(() => p.cspFromPage('<meta charset="utf-8">'));
  assert.throws(() => p.cspFromPage(meta(policy) + meta(policy)), /single/);
  for (const bad of [
    policy.replace("default-src 'none'", 'default-src *'),
    policy.replace(`script-src ${h} ${h}`, "script-src 'unsafe-inline'"),
    policy.replace(`script-src ${h} ${h}`, `script-src ${h} 'unsafe-eval'`),
    policy.replace(`style-src ${h}`, "style-src 'unsafe-inline'"),
    policy.replace("connect-src 'none'", 'connect-src https:'),
    policy.replace("img-src 'none'", 'img-src data:'),
    policy.replace("object-src 'none'; ", ''),
    policy.replace("media-src 'none'; ", ''),
    policy.replace("font-src 'none'", 'font-src *'),
    // Directives that would override the hashes, or open what default-src closes.
    policy + '; script-src-elem *',
    policy + "; script-src-attr 'unsafe-inline'",
    policy + "; style-src-elem 'unsafe-inline'",
    policy + "; style-src-attr 'unsafe-inline'",
    policy + '; child-src *',
    policy + '; report-uri https://example.com/r',
    policy + '; prefetch-src *',
    policy + "; trusted-types 'allow-duplicates'",
    // A second script-src: a browser keeps the first one, so a lax one first must not pass.
    `default-src 'none'; script-src 'unsafe-inline'; ` + policy.replace("default-src 'none'; ", ''),
  ])
    assert.throws(() => p.cspFromPage(meta(bad)), bad.slice(0, 60));
  // The closing forms of the optional directives are accepted.
  const tt = policy + "; child-src 'none'; require-trusted-types-for 'script'; trusted-types 'none'";
  assert.equal(p.cspFromPage(meta(tt)), tt + "; frame-ancestors 'none'");
  const built = path.join(ROOT, 'dist', 'web', 'index.html');
  if (fs.existsSync(built)) {
    const c = p.cspFromPage(fs.readFileSync(built, 'utf8'));
    assert.equal(
      c,
      fs.readFileSync(path.join(ROOT, 'dist', 'web', 'csp.txt'), 'utf8').trim() + "; frame-ancestors 'none'",
    );
  }
  const headers = p.responseHeaders('x');
  assert.equal(headers['content-security-policy'], 'x');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'no-referrer');
  assert.match(headers['permissions-policy'], /camera=\(\), microphone=\(\), geolocation=\(\)/);
});

test('debugging, sandbox-weakening and network-rerouting switches are refused', () => {
  const present = new Set(['remote-debugging-port']);
  assert.equal(
    p.refusedSwitch((n) => present.has(n)),
    'remote-debugging-port',
  );
  assert.equal(
    p.refusedSwitch(() => false),
    null,
  );
  for (const s of [
    'remote-debugging-pipe',
    'remote-debugging-io-pipes',
    'inspect',
    'inspect-brk',
    'js-flags',
    'wait-for-debugger-children',
    'renderer-startup-dialog',
    'gpu-startup-dialog',
    'no-sandbox',
    'disable-web-security',
    'proxy-server',
    'host-resolver-rules',
    'load-extension',
    'single-process',
    'ignore-certificate-errors',
    // commands run in front of a Chromium process (CVE-2018-1000006 class)
    'renderer-cmd-prefix',
    'gpu-launcher',
    'utility-cmd-prefix',
    'browser-subprocess-path',
    // features, logs written to a chosen file, another profile
    'enable-features',
    'disable-features',
    'enable-logging',
    'log-file',
    'user-data-dir',
  ])
    assert.ok(p.REFUSED_SWITCHES.includes(s), s);
  // Electron itself sets this one on the browser process (measured): refusing it would refuse every start. The
  // self-test's own switches (enable-automation; use-gl and use-angle for WARP) are added after the check.
  for (const s of ['allow-file-access-from-files', 'enable-automation', 'use-gl', 'use-angle'])
    assert.ok(!p.REFUSED_SWITCHES.includes(s), s);
});

test('self-test arguments: one --lb-self-test with a hex nonce and LB_SELF_TEST set to it, else an error', () => {
  const env = (nonce) => ({ [p.SELF_TEST_ENV]: nonce });
  assert.equal(p.SELF_TEST_ENV, 'LB_SELF_TEST');
  assert.equal(p.selfTestArgs(['exe'], {}), null);
  assert.deepEqual(p.selfTestArgs(['exe', '--lb-self-test=0123456789abcdef'], env('0123456789abcdef')), {
    nonce: '0123456789abcdef',
    warp: false,
  });
  assert.deepEqual(p.selfTestArgs(['exe', '--lb-self-test=' + 'a'.repeat(64), '--lb-warp'], env('a'.repeat(64))), {
    nonce: 'a'.repeat(64),
    warp: true,
  });
  // A command line alone cannot start the self-test.
  for (const e of [{}, undefined, env('fedcba9876543210'), env('')])
    assert.ok(p.selfTestArgs(['exe', '--lb-self-test=0123456789abcdef'], e).error, JSON.stringify(e));
  for (const bad of [
    ['--lb-self-test'],
    ['--lb-self-test='],
    ['--lb-self-test=zz'],
    ['--lb-self-test=0123456789ABCDEF'],
    ['--lb-self-test=..\\..\\x'],
    ['--lb-self-test=' + 'a'.repeat(65)],
    ['--lb-self-test=0123456789abcdef', '--lb-self-test=0123456789abcdef'],
    ['--lb-self-testx=0123456789abcdef'],
  ])
    assert.ok(p.selfTestArgs(['exe', ...bad], env('0123456789abcdef')).error, bad.join(' '));
});

test('window settings: sandboxed, isolated, no Node, no DevTools when packaged; the self-test window cannot take input', () => {
  for (const [packaged, selfTest] of [
    [true, false],
    [false, false],
    [true, true],
  ]) {
    const o = p.windowOptions({ packaged, selfTest });
    const w = o.webPreferences;
    assert.equal(w.sandbox, true);
    assert.equal(w.contextIsolation, true);
    assert.equal(w.nodeIntegration, false);
    assert.equal(w.nodeIntegrationInWorker, false);
    assert.equal(w.nodeIntegrationInSubFrames, false);
    assert.equal(w.webSecurity, true);
    assert.equal(w.allowRunningInsecureContent, false);
    assert.equal(w.webviewTag, false);
    assert.equal(w.navigateOnDragDrop, false);
    assert.equal(w.experimentalFeatures, false);
    assert.equal('preload' in w, false, 'no preload');
    assert.equal(w.devTools, !packaged && !selfTest);
    assert.equal(o.show, false, 'shown only when ready (never for a self-test)');
    assert.equal(o.focusable, !selfTest);
    assert.equal(o.skipTaskbar, selfTest);
  }
});

test('main.cjs wires every rule and nothing else: no preload, no IPC, no remote content', () => {
  // The code without its comments (which name what the shell does not have).
  const main = fs
    .readFileSync(path.join(ROOT, 'desktop', 'main.cjs'), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/ .*$/gm, '');
  for (const hook of [
    'refusedSwitch',
    'selfTestArgs',
    'cspFromPage',
    'requestAllowed',
    'permissionAllowed',
    'downloadAllowed',
    'pageFor',
    'externalAllowed',
    'isAppUrl',
    'windowOptions',
    'responseHeaders',
  ])
    assert.ok(main.includes('policy.' + hook), hook);
  for (const call of [
    'setPermissionRequestHandler',
    'setPermissionCheckHandler',
    'setDevicePermissionHandler',
    'setWindowOpenHandler',
    "'will-navigate'",
    "'will-redirect'",
    "'will-frame-navigate'",
    "'will-attach-webview'",
    'onBeforeRequest',
    'enableSandbox',
    'requestSingleInstanceLock',
    'setApplicationMenu(null)',
    "setWebRTCIPHandlingPolicy('disable_non_proxied_udp')",
    "'will-prevent-unload'",
    'policy.selfTestArgs(process.argv, process.env)',
  ])
    assert.ok(main.includes(call), call);
  for (const banned of [
    'ipcMain',
    'preload',
    'autoUpdater',
    'crashReporter',
    'nodeIntegration: true',
    'loadURL(`http',
    "loadURL('http",
    'webSecurity: false',
    'openDevTools',
  ])
    assert.ok(!main.includes(banned), banned);
  assert.match(main, /loadURL\(`\$\{policy\.ORIGIN\}\/index\.html`\)/);
});
