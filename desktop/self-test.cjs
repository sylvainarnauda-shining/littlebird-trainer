'use strict';
// Self-test of the packaged app, loaded only when the executable is started with --lb-self-test=<nonce> and the
// environment variable LB_SELF_TEST=<nonce> (scripts/desktop-smoke.mjs, CI "desktop" job, release "verify-artifacts"
// job). It proves, on the shipped files and under the
// shipped fuses, that:
//  1. positive: the page loads from app.asar under its policy and boots; the page runs under automation and emulates
//     the pointer lock itself (checked BEFORE Start is clicked; without it the test stops); the engine replays the
//     golden parity script (G5, desktop/parity.cjs: a known engine digest, every state within tolerance of the Node
//     golden); a session starts, flies and pauses; storage and the profile export work; no console error;
//  2. negative: the page has no Node.js and no test hook; network, pop-ups, navigation away, injected scripts, eval
//     and non-JSON downloads are refused; the app serves nothing but its page.
// Safety on the machine that runs it: the window is shown without activation in a corner of the screen, cannot take
// focus, lets every mouse event through to the windows below and is absent from the taskbar; every permission (pointer
// lock, fullscreen included) is denied, so the page could not capture the mouse or take the screen even if its
// emulation failed; the profile is a throw-away folder in %TEMP%, never the player's. The verdict is the exit code;
// details go to a report named after the nonce in %TEMP%\littlebird-self-test\ (no path is taken from the command
// line).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const parity = require('./parity.cjs');

