'use strict';
// Security rules of the desktop shell, free of any Electron import so that node:test checks every rule
// (tests/desktop/policy.test.js). main.cjs only wires these functions into Electron's hooks.
// Invariants: one origin (app://littlebird), one page, no network, two permissions (none during a self-test), JSON
// exports only, no debugging endpoint in a packaged build.

const SCHEME = 'app';
const HOST = 'littlebird';
const ORIGIN = `${SCHEME}://${HOST}`;
// Frozen after the first release: Windows shortcuts, the uninstall entry and the taskbar grouping hang on the app id,
// and the player's profile (localStorage) lives under the origin above. Equal to electron-builder.yml (test).
const APP_ID = 'io.github.sylvainarnauda-shining.littlebird-trainer';
// The only external address the shell may hand to the default browser (the releases page). A test checks it against
// package.json's repository URL. It is the link of the page's "À propos" tab (src/app.js RELEASES_URL, the same string:
// tests/unit/about.test.js): a plain target=_blank link reaches the window-open handler of main.cjs, so the page needs
// no preload and no IPC to open it.
const RELEASES_URL = 'https://github.com/sylvainarnauda-shining/littlebird-trainer/releases';
// Pointer lock for the flight; fullscreen for F11 and a future display-mode setting. Nothing else, ever.
const ALLOWED_PERMISSIONS = new Set(['pointerLock', 'fullscreen']);
// File names produced by the page's "Exporter le profil" button (little-bird-profil.json).
const EXPORT_NAME = /^little-bird-[A-Za-z0-9._-]{1,80}\.json$/;
const PAGES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
]);
// Chromium and Node switches that open a debugging endpoint, weaken the sandbox or isolation, load or run foreign code,
// switch features on or off, write files to a chosen place, move the profile or reroute the network. A packaged build
// started with one of them exits at once (code 2). The Node ones are also disabled by the fuses (build/fuses.cjs); this
// is defence in depth. Not listed: allow-file-access-from-files, which Electron itself puts on the browser process's
// command line (measured on 44.4.5, and the only switch of this kind it adds; the others below are absent from a normal
// start, measured on 30/09/2026, and again on 44.5.1, where the packaged self-test, which stops at any of them, runs);
// it concerns file:// pages only, and the shell never loads one (navigation guard, request filter,
// GrantFileProtocolExtraPrivileges fuse off).
const REFUSED_SWITCHES = [
  // debugging endpoints and debuggers
  'remote-debugging-port',
  'remote-debugging-pipe',
  'remote-debugging-io-pipes',
  'remote-debugging-address',
  'remote-allow-origins',
  'remote-debugging-targets',
  'auto-open-devtools-for-tabs',
  'inspect',
  'inspect-brk',
  'inspect-port',
  'inspect-publish-uid',
  'js-flags',
  'wait-for-debugger-children',
  'renderer-startup-dialog',
  'gpu-startup-dialog',
  'utility-startup-dialog',
  // commands run in place of, or in front of, a Chromium process (CVE-2018-1000006 class)
  'renderer-cmd-prefix',
  'gpu-launcher',
  'utility-cmd-prefix',
  'browser-subprocess-path',
  // sandbox, isolation, features
  'no-sandbox',
  'disable-gpu-sandbox',
  'single-process',
  'no-zygote',
  'disable-web-security',
  'disable-site-isolation-trials',
  'allow-running-insecure-content',
  'enable-features',
  'disable-features',
  'enable-blink-features',
  'force-fieldtrials',
  'load-extension',
  // files and profile
  'enable-logging',
  'log-file',
  'user-data-dir',
  // network
  'proxy-server',
  'proxy-pac-url',
  'host-rules',
  'host-resolver-rules',
  'ignore-certificate-errors',
];
// Directives only an HTTP header can carry (ignored in a <meta> policy).
const HEADER_ONLY_CSP = "frame-ancestors 'none'";
// --lb-self-test=<nonce>: the nonce names the report file and the throw-away profile folder, so it is plain hex. The
// launcher (scripts/desktop-smoke.mjs) also sets the environment variable LB_SELF_TEST to the same nonce: a command
// line alone (a shortcut, another program) cannot put the shipped app into its self-test.
const SELF_TEST = /^--lb-self-test=([0-9a-f]{16,64})$/;
const SELF_TEST_ENV = 'LB_SELF_TEST';

