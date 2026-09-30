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
// The folder of the reports and throw-away profiles, used only if it is a real folder (not a link that would send the
// files elsewhere). On Windows it lies in the user's own %TEMP% and the modes below only set the read-only bit; where
// the temporary folder is shared (POSIX /tmp), a folder another user made first is refused, and ours is kept to us.
function privateRoot() {
  fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(ROOT);
  if (!stat.isDirectory()) throw new Error(ROOT + ' is not a folder');
  if (typeof process.getuid === 'function') {
    if (stat.uid !== process.getuid()) throw new Error(ROOT + ' belongs to another user');
    if (stat.mode & 0o077) fs.chmodSync(ROOT, 0o700);
  }
}
// The report is a new file (mode 0600 where the system has POSIX modes): an existing file or link of that name (the
// launcher removes any stale report before it starts the app) is never written through. Returns whether it was
// written; it never throws, so that the verdict is always given by the exit code.
function writeReport(nonce, report) {
  try {
    privateRoot();
    fs.writeFileSync(reportPath(nonce), JSON.stringify(report, null, 1) + '\n', { flag: 'wx', mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}
// An address that can never resolve (RFC 2606 .invalid): a probe that got through would fail by name, not reach anyone.
const PROBE_URL = 'https://littlebird-probe.invalid/';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// What "the session flies" means (chosen): the page's own frame loop, on its real clock, simulates at least `simulated`
// seconds of flight over at least `frames` display frames, the session running throughout. The self-test waits for
// that, frame by frame, for at most `wallMs` of real time, instead of measuring a fixed stretch of real time: with
// software WebGL (WARP, --lb-warp, the CI runners) the valley renders at about 1.6 frames per second on a 12-thread
// desktop CPU (measured: 575-650 ms per frame in the menu and in flight, 2.5 s for the first flight frame) and slower on
// a 4-CPU runner, and the page's frame loop counts at most 0.1 s of simulated time per frame (a stalled frame must not
// make the helicopter jump), so the flight runs in slow motion there: three seconds of real time simulated 0.46 s on
// that desktop and 0.1 s on a CI runner, while the session was running, visible and focused. (The page's fps reading is
// an average seeded at 60 that moves 5 % per frame, so after a few such frames it still read 44-51.) With a GPU the same
// wait takes about 2 s. A frame counts toward `frames` only if it both advanced the simulation and drew the scene
// (WebGL draw calls of that frame, which the page counts from zero at the start of each frame): a loop that simulates
// without drawing, or that stalls after a jump of time, never flies. 2 s simulated at 0.1 s per frame needs at least 20
// such frames; the report keeps the timeline (first, median and longest frame, stalls, long tasks) to tell a slow
// machine from a broken loop.
const SESSION = { simulated: 2, frames: 20, wallMs: 180000 };
// Bounds of the waits for asynchronous evidence (a download, a navigation attempt, policy violation events): generous,
// since each wait ends as soon as the evidence is there.
const EVIDENCE_MS = 15000;

// frameTimes and flyUntil run in the page (their source text is sent to it), where these globals exist.
/* global window, document, requestAnimationFrame */
// Evaluated in the page: the intervals of the next `count` display frames (ms), for the report (at most wallMs).
function frameTimes(count, wallMs) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const out = [];
    let last = t0;
    const tick = () => {
      const now = performance.now();
      out.push(Math.round(now - last));
      last = now;
      if (out.length < count && now - t0 < wallMs) requestAnimationFrame(tick);
      else resolve(out);
    };
    requestAnimationFrame(tick);
  });
}