const ROOT = path.join(os.tmpdir(), 'littlebird-self-test');
const reportPath = (nonce) => path.join(ROOT, `report-${nonce}.json`);
const profilePath = (nonce) => path.join(ROOT, `profile-${nonce}`);
// An address that can never resolve (RFC 2606 .invalid): a probe that got through would fail by name, not reach anyone.
const PROBE_URL = 'https://littlebird-probe.invalid/';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Before the app is ready: throw-away profile (the single-instance lock lives in it, so a running copy of the game is
// not disturbed), automation mode (navigator.webdriver: the page emulates the pointer lock), software WebGL if asked.
function configure(app, args) {
  fs.mkdirSync(ROOT, { recursive: true });
  // Whatever happens next, the self-test ends within six minutes with a verdict.
  setTimeout(() => {
    writeShortReport(app, args, 'timeout (360 s)');
    app.exit(1);
  }, 360000);
  fs.rmSync(profilePath(args.nonce), { recursive: true, force: true });
  app.setPath('userData', profilePath(args.nonce));
  app.commandLine.appendSwitch('enable-automation');
  if (args.warp) {
    // Machines without a usable GPU (CI runners): WebGL through Windows' software Direct3D 11 rasterizer (WARP).
    app.commandLine.appendSwitch('use-gl', 'angle');
    app.commandLine.appendSwitch('use-angle', 'd3d11-warp');
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
  }
}

// Downloads during the self-test: an allowed one is saved in the throw-away profile (no dialog), a refused one is
// recorded; main.cjs has already cancelled it.
const downloads = [];
function download(item, allowed, nonce) {
  const entry = { name: path.basename(item.getFilename()), allowed, state: allowed ? 'progressing' : 'cancelled' };
  downloads.push(entry);
  if (!allowed) return;
  const file = path.join(profilePath(nonce), 'downloads', entry.name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  item.setSavePath(file);
  item.once('done', (_event, state) => {
    entry.state = state;
    entry.file = file;
  });
}

// Before the page loads: besides the enable-automation switch, the automation flag is also set through the window's own
// DevTools protocol session (in process, no debugging port), so that navigator.webdriver is true either way.
// The command is answered once the page's renderer exists, so it is not awaited for more than 2 s.
let prepared = null;
async function prepare(win, app) {
  prepared = { switch: app.commandLine.hasSwitch('enable-automation'), cdp: false };
  try {
    win.webContents.debugger.attach('1.3');
    const sent = win.webContents.debugger
      .sendCommand('Emulation.setAutomationOverride', { enabled: true })
      .then(() => (prepared.cdp = true));
    // The window can never take focus: the page is told it has it (as headless browsers do), otherwise its blur
    // handler would pause the session at once.
    const focus = win.webContents.debugger
      .sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
      .then(() => (prepared.focus = true));
    await Promise.race([Promise.all([sent, focus]), sleep(2000)]);
  } catch (e) {
    prepared.cdpError = String(e && e.message).slice(0, 120);
  }
}

function run(win, app, { args, session, policy }) {
  const contents = win.webContents;
  // A hidden window gets about one animation frame per second (measured), too few to fly a session: the window is
  // shown without being activated, in a corner of the screen, click-through (the mouse passes to the windows below)
  // and unable to take focus (policy.windowOptions), so it can receive neither the mouse nor the keyboard.
  const { screen } = require('electron');
  const area = screen.getPrimaryDisplay().workArea;
  win.setBounds({
    width: 1024,
    height: 600,
    x: area.x + Math.max(0, area.width - 1024),
    y: area.y + Math.max(0, area.height - 600),
  });
  win.setIgnoreMouseEvents(true);
  win.once('ready-to-show', () => win.showInactive());
  const report = {
    nonce: args.nonce,
    ok: false,
    failure: null,
    version: app.getVersion(),
    packaged: app.isPackaged,
    versions: { electron: process.versions.electron, chrome: process.versions.chrome, v8: process.versions.v8 },
    warp: args.warp,
    steps: {},
    errors: [],
    expectedErrors: [],
  };
  let phase = 'positive';
  let done = false;
  const finish = (failure) => {
    if (done) return;
    done = true;
    report.failure = failure;
    report.ok = !failure;
    report.gpu = app.getGPUFeatureStatus();
    report.downloads = downloads.map(({ name, allowed, state }) => ({ name, allowed, state }));
    report.seconds = Math.round((Date.now() - started) / 100) / 10;
    try {
      fs.writeFileSync(reportPath(args.nonce), JSON.stringify(report, null, 1) + '\n');
    } finally {
      app.exit(report.ok ? 0 : 1);
    }
  };
  const started = Date.now();
  const deadline = setTimeout(() => finish('timeout (300 s)'), 300000);
  deadline.unref?.();
  contents.on('console-message', (event, legacyLevel, legacyMessage) => {
    const level = event.level ?? legacyLevel;
    const message = String(event.message ?? legacyMessage).slice(0, 300);
    if (level === 'error' || level === 3) (phase === 'positive' ? report.errors : report.expectedErrors).push(message);
  });
  contents.on('render-process-gone', (_event, details) => finish('renderer gone: ' + details.reason));
  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && phase === 'positive') finish(`the page did not load (${code} ${description})`);
  });
  const js = (code) => contents.executeJavaScript(code, true);
  const poll = async (code, ms, what) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) {
      if (await js(code).catch(() => false)) return;
    }
    throw new Error('timed out waiting for ' + what);
  };

  contents.once('did-finish-load', async () => {
    try {
      report.url = contents.getURL();
      const booted =
        "!!(window.trainerDiagnostics && document.getElementById('start') && !document.getElementById('start').disabled)";
      await poll(booted, 180000, 'the menu');
      report.steps.window = {
        visible: win.isVisible(),
        focused: win.isFocused(),
        focusable: win.isFocusable(),
        bounds: win.getBounds(),
      };
      // 1. Automation and pointer-lock emulation, before anything is clicked.
      const env = await js(
        '({webdriver: navigator.webdriver === true, emulated: window.__LB_EMULATED_POINTER_LOCK__ === true,' +
          ' unlocked: document.pointerLockElement === null})',
      );
      report.steps.emulation = { ...env, via: prepared };
      if (!env.webdriver || !env.emulated || !env.unlocked)
        return finish('the page does not emulate the pointer lock: Start was not clicked');
      // 2. The menu renders WebGL frames.
      await poll('trainerDiagnostics().webgl.calls > 0', 60000, 'WebGL frames in the menu');
      report.steps.menu = await js('({calls: trainerDiagnostics().webgl.calls, map: trainerDiagnostics().map.id})');
      // 3. Engine parity (G5): the golden parity script on the page's own flight module.
      const t = Date.now();
      const got = await js(parity.pageExpression());
      const verdict = parity.compare(got);
      report.steps.parity = { ...verdict, final: got.final, steps: got.steps, ms: Date.now() - t };
      if (!verdict.ok) return finish('engine parity (G5): ' + JSON.stringify(verdict));
      // 4. Local storage of the app:// origin.
      report.steps.storage = await js(
        "(() => { try { localStorage.setItem('lb-self-test', '1'); const ok = localStorage.getItem('lb-self-test') === '1';" +
          " localStorage.removeItem('lb-self-test'); return {ok, saveState: document.getElementById('saveState').textContent.includes('indisponible') ? 'unavailable' : 'ok'}; }" +
          ' catch (e) { return {ok: false, error: String(e)}; } })()',
      );
      if (!report.steps.storage.ok || report.steps.storage.saveState !== 'ok')
        return finish('local storage unavailable');
      // 5. A session: Start (emulated lock), three seconds of flight, then the pause through the emulated unlock. The
      // emulation is asserted once more right before the click (tests/desktop/self-test-safety.test.js keeps it there).
      const still = await js(
        '(window.__LB_EMULATED_POINTER_LOCK__ === true && navigator.webdriver === true && document.pointerLockElement === null)',
      );
      if (still !== true) return finish('the page no longer emulates the pointer lock: Start was not clicked');
      await js("document.getElementById('start').click()");
      await poll('document.pointerLockElement !== null && trainerDiagnostics().running', 30000, 'the session');
      const d0 = await js('(() => { const d = trainerDiagnostics(); return {time: d.time, calls: d.webgl.calls}; })()');
      await sleep(3000);
      const d1 = await js(
        '(() => { const d = trainerDiagnostics(); return {time: d.time, calls: d.webgl.calls, fps: d.fps, running: d.running,' +
          ' hidden: document.hidden, focus: document.hasFocus()}; })()',
      );
      await js('document.exitPointerLock()');
      await poll('!trainerDiagnostics().running', 10000, 'the pause');
      report.steps.session = {
        simulated: Math.round((d1.time - d0.time) * 100) / 100,
        calls: d1.calls,
        fps: d1.fps,
        runningAfter3s: d1.running,
        hidden: d1.hidden,
        focus: d1.focus,
      };
      if (!(d1.time - d0.time > 0.5) || !(d1.calls > 0)) return finish('the session did not fly');
      // 6. The profile export (a JSON download of the page, saved without a dialog in the throw-away profile).
      await js("document.getElementById('export').click()");
      for (let i = 0; i < 50 && !downloads.some((d) => d.allowed && d.state !== 'progressing'); i++) await sleep(100);
      const exp = downloads.find((d) => d.allowed);
      const saved = exp && exp.state === 'completed' ? JSON.parse(fs.readFileSync(exp.file, 'utf8')) : null;
      report.steps.export = { name: exp && exp.name, state: exp && exp.state, keys: saved && Object.keys(saved) };
      if (!saved || saved.format !== 'littlebird-trainer-profile') return finish('the profile export failed');
      if (report.errors.length) return finish('console errors during the positive phase');

      // Negative probes: refusals are expected to log errors from here on.
      phase = 'negative';
      report.steps.page = await js(`(async () => {
        const violations = [];
        document.addEventListener('securitypolicyviolation', (e) => violations.push(e.effectiveDirective));
        const out = {};
        out.node = ['require', 'process', 'module', 'Buffer', 'global', 'electron'].filter((k) => typeof window[k] !== 'undefined');
        out.hooks = ['__LB_EXPOSE__', '__LB_SYNC__', '__LB_MANUAL_CLOCK__', '__LB_REAL_POINTER_LOCK__', '__app'].filter((k) => k in window);
        out.fetch = await fetch(${JSON.stringify(PROBE_URL)}).then(() => 'reached', () => 'blocked');
        out.fetchSelf = await fetch('app://littlebird/index.html').then(() => 'reached', () => 'blocked');
        out.popup = window.open(${JSON.stringify(PROBE_URL)}) === null ? 'blocked' : 'opened';
        const s = document.createElement('script');
        s.textContent = 'window.__lbInjected = 1';
        document.head.appendChild(s);
        out.inlineScript = window.__lbInjected === 1 ? 'ran' : 'blocked';
        try { (0, eval)('1'); out.eval = 'ran'; } catch (e) { out.eval = 'blocked'; }
        const blob = new Blob(['x'], { type: 'application/octet-stream' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'little-bird-probe.exe';
        a.click();
        await new Promise((r) => setTimeout(r, 300));
        out.violations = [...new Set(violations)].sort();
        return out;
      })()`);
      await js(`location.href = ${JSON.stringify(PROBE_URL)}`).catch(() => {});
      await sleep(1500);
      report.steps.navigation = { stayed: policy.isAppUrl(contents.getURL()) };
      // The shell's own network layer, below the page's policy: a request of the session is cancelled.
      report.steps.network = await session.fetch(PROBE_URL).then(
        () => 'reached',
        (e) => (/ERR_BLOCKED_BY_CLIENT/.test(String(e && e.message)) ? 'blocked' : 'other: ' + String(e).slice(0, 80)),
      );
      // The app serves its page (with the header policy) and nothing else.
      const page = await session.fetch('app://littlebird/index.html').catch((e) => ({ status: String(e) }));
      const other = await session.fetch('app://littlebird/package.json').catch((e) => ({ status: String(e) }));
      report.steps.serve = {
        page: page.status,
        headerPolicy: page.headers
          ? /frame-ancestors 'none'$/.test(page.headers.get('content-security-policy'))
          : false,
        packageJson: other.status,
      };
      await sleep(300);
      const n = report.steps.page;
      const refused = downloads.find((d) => d.name === 'little-bird-probe.exe');
      const checks = {
        node: n.node.length === 0,
        hooks: n.hooks.length === 0,
        fetch: n.fetch === 'blocked' && n.fetchSelf === 'blocked',
        popup: n.popup === 'blocked',
        inlineScript: n.inlineScript === 'blocked',
        eval: n.eval === 'blocked',
        violations: ['connect-src', 'script-src-elem'].every((v) => n.violations.includes(v)),
        download: !!refused && !refused.allowed,
        navigation: report.steps.navigation.stayed,
        network: report.steps.network === 'blocked',
        serve:
          report.steps.serve.page === 200 && report.steps.serve.headerPolicy && report.steps.serve.packageJson === 404,
      };
      report.steps.negative = checks;
      const failed = Object.keys(checks).filter((k) => !checks[k]);
      clearTimeout(deadline);
      finish(failed.length ? 'negative probes failed: ' + failed.join(', ') : null);
    } catch (e) {
      finish(String((e && e.stack) || e).slice(0, 500));
    }
  });
}

function writeShortReport(app, args, failure, extra = {}) {
  fs.mkdirSync(ROOT, { recursive: true });
  const report = {
    nonce: args.nonce,
    ok: false,
    failure,
    version: app.getVersion(),
    packaged: app.isPackaged,
    ...extra,
  };
  fs.writeFileSync(reportPath(args.nonce), JSON.stringify(report, null, 1) + '\n');
}
// A failure before the window exists (for example a page without a strict policy): same report, exit code 1.
function fail(app, args, failure) {
  writeShortReport(app, args, failure);
  app.exit(1);
}
// A refused command-line switch (main.cjs exits with code 2 right after): the report names it.
function refuse(app, args, name) {
  writeShortReport(app, args, 'refused switch: ' + name, { refused: name });
}

module.exports = { configure, download, prepare, run, fail, refuse, ROOT, reportPath, profilePath, PROBE_URL };