function parse(raw) {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

// app://littlebird/... (no credentials, no port) or a blob: URL minted by that origin.
function isAppUrl(raw) {
  if (typeof raw === 'string' && raw.length <= 4096 && raw.startsWith(`blob:${ORIGIN}/`)) return true;
  const u = parse(raw);
  return Boolean(u && u.protocol === `${SCHEME}:` && u.host === HOST && !u.username && !u.password && !u.port);
}

// webRequest: everything that is not the app itself is cancelled (DevTools only in an unpacked developer run).
function requestAllowed(raw, { packaged }) {
  if (isAppUrl(raw)) return true;
  return !packaged && typeof raw === 'string' && raw.startsWith('devtools://');
}

// Permission requests and checks: pointer lock and fullscreen from our origin only; nothing at all during a self-test
// (an automated run must never capture the machine's mouse or take the screen).
function permissionAllowed(permission, requestingUrl, { selfTest = false } = {}) {
  if (selfTest) return false;
  return ALLOWED_PERMISSIONS.has(permission) && isAppUrl(requestingUrl);
}

// Downloads: only JSON exports created by the page (blob: of our origin).
function downloadAllowed(raw, filename) {
  const name = String(filename || '')
    .split(/[\\/]/)
    .pop();
  return typeof raw === 'string' && raw.startsWith(`blob:${ORIGIN}/`) && EXPORT_NAME.test(name);
}

// Protocol handler: the file that answers a request, or null (404).
function pageFor(method, raw) {
  const u = parse(raw);
  if (method !== 'GET' || !u || u.protocol !== `${SCHEME}:` || u.host !== HOST || u.username || u.port) return null;
  return PAGES.get(u.pathname) || null;
}

// window.open / target=_blank: never a new window; the releases page alone may open in the default browser.
function externalAllowed(raw) {
  return raw === RELEASES_URL;
}

// The page's own policy (its <meta>) plus the header-only directives. Fails closed, on an exact allowlist: every
// directive is known and appears once; default-src is 'none'; script-src and style-src are sha256 hashes only; every
// other directive is exactly 'none', and the fetch, navigation and document directives the page relies on being closed
// are all present. No script-src-elem/-attr or style-src-elem/-attr (they would override the hashes), no report
// endpoint. Two Trusted Types directives are accepted in their closing form only.
const CSP_HASHED = new Set(['script-src', 'style-src']);
const CSP_CLOSED = [
  'default-src',
  'img-src',
  'font-src',
  'connect-src',
  'media-src',
  'worker-src',
  'manifest-src',
  'frame-src',
  'object-src',
  'base-uri',
  'form-action',
];
const CSP_OPTIONAL = new Map([
  ['child-src', "'none'"],
  ['require-trusted-types-for', "'script'"],
  ['trusted-types', "'none'"],
]);
function cspFromPage(html) {
  const metas = [...String(html).matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/g)];
  if (metas.length !== 1) throw new Error('index.html carries no single Content-Security-Policy');
  const csp = metas[0][1];
  const directives = new Map();
  for (const part of csp.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/).filter(Boolean);
    if (!name) continue;
    const key = name.toLowerCase();
    if (directives.has(key)) throw new Error(`index.html: ${key} appears twice in the Content-Security-Policy`);
    directives.set(key, values);
  }
  const hashesOnly = (name) =>
    (directives.get(name) || []).length > 0 &&
    directives.get(name).every((v) => /^'sha256-[A-Za-z0-9+/]{43}='$/.test(v));
  const exactly = (name, value) => JSON.stringify(directives.get(name)) === JSON.stringify([value]);
  if (!exactly('default-src', "'none'") || !hashesOnly('script-src') || !hashesOnly('style-src'))
    throw new Error('index.html carries no strict Content-Security-Policy');
  for (const name of CSP_CLOSED) if (!exactly(name, "'none'")) throw new Error(`index.html: ${name} must be 'none'`);
  for (const name of directives.keys()) {
    if (CSP_HASHED.has(name) || CSP_CLOSED.includes(name)) continue;
    if (!CSP_OPTIONAL.has(name)) throw new Error(`index.html: directive ${name} is not allowed`);
    if (!exactly(name, CSP_OPTIONAL.get(name)))
      throw new Error(`index.html: ${name} must be ${CSP_OPTIONAL.get(name)}`);
  }
  return `${csp}; ${HEADER_ONLY_CSP}`;
}