// Evaluated in the page (its source text is sent, no closure): resolves once the session has flown as `want` asks, or
// has stopped running, or after want.wallMs; returns the timeline. One requestAnimationFrame callback per display frame,
// registered after the page's own, so each one sees the state that frame computed (its simulated time and its draw
// calls). Flown: at least want.simulated seconds simulated, at least want.frames frames that advanced the simulation and
// drew, the last frame drew, and the session is still running.
function flyUntil(want) {
  return new Promise((resolve) => {
    const read = () => {
      const d = window.trainerDiagnostics();
      return { time: d.time, running: d.running, calls: d.webgl.calls, fps: d.fps };
    };
    const start = read();
    const t0 = performance.now();
    const intervals = [];
    const longTasks = [];
    let observer = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          if (longTasks.length < 40) longTasks.push([Math.round(e.startTime - t0), Math.round(e.duration)]);
      });
      observer.observe({ type: 'longtask' });
    } catch {
      observer = null;
    }
    let last = t0;
    let previous = start.time;
    let flying = 0; // frames that advanced the simulation and drew the scene
    let drawn = 0; // frames that drew the scene
    const tick = () => {
      const now = performance.now();
      intervals.push(now - last);
      last = now;
      const s = read();
      const advanced = s.time > previous;
      previous = s.time;
      if (s.calls > 0) drawn++;
      if (advanced && s.calls > 0) flying++;
      const simulated = s.time - start.time;
      const flown = simulated >= want.simulated && flying >= want.frames && s.calls > 0;
      if (!(flown || !s.running || now - t0 > want.wallMs)) return requestAnimationFrame(tick);
      if (observer) observer.disconnect();
      const sorted = [...intervals].sort((a, b) => a - b);
      const stalls = intervals.filter((ms) => ms > 100);
      const r = (x, k = 1) => Math.round(x * k) / k;
      resolve({
        flown: flown && s.running,
        simulated: r(simulated, 1000),
        frames: intervals.length,
        flyingFrames: flying,
        drawnFrames: drawn,
        wallMs: Math.round(now - t0),
        firstFrameMs: Math.round(intervals[0]),
        longestFrameMs: Math.round(sorted[sorted.length - 1]),
        medianFrameMs: r(sorted[Math.floor(sorted.length / 2)], 10),
        stalls: { count: stalls.length, ms: Math.round(stalls.reduce((a, b) => a + b, 0)) },
        firstFramesMs: intervals.slice(0, 12).map((ms) => Math.round(ms)),
        longTasks,
        running: s.running,
        calls: s.calls,
        fps: s.fps,
        hidden: document.hidden,
        focus: document.hasFocus(),
      });
    };
    requestAnimationFrame(tick);
  });
}

