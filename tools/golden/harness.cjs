'use strict';
// Golden harness: boots the unchanged Little Bird runtime in Node the way the page does, with every source of
// nondeterminism replaced by a seeded or scripted one.
//  - Realm T: three.min.js alone, in its own vm context, whose Math.random is the seeded stream T (three r160 draws only
//    for object UUIDs). A render-side refactor that creates more or fewer three.js objects cannot shift the game's stream.
//  - Realm G: the page (window, document built from the template, the inline error script, then world, physics,
//    forest, scenery, missiles, audio, models, ground, bot and app.js as <script>s in the template's order), whose
//    Math.random is the seeded stream G and whose Date is fixed. The game modules see window.THREE = realm T's THREE
//    with WebGLRenderer replaced by a draw-free renderer.
//  - Clock: performance.now() is the harness clock (ms); frames at a fixed rate through the app's __LB_MANUAL_CLOCK__
//    hook (app.frame(now)); setTimeout callbacks run from the harness clock, in due-time then creation order, before the
//    frame at or after their due time; promise continuations run between frames.
//  - Pointer lock: emulated inside the page (#world.requestPointerLock sets document.pointerLockElement and fires
//    pointerlockchange), the same contract as app.js's automation shim. Nothing here can touch the machine's input.
//    With opts.automation the harness instead presents itself as a WebDriver-controlled browser (navigator.webdriver,
//    window.Element and window.Document on a private set of DOM classes) whose "real" lock, fullscreen and keyboard
//    lock are traps that only count calls: the app's own automation shim must take over the lock (hookapi suite).
//  - No GPU, no network, no file access from the page; canvases record their calls into hashes (dom.cjs); Web Audio
//    records its graph and schedule (webaudio.cjs).
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const dom = require('./dom.cjs'), { makeEvent, dispatch } = dom;
const { createAudioClass } = require('./webaudio.cjs');

