'use strict';
// The application (src/app.js) booted in a mocked DOM with the real three.js geometry, the real scenery and a real 2D
// canvas for the HUD (@napi-rs/canvas), no browser. One boot per test file (each file is its own process): the caller
// seeds Math.random first (tests/helpers/rng.js), so every draw of the session is reproducible.
//   bootApp({ profile, manualClock, width, height }) -> { app, diag, el, callbacks, windowCallbacks, context, ... }
// callbacks: the document's event listeners by type; windowCallbacks: the window's (blur, resize, beforeunload).
// profile: the object stored under the profile key before boot (null: no stored profile); storage: raw stored strings
// by key (for corrupted stores).
// manualClock: frames are driven by the test through app.frame(now) (window.__LB_MANUAL_CLOCK__); otherwise the test
// steps the simulation with app.step(dt) and performance.now() stays 0.
// navigator: the page's navigator (none by default: no Gamepad API); a test scripts navigator.getGamepads with fake pads
// (tests/helpers/gamepads.js), never the machine's.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SRC, TEMPLATE } = require('./paths');
const { modules } = require('./runtime');
const { createCanvas } = require('./canvas');

const PROFILE_KEY = 'littlebird-range-v1';
const html = fs.readFileSync(TEMPLATE, 'utf8');
const source = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');