// gamepad: the page reads joysticks only when the player asks (HOTAS on in flight, or the joystick panel's read
// button); a self-test must never read the machine's joysticks, so it gets gamepad=() (navigator.getGamepads throws),
// on top of the page's own emulation under automation. There is no Electron permission for gamepads.
function responseHeaders(csp, { selfTest = false } = {}) {
  return {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': csp,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'permissions-policy':
      'camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=(), bluetooth=(), payment=(), ' +
      'display-capture=(), midi=(), clipboard-read=(), idle-detection=(), ' +
      (selfTest ? 'gamepad=()' : 'gamepad=(self)'),
    'cache-control': 'no-store',
  };
}

// hasSwitch is app.commandLine.hasSwitch, which applies Chromium's own parsing (--x, -x and /x on Windows).
function refusedSwitch(hasSwitch) {
  return REFUSED_SWITCHES.find((name) => hasSwitch(name)) || null;
}

// The self-test arguments of a command line and environment: null (a normal start), {nonce, warp}, or {error} (a
// malformed or repeated --lb-self-test, or one without LB_SELF_TEST equal to its nonce, which makes the shell exit).
function selfTestArgs(argv, env = {}) {
  const given = argv.filter((a) => typeof a === 'string' && a.startsWith('--lb-self-test'));
  if (!given.length) return null;
  const m = given.length === 1 ? SELF_TEST.exec(given[0]) : null;
  if (!m) return { error: 'malformed --lb-self-test (expected --lb-self-test=<16 to 64 hex digits>)' };
  if (!env || env[SELF_TEST_ENV] !== m[1])
    return { error: `--lb-self-test without the environment variable ${SELF_TEST_ENV} set to its nonce` };
  return { nonce: m[1], warp: argv.includes('--lb-warp') };
}

// The window and its page settings. Node never reaches the page (no preload, no IPC); DevTools only in an unpacked
// developer run. A self-test window is never focusable and absent from the taskbar (self-test.cjs also makes it
// click-through and shows it without activation): it cannot take the keyboard or the mouse.
function windowOptions({ packaged, selfTest = false }) {
  return {
    width: selfTest ? 1280 : 1600,
    height: selfTest ? 720 : 900,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    focusable: !selfTest,
    skipTaskbar: selfTest,
    backgroundColor: '#0f1418',
    title: 'LittleBird Trainer',
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      safeDialogs: true,
      devTools: !packaged && !selfTest,
      backgroundThrottling: !selfTest,
    },
  };
}

module.exports = {
  SCHEME,
  HOST,
  ORIGIN,
  APP_ID,
  RELEASES_URL,
  ALLOWED_PERMISSIONS,
  EXPORT_NAME,
  REFUSED_SWITCHES,
  SELF_TEST_ENV,
  isAppUrl,
  requestAllowed,
  permissionAllowed,
  downloadAllowed,
  pageFor,
  externalAllowed,
  cspFromPage,
  responseHeaders,
  refusedSwitch,
  selfTestArgs,
  windowOptions,
};