const ORDER = ['world.js', 'physics.js', 'forest.js', 'scenery.js', 'missiles.js', 'audio.js', 'models.js', 'ground.js', 'bot.js', 'app.js'];
const FIXED_EPOCH = Date.UTC(2026, 0, 1, 12, 0, 0);   // chosen: any fixed instant (the app only dates calibration files)
const lcg = seed => { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const lf = b => Buffer.from(b.toString('latin1').replace(/\r\n?/g, '\n'), 'latin1');
const flush = () => new Promise(r => setImmediate(r));

// Runtime sources: a directory holding the ten runtime files and vendor/three.min.js, and the page template.
function loadRuntime({ src, template }) {
  const files = {}, manifest = {};
  for (const f of ['vendor/three.min.js', ...ORDER]) {
    const b = fs.readFileSync(path.join(src, f)); files[f] = b.toString('utf8');
    manifest[f] = { sha256: sha(b), sha256_lf: sha(lf(b)) };
  }
  const tb = fs.readFileSync(template), html = tb.toString('utf8');
  manifest['index.template.html'] = { sha256: sha(tb), sha256_lf: sha(lf(tb)) };
  for (const f of ORDER.concat('vendor/three.min.js')) if (!new RegExp('<script src="' + f.replace('.', '\\.') + '"></script>').test(html)) throw Error('template lacks the script tag of ' + f);
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const scripts = { three: new vm.Script(files['vendor/three.min.js'], { filename: 'three.min.js' }), game: ORDER.map(f => new vm.Script(files[f], { filename: f })),
    inline: inline.map((c, i) => new vm.Script(c, { filename: 'inline-' + i + '.js' })) };
  return { files, html, manifest, scripts, src, template };
}

function quietConsole(log) {
  const c = {}; for (const k of ['log', 'info', 'warn', 'error', 'debug', 'trace']) c[k] = (...a) => log.push({ level: k, text: a.map(x => { try { return typeof x === 'string' ? x : JSON.stringify(x); } catch (e) { return String(x); } }).join(' ').slice(0, 300) });
  return c;
}

// Realm T: three.js with its own Math.random (stream T).
// Both realms are plain global objects (vm.constants.DONT_CONTEXTIFY, Node >= 22.8): no interceptor on global lookups,
// so the valley's hot loops run at normal speed, and globalThis behaves as a browser window does.
function makeThree(rt, seedT, counters) {
  const log = [], ctx = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  ctx.console = quietConsole(log);
  vm.runInContext('var module={exports:{}};var exports=module.exports;', ctx);
  const r = lcg(seedT); vm.runInContext('Math', ctx).random = () => { counters.threeDraws++; return r(); };
  rt.scripts.three.runInContext(ctx);
  const THREE = vm.runInContext('module.exports', ctx);
  if (!THREE || THREE.REVISION !== '160') throw Error('three.js r160 expected, got ' + (THREE && THREE.REVISION));
  return { THREE, log };
}

// Draw-free renderer: counts render calls and updates world matrices as WebGLRenderer.render (r160) does first.
class GoldenRenderer {
  constructor(opts = {}) { this.info = { render: { calls: 0 } }; this.domElement = opts.canvas || null; this.autoClear = true; }
  setPixelRatio() {} setSize() {} clearDepth() {}
  render(scene, camera) {
    this.info.render.calls++;
    if (scene && scene.matrixWorldAutoUpdate !== false && scene.updateMatrixWorld) scene.updateMatrixWorld();
    if (camera && camera.parent === null && camera.matrixWorldAutoUpdate !== false && camera.updateMatrixWorld) camera.updateMatrixWorld();
  }
}

// One page load. opts: seedG, seedT, storage {key: string}, hash ('#carte=gen-12'), width, height, dpr, audio (bool),
// frameMs (10 = 100 Hz), clock0 (ms), automation (bool: see the header).
async function createPage(rt, opts = {}) {
  const o = { seedG: 20260929, seedT: 160, storage: {}, hash: '', width: 1920, height: 1080, dpr: 1, audio: true, frameMs: 10, clock0: 1000, automation: false, ...opts };
  const counters = { gameDraws: 0, threeDraws: 0, timersRun: 0, frames: 0, locks: 0, reloads: 0, alerts: 0, realLockCalls: 0, realExitCalls: 0, fullscreenCalls: 0, keyboardLockCalls: 0 };
  const D = o.automation ? dom.makeDom() : dom;
  const three = makeThree(rt, o.seedT, counters);
  const page = { opts: o, counters, clockMs: o.clock0, frameMs: o.frameMs, timers: [], timerSeq: 1, audioLog: null, audioOps: 0, consoleLog: [], windowListeners: new Map(), app: null, blobs: [], threeLog: three.log };
  page.clock = () => page.clockMs;
  const win = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  const store = new Map(Object.entries(o.storage));
  win.window = win; win.self = win; win.top = win; win.parent = win;
  win.console = quietConsole(page.consoleLog);
  win.navigator = { webdriver: !!o.automation, language: 'fr-FR', languages: ['fr-FR'], userAgent: 'littlebird-golden' };
  if (o.automation) {
    // Traps standing for the browser's real capture APIs: they only count calls (nothing reaches the machine).
    win.Element = D.Element; win.Document = D.Document;
    D.Element.prototype.requestPointerLock = function () { counters.realLockCalls++; return Promise.resolve(); };
    D.Element.prototype.requestFullscreen = function () { counters.fullscreenCalls++; return Promise.resolve(); };
    D.Document.prototype.exitPointerLock = function () { counters.realExitCalls++; };
    win.navigator.keyboard = { lock() { counters.keyboardLockCalls++; return Promise.resolve(); }, unlock() {} };
  }
  win.innerWidth = o.width; win.innerHeight = o.height; win.outerWidth = o.width; win.outerHeight = o.height; win.devicePixelRatio = o.dpr; win.screen = { width: o.width, height: o.height };
  win.performance = { now: () => page.clockMs, timeOrigin: 0 };
  win.setTimeout = (fn, ms = 0, ...args) => { const id = page.timerSeq++; page.timers.push({ id, due: page.clockMs + Math.max(0, +ms || 0), fn, args }); return id; };
  win.clearTimeout = id => { const i = page.timers.findIndex(t => t.id === id); if (i >= 0) page.timers.splice(i, 1); };
  win.setInterval = (fn, ms = 0, ...args) => { const id = page.timerSeq++; const every = Math.max(1, +ms || 0), tick = () => { page.timers.push({ id, due: page.clockMs + every, fn: () => { tick(); fn(...args); }, args: [] }); }; tick(); return id; };
  win.clearInterval = win.clearTimeout;
  win.requestAnimationFrame = () => 0; win.cancelAnimationFrame = () => {};
  win.queueMicrotask = f => queueMicrotask(f);
  win.addEventListener = (t, fn) => { if (!page.windowListeners.has(t)) page.windowListeners.set(t, []); page.windowListeners.get(t).push(fn); };
  win.removeEventListener = (t, fn) => { const l = page.windowListeners.get(t); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } };
  win.dispatchEvent = ev => { for (const fn of [...(page.windowListeners.get(ev.type) || [])]) fn(ev); return true; };
  win.localStorage = { getItem: k => store.has(String(k)) ? store.get(String(k)) : null, setItem: (k, v) => { store.set(String(k), String(v)); }, removeItem: k => { store.delete(String(k)); }, clear: () => store.clear(),
    key: i => [...store.keys()][i] ?? null, get length() { return store.size; } };
  page.storage = store;
  win.location = { hash: o.hash, protocol: 'file:', pathname: '/littlebird/index.html', search: '', get href() { return 'file:///littlebird/index.html' + this.hash; }, reload() { counters.reloads++; } };
  win.history = { replaceState(s, t, url) { if (typeof url === 'string' && url.startsWith('#')) win.location.hash = url; }, pushState() {} };
  win.Blob = Blob; win.URL = { createObjectURL: b => { page.blobs.push(b); return 'blob:golden/' + page.blobs.length; }, revokeObjectURL() {} };
  win.AudioContext = o.audio ? createAudioClass(page) : undefined;
  win.getComputedStyle = () => ({ getPropertyValue: () => '' });
  win.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
  win.alert = () => { counters.alerts++; }; win.confirm = () => { counters.alerts++; return false; };
  win.Event = function Event(type, init = {}) { return makeEvent(type, init); };
  win.THREE = { ...three.THREE, WebGLRenderer: GoldenRenderer };
  win.__LB_SYNC__ = true; win.__LB_MANUAL_CLOCK__ = true; win.__LB_EXPOSE__ = x => { page.app = x; };
  const doc = new D.Document(rt.html, win); win.document = doc; page.document = doc; page.window = win;
  const world = doc.getElementById('world');
  // In-page pointer lock (emulated; the same contract as app.js's automation shim). Under automation the page's own
  // shim must provide it: the own data property is removed so that a prototype getter can answer.
  if (o.automation) delete doc.pointerLockElement;
  else world.requestPointerLock = function () { counters.locks++; doc.pointerLockElement = this; win.setTimeout(() => dispatch(doc, makeEvent('pointerlockchange', { target: doc })), 0); return Promise.resolve(); };
  // The HUD records only when the harness gives it a sink (hudSink); textures record into their own hashes.
  { const s = doc.getElementById('hud').getContext('2d').__self; s.sink = null; s.textSink = null; }
  const rG = lcg(o.seedG); vm.runInContext('Math', win).random = () => { counters.gameDraws++; return rG(); };
  vm.runInContext(`(function(){const D=Date,T0=${FIXED_EPOCH};function FixedDate(...a){if(!new.target)return new D(T0).toString();return a.length?new D(...a):new D(T0);}
    FixedDate.prototype=D.prototype;FixedDate.now=()=>T0;FixedDate.parse=D.parse;FixedDate.UTC=D.UTC;globalThis.Date=FixedDate;})();`, win);
  for (const s of rt.scripts.inline) s.runInContext(win);
  for (const s of rt.scripts.game) s.runInContext(win);
  if (!page.app) throw Error('boot failed: __LB_EXPOSE__ not called (' + JSON.stringify(page.consoleLog.slice(-3)) + ')');
  page.diag = () => win.trainerDiagnostics();
  page.world = world;
  page.runTimers = now => {
    for (;;) {
      let best = -1; for (let i = 0; i < page.timers.length; i++) { const t = page.timers[i]; if (t.due <= now && (best < 0 || t.due < page.timers[best].due || t.due === page.timers[best].due && t.id < page.timers[best].id)) best = i; }
      if (best < 0) return; const t = page.timers.splice(best, 1)[0]; counters.timersRun++; t.fn(...t.args);
    }
  };
  page.frame = async () => { page.clockMs += page.frameMs; page.runTimers(page.clockMs); page.app.frame(page.clockMs); counters.frames++; await flush(); };
  page.advance = async ms => { const n = Math.round(ms / page.frameMs); for (let i = 0; i < n; i++) await page.frame(); };
  page.flush = flush;
  page.ev = (target, type, props = {}) => dispatch(target, makeEvent(type, { timeStamp: page.clockMs, ...props }));
  page.key = (code, down = true) => page.ev(doc, down ? 'keydown' : 'keyup', { code, key: code, repeat: false, target: doc.body });
  page.tap = async code => { page.key(code, true); await flush(); page.key(code, false); await flush(); };
  page.mouseMove = (dx, dy) => page.ev(doc, 'mousemove', { target: world, clientX: o.width / 2, clientY: o.height / 2, movementX: dx, movementY: dy });
  page.mouseButton = (button, down = true) => page.ev(doc, down ? 'mousedown' : 'mouseup', { target: world, button, clientX: o.width / 2, clientY: o.height / 2 });
  page.el = id => { const e = doc.getElementById(id); if (!e) throw Error('no element #' + id); return e; };
  page.click = async el => { (typeof el === 'string' ? page.el(el) : el).click(); await flush(); };
  page.setInput = async (id, value) => { const e = page.el(id); if (e.type === 'checkbox') e.checked = !!value; else e.value = value; page.ev(e, 'input', { target: e }); await flush(); };
  page.importProfile = async text => { page.ev(page.el('import'), 'change', { target: { files: [{ size: Buffer.byteLength(text), text: async () => text }], value: '' } }); await flush(); await flush(); };
  page.importIni = async text => { page.ev(page.el('importGame'), 'change', { target: { files: [{ size: Buffer.byteLength(text), text: async () => text }], value: '' } }); await flush(); await flush(); };
  // HUD recording: h receives the strict draw log (texts reduced to their numbers), th the texts (advisory).
  page.hudSink = (h, th = null) => { const s = doc.getElementById('hud').getContext('2d').__self; s.sink = h; s.textSink = th; };
  page.hudOps = () => doc.getElementById('hud').getContext('2d').__self.ops;
  page.toast = () => page.el('toast').textContent;
  await flush();
  return page;
}
// A page-less realm with some of the runtime scripts (module goldens): same realm rules (three.js apart with stream T,
// the scripts with stream G), window = the realm's global, no DOM. storage/hash choose the map as in a browser.
function makeModuleRealm(rt, { seedG = 1, seedT = 160, files = ORDER.filter(f => f !== 'app.js'), hash = '', storage = {} } = {}) {
  const counters = { gameDraws: 0, threeDraws: 0 };
  const three = makeThree(rt, seedT, counters), g = vm.createContext(vm.constants.DONT_CONTEXTIFY), log = [], store = new Map(Object.entries(storage));
  g.window = g; g.self = g; g.console = quietConsole(log); g.THREE = { ...three.THREE, WebGLRenderer: GoldenRenderer };
  g.location = { hash, protocol: 'file:' }; g.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  g.performance = { now: () => 0 };
  const r = lcg(seedG); vm.runInContext('Math', g).random = () => { counters.gameDraws++; return r(); };
  vm.runInContext(`(function(){const D=Date,T0=${FIXED_EPOCH};function FixedDate(...a){if(!new.target)return new D(T0).toString();return a.length?new D(...a):new D(T0);}
    FixedDate.prototype=D.prototype;FixedDate.now=()=>T0;FixedDate.parse=D.parse;FixedDate.UTC=D.UTC;globalThis.Date=FixedDate;})();`, g);
  for (const f of files) rt.scripts.game[ORDER.indexOf(f)].runInContext(g);
  return { g, THREE: three.THREE, counters, log, W: g.HeliWorld, P: g.HeliPhysics, M: g.HeliMissiles, A: g.HeliAudio, G: g.HeliGround, B: g.HeliBot, F: g.HeliForest, Models: g.HeliModels, buildScenery: g.buildScenery };
}
module.exports = { loadRuntime, createPage, makeModuleRealm, lcg, ORDER, GoldenRenderer, flush, FIXED_EPOCH };