function bootApp({
  profile = null,
  storage = {},
  manualClock = false,
  width = 1600,
  height = 900,
  navigator = null,
} = {}) {
  const R = modules();
  const callbacks = {};
  const windowCallbacks = {};
  const elements = new Map();
  const stored = new Map(Object.entries(storage));
  if (profile) stored.set(PROFILE_KEY, JSON.stringify(profile));
  function element(id, tag = 'div', attrs = '') {
    const classes = new Set(((attrs.match(/class="([^"]*)"/) || [])[1] || '').split(' ').filter(Boolean));
    const kids = [];
    const e = {
      id,
      tagName: tag.toUpperCase(),
      type: (attrs.match(/type="([^"]*)"/) || [])[1] || '',
      min: (attrs.match(/min="([^"]*)"/) || [])[1] || '',
      max: (attrs.match(/max="([^"]*)"/) || [])[1] || '',
      step: (attrs.match(/step="([^"]*)"/) || [])[1] || '',
      value: '',
      dataset: {},
      textContent: '',
      innerHTML: '',
      hidden: false,
      disabled: false,
      style: {},
      children: kids,
      parentElement: { querySelector: () => ({ textContent: '' }) },
      classList: {
        add: (x) => classes.add(x),
        remove: (x) => classes.delete(x),
        toggle: (x, on) => ((on === undefined ? !classes.has(x) : on) ? classes.add(x) : classes.delete(x)),
        contains: (x) => classes.has(x),
      },
      addEventListener(name, fn) {
        this['on' + name] = fn;
      },
      append(...c) {
        kids.push(...c);
      },
      prepend(...c) {
        kids.unshift(...c);
      },
      get lastChild() {
        return { remove: () => kids.pop() };
      },
      replaceChildren() {
        kids.length = 0;
      },
      remove() {},
      focus() {},
      click() {
        this.onclick?.();
      },
    };
    if (tag === 'canvas') {
      const canvas = createCanvas(width, height);
      e.getContext = () => canvas.getContext('2d');
      e.canvas = canvas;
      Object.defineProperties(e, {
        width: {
          get: () => canvas.width,
          set: (n) => {
            canvas.width = n;
          },
        },
        height: {
          get: () => canvas.height,
          set: (n) => {
            canvas.height = n;
          },
        },
      });
    }
    return e;
  }
  for (const m of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g))
    elements.set(m[3], element(m[3], m[1], m[2]));
  const modeCards = ['range', 'assault', 'missiles', 'match', 'duel', 'towers', 'free'].map((mode) => ({
    ...element(''),
    dataset: { mode },
  }));
  const seg = ['air', 'ground', 'mixed'].map((scenario) => ({ ...element(''), dataset: { scenario } }));
  const document = {
    getElementById: (id) => elements.get(id),
    body: element('body'),
    pointerLockElement: null,
    addEventListener: (name, fn) => (callbacks[name] = fn),
    createElement: (tag) => (tag === 'canvas' ? createCanvas(256, 256) : element('', tag)),
    querySelector: () => element('footer'),
    querySelectorAll: (q) =>
      q === 'input[id],select[id]'
        ? [...elements.values()].filter((e) => ['INPUT', 'SELECT'].includes(e.tagName))
        : q === '[data-scenario]'
          ? seg
          : q === '[data-mode]'
            ? modeCards
            : [],
    exitPointerLock() {
      this.pointerLockElement = null;
    },
  };
  const hooks = { render: null, blob: null };
  class Renderer {
    constructor() {
      this.info = { render: { calls: 0 } };
    }
    setPixelRatio() {}
    setSize() {}
    render() {
      this.info.render.calls++;
      hooks.render?.();
    }
  }
  let app = null;
  const clock = { now: 0 };
  const context = {
    console,
    document,
    THREE: { ...R.T, WebGLRenderer: Renderer },
    HeliPhysics: R.P,
    HeliMissiles: R.M,
    HeliWorld: R.W,
    HeliAudio: R.A,
    HeliGround: R.G,
    HeliBot: R.B,
    HeliSettings: R.S,
    HeliModels: { create: R.Models.create },
    HeliForest: R.F,
    buildScenery: R.buildScenery,
    localStorage: {
      getItem: (k) => (stored.has(k) ? stored.get(k) : null),
      setItem: (k, v) => stored.set(k, String(v)),
    },
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: 1,
    performance: { now: () => clock.now },
    setTimeout() {},
    clearTimeout() {},
    requestAnimationFrame: (fn) => fn,
    addEventListener: (name, fn) => (windowCallbacks[name] = fn),
    Blob,
    URL: {
      createObjectURL: (b) => {
        hooks.blob = b;
        return 'blob:test';
      },
      revokeObjectURL() {},
    },
    Math,
    __LB_SYNC__: true,
    __LB_EXPOSE__: (x) => {
      app = x;
    },
  };
  if (manualClock) context.__LB_MANUAL_CLOCK__ = true;
  if (navigator) context.navigator = navigator;
  context.window = context;
  vm.createContext(context);
  new vm.Script(source, { filename: path.join(SRC, 'app.js') }).runInContext(context);
  if (!app) throw Error('boot failed: app.js did not expose its internals');
  const el = (id) => {
    const e = elements.get(id);
    if (!e) throw Error('no element #' + id);
    return e;
  };
  const diag = () => context.trainerDiagnostics();
  const keyDown = (code) => callbacks.keydown({ code, repeat: false, preventDefault() {} });
  const keyUp = (code) => callbacks.keyup({ code, preventDefault() {} });
  // Simulation at 120 Hz through app.step, until each() returns true (then true) or the session stops (then false).
  const run = (seconds, each) => {
    for (let i = 0; i < Math.round(seconds * 120); i++) {
      app.step(1 / 120);
      if (each && each(i / 120)) return true;
      if (!diag().running) return false;
    }
    return false;
  };
  return {
    app,
    diag,
    el,
    elements,
    callbacks,
    windowCallbacks,
    context,
    document,
    modeCards,
    seg,
    stored,
    hooks,
    clock,
    keyDown,
    keyUp,
    key: (code) => {
      keyDown(code);
      keyUp(code);
    },
    move: (mx, my) =>
      callbacks.mousemove({
        target: el('world'),
        clientX: width / 2,
        clientY: height / 2,
        movementX: mx,
        movementY: my,
      }),
    run,
    modules: R,
    width,
    height,
  };
}

// The importer's file-input event with a text file.
const fileEvent = (text) => ({
  target: { files: [{ size: Buffer.byteLength(text), text: async () => text }], value: '' },
});

module.exports = { bootApp, fileEvent, PROFILE_KEY };