// Before the app is ready: throw-away profile (the single-instance lock lives in it, so a running copy of the game is
// not disturbed), automation mode (navigator.webdriver: the page emulates the pointer lock), software WebGL if asked.
function configure(app, args) {
  try {
    privateRoot();
  } catch {
    // No report can be written and no profile made: the exit code alone says so (the app is not ready yet).
    process.exit(1);
  }
  // Whatever happens next, the self-test ends within eight minutes with a verdict.
  setTimeout(() => {
    writeShortReport(app, args, 'timeout (480 s)');
    app.exit(1);
  }, 480000);
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
    const written = writeReport(args.nonce, report);
    app.exit(report.ok && written ? 0 : 1);
  };
  const started = Date.now();
  const deadline = setTimeout(() => finish('timeout (420 s)'), 420000);
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
  // Waits (at most ms) until pred(), a test in this process, holds; returns whether it did.
  const until = async (pred, ms) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (pred()) return true;
    return pred();
  };
  // Navigation attempts of the page's main frame, as the shell sees them: main.cjs's guard (registered first) refuses
  // them on this same event. (Measured on Electron 44.5.1: for the refused attempt below "will-frame-navigate" is
  // emitted and "will-navigate" is not.)
  const attempts = [];
  contents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame) attempts.push(String(event.url));
  });

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
      report.steps.menu.framesMs = await js(`(${frameTimes.toString()})(10, 30000)`);
      // 3. Engine parity (G5): the golden parity script on the page's own flight module.
      const t = Date.now();
      const got = await js(parity.pageExpression());
      const verdict = parity.compare(got);
      report.steps.parity = { ...verdict, final: got.final, steps: got.steps, ms: Date.now() - t };
      // A new engine digest: the checkpoints too, so that it can be measured and recorded from this report alone
      // (desktop/parity.cjs CHROMIUM, docs/PUBLIER-UNE-VERSION.md).
      if (verdict.engine === 'unknown') report.steps.parity.checkpointHex = got.checkpointHex;
      if (!verdict.ok) return finish('engine parity (G5): ' + JSON.stringify(verdict));
      // 4. Local storage of the app:// origin.
      report.steps.storage = await js(
        "(() => { try { localStorage.setItem('lb-self-test', '1'); const ok = localStorage.getItem('lb-self-test') === '1';" +
          " localStorage.removeItem('lb-self-test'); return {ok, saveState: document.getElementById('saveState').textContent.includes('indisponible') ? 'unavailable' : 'ok'}; }" +
          ' catch (e) { return {ok: false, error: String(e)}; } })()',
      );
      if (!report.steps.storage.ok || report.steps.storage.saveState !== 'ok')
        return finish('local storage unavailable');
      // 5. A session: Start (emulated lock), the page's frame loop flies it until SESSION is met, then the pause through
      // the emulated unlock. The emulation is asserted once more right before the click
      // (tests/desktop/self-test-safety.test.js keeps it there).
      const still = await js(
        '(window.__LB_EMULATED_POINTER_LOCK__ === true && navigator.webdriver === true && document.pointerLockElement === null)',
      );
      if (still !== true) return finish('the page no longer emulates the pointer lock: Start was not clicked');
      await js("document.getElementById('start').click()");
      await poll('document.pointerLockElement !== null && trainerDiagnostics().running', 30000, 'the session');
      const flight = await Promise.race([
        js(`(${flyUntil.toString()})(${JSON.stringify(SESSION)})`),
        sleep(SESSION.wallMs + 30000).then(() => null),
      ]);
      report.steps.session = flight ? { want: SESSION, ...flight } : { want: SESSION, flown: false, noFrame: true };
      if (!flight) return finish('the session did not fly: no display frame answered');
      if (!flight.flown)
        return finish(
          `the session did not fly: ${flight.simulated} s simulated over ${flight.frames} frames` +
            ` (${flight.flyingFrames} advanced and drew, ${flight.drawnFrames} drew) in ${flight.wallMs} ms` +
            ` (running ${flight.running}, calls ${flight.calls}, hidden ${flight.hidden}, focus ${flight.focus})`,
        );
      await js('document.exitPointerLock()');
      await poll('!trainerDiagnostics().running', 30000, 'the pause');
      // 6. The profile export (a JSON download of the page, saved without a dialog in the throw-away profile).
      await js("document.getElementById('export').click()");
      await until(() => downloads.some((d) => d.allowed && d.state !== 'progressing'), EVIDENCE_MS);
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
        // The policy violations are reported by events: wait for both (at most ${EVIDENCE_MS} ms).
        for (const end = Date.now() + ${EVIDENCE_MS}; Date.now() < end; await new Promise((r) => setTimeout(r, 50)))
          if (violations.includes('connect-src') && violations.includes('script-src-elem')) break;
        out.violations = [...new Set(violations)].sort();
        return out;
      })()`);
      // The refused download is recorded once main.cjs has cancelled it; the navigation away is judged only once the
      // shell has seen the attempt (a check made before it would pass without testing anything), then after a moment.
      await until(() => downloads.some((d) => d.name === 'little-bird-probe.exe'), EVIDENCE_MS);
      await js(`location.href = ${JSON.stringify(PROBE_URL)}`).catch(() => {});
      const attempted = await until(() => attempts.some((url) => url === PROBE_URL), EVIDENCE_MS);
      await sleep(1500);
      report.steps.navigation = { attempted, stayed: policy.isAppUrl(contents.getURL()) };
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
        navigation: report.steps.navigation.attempted && report.steps.navigation.stayed,
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
  const report = {
    nonce: args.nonce,
    ok: false,
    failure,
    version: app.getVersion(),
    packaged: app.isPackaged,
    ...extra,
  };
  writeReport(args.nonce, report);
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

module.exports = {
  configure,
  download,
  prepare,
  run,
  fail,
  refuse,
  ROOT,
  reportPath,
  profilePath,
  writeReport,
  PROBE_URL,
  SESSION,
  flyUntil,
};
