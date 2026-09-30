'use strict';
// Desktop shell (Electron main process). One hardened window shows dist/web/index.html, the same single file as the
// browser download, from the app:// origin. No preload, no IPC, no Node.js in the page, no network, no auto-update, no
// crash reporter. The rules are in policy.cjs (unit-tested); this file only wires them into Electron. The self-test
// (--lb-self-test=<nonce> with LB_SELF_TEST=<nonce> in the environment, self-test.cjs) runs the same wiring with an
// unfocusable, click-through window, every permission denied and a throw-away profile.
const { app, BrowserWindow, Menu, dialog, protocol, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('./policy.cjs');

const PAGE = path.join(__dirname, '..', 'dist', 'web', 'index.html'); // inside app.asar once packaged

const selfTestArgs = policy.selfTestArgs(process.argv, process.env);
if (selfTestArgs && selfTestArgs.error) process.exit(3);
const selfTest = selfTestArgs ? require('./self-test.cjs') : null;
// A packaged build never runs with a debugging endpoint, a weakened sandbox or a rerouted network.
const refused = app.isPackaged ? policy.refusedSwitch((name) => app.commandLine.hasSwitch(name)) : null;
if (refused) {
  if (selfTest) selfTest.refuse(app, selfTestArgs, refused);
  process.exit(2);
}
if (selfTest) selfTest.configure(app, selfTestArgs);

protocol.registerSchemesAsPrivileged([{ scheme: policy.SCHEME, privileges: { standard: true, secure: true } }]);
app.enableSandbox();

// The page and its policy are read once. Without a strict policy in the page the app does not start (fail closed).
let html = null;
let csp = null;
let startError = null;
try {
  html = fs.readFileSync(PAGE);
  csp = policy.cspFromPage(html.toString('utf8'));
} catch (e) {
  startError = e;
}

if (startError) {
  app.whenReady().then(() => {
    if (selfTest) return selfTest.fail(app, selfTestArgs, 'start refused: ' + startError.message);
    dialog.showErrorBox('LittleBird Trainer', 'La page du jeu est invalide ou incomplète : réinstallez le programme.');
    app.exit(1);
  });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(policy.APP_ID);
  // No application menu: Alt is the free-look key and must not focus a menu bar (the page would lose focus and pause);
  // this also removes the default reload and DevTools shortcuts.
  Menu.setApplicationMenu(null);
  app.on('web-contents-created', (_event, contents) => guard(contents));
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || selfTest) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app
    .whenReady()
    .then(start)
    .catch((e) => {
      if (selfTest) return selfTest.fail(app, selfTestArgs, 'start failed: ' + String(e && e.message));
      dialog.showErrorBox('LittleBird Trainer', 'Le jeu n’a pas pu démarrer : ' + String(e && e.message));
      app.exit(1);
    });
}

async function start() {
  const ses = session.defaultSession;
  const flags = { selfTest: Boolean(selfTest) };
  protocol.handle(policy.SCHEME, (request) => {
    const file = policy.pageFor(request.method, request.url);
    if (!file) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    return new Response(html, { status: 200, headers: policy.responseHeaders(csp) });
  });
  ses.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: !policy.requestAllowed(details.url, { packaged: app.isPackaged }) }),
  );
  ses.setPermissionRequestHandler((_contents, permission, callback, details) =>
    callback(policy.permissionAllowed(permission, details.requestingUrl, flags)),
  );
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    policy.permissionAllowed(permission, requestingOrigin, flags),
  );
  ses.setDevicePermissionHandler(() => false);
  ses.on('will-download', (_event, item) => {
    const allowed = policy.downloadAllowed(item.getURL(), item.getFilename());
    if (!allowed) item.cancel();
    if (selfTest) return selfTest.download(item, allowed, selfTestArgs.nonce);
    if (!allowed) return;
    item.setSaveDialogOptions({
      defaultPath: path.join(app.getPath('documents'), path.basename(item.getFilename())),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
  });
  const win = new BrowserWindow(policy.windowOptions({ packaged: app.isPackaged, selfTest: Boolean(selfTest) }));
  const contents = win.webContents;
  if (selfTest) {
    await selfTest.prepare(win, app);
    selfTest.run(win, app, { args: selfTestArgs, session: ses, policy });
  } else {
    // F11 toggles fullscreen, as in a browser.
    contents.on('before-input-event', (event, input) => {
      if (
        input.type === 'keyDown' &&
        input.key === 'F11' &&
        !input.alt &&
        !input.control &&
        !input.meta &&
        !input.shift
      ) {
        win.setFullScreen(!win.isFullScreen());
        event.preventDefault();
      }
    });
    contents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') return;
      const choice = dialog.showMessageBoxSync(win, {
        type: 'error',
        buttons: ['Recharger', 'Quitter'],
        defaultId: 0,
        cancelId: 1,
        title: 'LittleBird Trainer',
        message: 'Le jeu s’est arrêté de façon inattendue.',
        detail: `Raison : ${details.reason}`,
      });
      if (choice === 0) contents.reload();
      else app.quit();
    });
    win.once('ready-to-show', () => {
      win.maximize();
      win.show();
    });
  }
  win.loadURL(`${policy.ORIGIN}/index.html`);
}

// Every web contents: no pop-up (the releases page alone, the link of the page's "À propos" tab, goes to the default
// browser, and never during a self-test), no navigation away from the app, no <webview>, no WebRTC traffic outside a
// proxy (none is configured: the page has no WebRTC code, and this keeps a peer connection from bypassing the request
// filter). The page asks the browser to confirm closing during a session (a guard against Ctrl+W in a browser tab); the
// app has no such shortcut, and closing its window is always a deliberate choice, so the app closes without asking.
// At most one browser tab per 1.5 s, however often the page asks (click, Enter, script): a nuisance guard, the address
// being the shell's own constant anyway. A failure of Windows to open it is ignored (no unhandled rejection).
const EXTERNAL_INTERVAL_MS = 1500;
let lastExternal = 0;
function guard(contents) {
  contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  contents.on('will-prevent-unload', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (!selfTest && policy.externalAllowed(url) && Date.now() - lastExternal > EXTERNAL_INTERVAL_MS) {
      lastExternal = Date.now();
      shell.openExternal(policy.RELEASES_URL).catch(() => {});
    }
    return { action: 'deny' };
  });
  const stayHome = (event, legacyUrl) => {
    if (!policy.isAppUrl(event.url || legacyUrl)) event.preventDefault();
  };
  contents.on('will-navigate', stayHome);
  contents.on('will-frame-navigate', stayHome);
  contents.on('will-redirect', stayHome);
  contents.on('will-attach-webview', (event) => event.preventDefault());
}
