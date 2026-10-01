'use strict';
// Joystick goldens (phase J3 of the joystick plan): the joystick input path as the page runs it, with scripted pads
// only (harness opts.gamepads: plain objects, never a device; Node has no Gamepad API). Pad ids are the public product
// identifiers Chromium shows on Windows (vJoy's virtual device, the Thrustmaster T.16000M); every setting is a neutral
// value chosen for the goldens, none is a player's.
//  - law: the baseline B0 of physics.js joystick, every part SUPPOSED until measured in the game: its descriptor, the
//    public defaults (the game's factory values) and the bounds in clear; axisValue over a grid of raw values and
//    settings, decodeHat, and joystickMix (the fields it leaves untouched, -0 included) hashed.
//  - runs (whole sessions, checkpoints as in the sessions suite):
//    G-J2: the 'free' key-and-mouse script flown twice, HOTAS off, then HOTAS on with pitch, roll, yaw and both look
//      axes bound to a vJoy device whose axes rest inside their dead zone (its unbound axes and buttons move), its hat
//      centred, and the collective bound to a stick that is not there (the keys keep it): every checkpoint the same,
//      and with the HOTAS off not one joystick read, menu included;
//    G-J3: a session whose pitch, roll and yaw, fire, flares and view change come from keys, then from full deflections
//      and buttons of a vJoy device (collective keys and mouse in both): every checkpoint the same;
//    vjoy-b0: a vJoy device set up through the import of a (synthetic) game joystick section, flown with the stick
//      alone: the collective lever, partial deflections, a twist, look on the hat, gun, flares and view on buttons,
//      unplugged (the session pauses), plugged again, resumed with the trigger held (latched: no round until it is
//      released);
//    twins: two identical T.16000M sticks proposed from the saved slots fly nothing while the roles are only proposed,
//      the first trigger press swaps them (that press never fires), the collective on the left stick (inverted), the
//      left stick unplugged (pause) and back
//      zero-initialised: it takes its role by elimination and the lever is held until it reports.
//  - oracle: seeded joystick profile blocks (hostile values included) through the profile import button, and seeded
//    game joystick sections through the joystick import (preview, then Appliquer), hashed.
//  - automation: a WebDriver page whose browser getGamepads would hand out a stick: the app's own emulation answers,
//    the panel and a flight see only the emulated pads, and the browser API is never called.
// Recording refuses a gate that does not hold, a run that missed an event it exists for, a console error, or a real
// read under automation; a check reports them through the comparison.
const { createPage, makeModuleRealm, lcg } = require('../harness.cjs');
const { Hasher } = require('../canon.cjs');
const { Probe, checkpoint } = require('../probe.cjs');
const { GOLDEN_BASE, GOLDEN_BINDINGS, SCRIPTS, Pilot, Coverage } = require('../scenarios.cjs');
const { readDefaults } = require('./sessions.cjs');

const SEED_T = 160, EVERY = 100, STORE = 'littlebird-range-v1', ORACLE = { seed: 20261001, profiles: 1500, sections: 150 };
const VJOY_ID = 'vJoy Device (Vendor: 1234 Product: bead)', T16_ID = 'T.16000M (Vendor: 044f Product: b10a)';
// Chromium's hat values: centred above 1 (9/7), direction k = 0 (up) to 7 (up-left), clockwise, at 2k/7 - 1.
const HAT_CENTRED = 9 / 7, hatAt = k => 2 * k / 7 - 1;
const STOP = Symbol('frame budget exhausted');
const short = v => new Hasher().val(v).digest().slice(0, 16), textHash = t => new Hasher().str(String(t)).digest().slice(0, 16);
const clamp = (x, a = 1) => Math.max(-a, Math.min(a, x));

// A scripted pad. The script moves the device (set, press); the pad, what getGamepads hands out, shows that state only
// from the device's next report: zero-initialised (every axis 0, the hat too) until its first one, as Chromium shows a
// device that has not reported yet; then one report per frame (its timestamp moves) while it is plugged and reporting.
class Stick {
  constructor(index, id, { hat = null, reporting = true, buttons = 32 } = {}) {
    const released = () => ({ pressed: false, touched: false, value: 0 });
    this.pad = { index, id, mapping: '', connected: true, timestamp: 0, axes: Array(10).fill(0), buttons: Array.from({ length: buttons }, released) };
    this.next = { axes: Array(10).fill(0), buttons: Array(buttons).fill(false) }; if (hat !== null) this.next.axes[9] = hat;
    this.reporting = reporting; this.reports = 0;
  }
  set(axis, v) { this.next.axes[axis] = v; return this; }
  press(b, on = true) { this.next.buttons[b] = !!on; return this; }
  report() {
    if (!this.reporting) return; const p = this.pad;
    this.next.axes.forEach((v, i) => { p.axes[i] = v; }); this.next.buttons.forEach((on, i) => { p.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 }; });
    this.reports++; p.timestamp += 4;
  }
}

// Profile blocks (schema 1, validated by the page when it loads them).
const axis = (device, index, extra = {}) => ({ device, axis: index, invert: false, sensitivity: 1, deadZone: .05, positive: null, negative: null, ...extra });
const block = (axes, actions, extra = {}) => ({ schema: 1, useHotas: true, deviceMatch: 'role', confirmRoles: true, devices: { main: null, left: null, right: null }, axes, actions, ...extra });
const T16_MODEL = slotHint => ({ vendor: '044f', product: 'b10a', name: 'T.16000M', slotHint, hatAxis: 9 });
const PROFILES = {
  resting: block({ Pitch: axis('main', 1), Throttle: axis('left', 1), Roll: axis('main', 0), Yaw: axis('main', 5),
    LookYaw: axis('main', 3, { positive: { device: 'main', dir: 'right' }, negative: { device: 'main', dir: 'left' } }),
    LookPitch: axis('main', 4, { positive: { device: 'main', dir: 'up' }, negative: { device: 'main', dir: 'down' } }) },
  { fire: [{ device: 'main', button: 0 }], flares: [{ device: 'main', button: 1 }], view: [{ device: 'main', button: 2 }], freeLook: [{ device: 'main', button: 3 }] }),
  deflect: block({ Pitch: axis('main', 1), Throttle: axis(null, 2), Roll: axis('main', 0), Yaw: axis('main', 5), LookYaw: axis(null, -1), LookPitch: axis(null, -1) },
    { fire: [{ device: 'main', button: 0 }], flares: [{ device: 'main', button: 1 }], view: [{ device: 'main', button: 2 }] }),
  twins: block({ Pitch: axis('right', 1), Throttle: axis('left', 1, { invert: true }), Roll: axis('right', 0), Yaw: axis('right', 5, { deadZone: .08 }), LookYaw: axis(null, -1), LookPitch: axis(null, -1) },
    { fire: [{ device: 'right', button: 0 }, { device: 'left', button: 0 }], flares: [{ device: 'left', button: 2 }] },
    { devices: { main: null, left: T16_MODEL(0), right: T16_MODEL(1) } })
};
// A game joystick section in the layout of the game's settings file (synthetic: neutral values; the unnamed fields have
// placeholder names, as the importer reads them by position).
function gameSection({ hotas = true, device = '1234:BEAD:vJoy Device', axes = {}, actions = [] } = {}) {
  const none = '(DeviceIdentifier="",_b=-1,_c=-1,_d=Up)', src = s => s ? `(DeviceIdentifier="${s.device || device}",_b=${s.button ?? -1},_c=${s.hat ?? -1},_d=${s.dir || 'Up'})` : none;
  const lines = ['[/Script/Engine.GameUserSettings]', 'bUseVSync=False', '[/Script/WDGame.WDUserSettings]', `bUseHOTASHelicopters=${hotas ? 'True' : 'False'}`, 'bCollectiveSelfCentering=False', '[/Script/WDJoystick.WDJoystickSettings]'];
  for (const [name, a] of Object.entries(axes))
    lines.push(`${name}=(DeviceIdentifier="${a.device ?? device}",_a=${a.axis ?? -1},bInvert=${a.invert ? 'True' : 'False'},_e=False,Positive=${src(a.positive)},Negative=${src(a.negative)},_g=1.000000,_h=False,Sensitivity=${(a.sensitivity ?? 1).toFixed(6)},DeadZone=${(a.deadZone ?? .05).toFixed(6)})`);
  for (const [action, button] of actions) lines.push(`ActionBindings=(Action=${action},Binding=(DeviceIdentifier="${device}",_b=${button}))`);
  return lines.join('\r\n') + '\r\n';
}
const VJOY_SECTION = gameSection({ axes: {
  Pitch: { axis: 1, sensitivity: .8, deadZone: .1 }, Throttle: { axis: 2 }, Roll: { axis: 0, sensitivity: .6 }, Yaw: { axis: 5, invert: true, sensitivity: .4, deadZone: .02 },
  LookYaw: { device: '', positive: { hat: 0, dir: 'Right' }, negative: { hat: 0, dir: 'Left' } }, LookPitch: { device: '', positive: { hat: 0, dir: 'Up' }, negative: { hat: 0, dir: 'Down' } } },
actions: [['Fire', 3], ['Flares', 4], ['ToggleCameraMode', 5], ['Horn', 6]] });

// ---- B0 law (module realm: physics.js alone) ----
function law(rt) {
  const realm = makeModuleRealm(rt, { files: ['world.js', 'physics.js'] }), J = realm.P.joystick;
  const raws = []; for (let k = -72; k <= 72; k++) raws.push(k / 64);
  raws.push(.05, .0500001, -.05, .1, .55, 1.05, -1.05, 1.0500001, HAT_CENTRED, 23 / 7, -0, NaN, Infinity, -Infinity, '0.5', null, undefined, true);
  const settings = []; for (const invert of [false, true]) for (const deadZone of [0, .02, .05, .1, .5, .95, 1, -1, NaN]) for (const sensitivity of [.1, .4, .8, 1, 1.55, 3, 0, -1]) settings.push({ invert, deadZone, sensitivity });
  const a = new Hasher(); for (const b of settings) { a.val(b); for (const r of raws) a.num(J.axisValue(r, b)); }
  const hats = [0, HAT_CENTRED, 23 / 7, 1.06, -1.06, NaN, -0, '1']; for (let k = 0; k < 8; k++) hats.push(hatAt(k), hatAt(k) + .04, hatAt(k) - .06);
  const h = new Hasher(); for (const v of hats) h.val(J.decodeHat(v));
  // joystickMix: seeded inputs and commands, the input object as it comes out (a field absent stays absent).
  const r = lcg(ORACLE.seed), pick = list => list[Math.floor(r() * list.length)], vals = [-1, -.5, -0, 0, .25, 1], m = new Hasher();
  for (let i = 0; i < 2000; i++) {
    const input = { pitch: pick(vals), yaw: pick(vals), roll: pick(vals), collective: pick([-1, 0, 1]) }, cmd = { pitch: pick(vals), roll: pick(vals), yaw: pick(vals), collective: pick([0, -0, .5, -1]), lever: pick([undefined, null, -1, .3]) };
    if (r() < .3) input.mousePitchRate = pick(vals);
    const fuelOut = r() < .1; m.val([input, cmd, fuelOut]); m.val(J.joystickMix(input, cmd, fuelOut)); m.val(Object.keys(input));
  }
  const D = J.defaultProfile(), half = J.axisValue(.5, D.axes.Pitch);
  return { descriptor: J.LAW, defaults: D, bounds: J.BOUNDS, axes: J.AXES, actions: J.ACTIONS, gameActions: J.GAME_ACTIONS, vjoy: J.VJOY,
    grid: { raws: raws.length, settings: settings.length, axisValue: a.digest(), decodeHat: h.digest(), joystickMix: m.digest() },
    examples: { halfDeflection: half, halfDeflectionNote: '(0.5 - 0.05) / 0.95 with the default dead zone' } };
}

// ---- Whole sessions with scripted pads (the sessions suite's checkpoints and coverage) ----
async function fly(rt, spec, { settings, bindings, joystick, frames, schema = null }) {
  const sticks = spec.sticks(), pads = sticks.map(s => s.pad);
  const doc = { version: 1, tuningRevision: 16, settings, bindings }; if (joystick) doc.joystick = joystick;
  const page = await createPage(rt, { seedG: spec.seedG, seedT: SEED_T, storage: { [STORE]: JSON.stringify(doc) }, hash: '#carte=' + spec.map, gamepads: pads });
  page.audioLog = new Hasher();
  const probe = new Probe(page, { schema }), cov = new Coverage(page), checkpoints = [], samples = [], ev = {};
  // ev: the run's events (strict); texts: the notices it showed, hashed together into ev.textHex (wording class).
  const ctx = { page, sticks, pads, ev, texts: [], frame: 0, menuFrames: 0,
    plug(s) { if (!pads.includes(s.pad)) pads.push(s.pad); }, unplug(s) { const i = pads.indexOf(s.pad); if (i >= 0) pads.splice(i, 1); },
    stored() { const d = JSON.parse(page.storage.get(STORE) || 'null'); return d && Object.hasOwn(d, 'joystick') ? d.joystick : null; } };
  let scripted = 0, inScript = false;
  const report = () => { if (spec.each) spec.each(ctx); for (const s of sticks) if (pads.includes(s.pad)) s.report(); };
  // Menu frames (before Start): the pads report, nothing is recorded.
  ctx.menu = async n => { for (let i = 0; i < n; i++) { ctx.menuFrames++; report(); await page.frame(); } };
  const tick = async () => {
    if (ctx.frame >= frames) return false;
    ctx.frame++; if (inScript) scripted++; report();
    const rec = ctx.frame % EVERY === 0; let hud = null, hudText = null;
    if (rec) { hud = new Hasher(); hudText = new Hasher(); page.hudSink(hud, hudText); }
    await page.frame();
    if (rec) { page.hudSink(null); checkpoints.push(checkpoint(ctx.frame, probe.groups(hud.digest(), hudText.digest()))); samples.push({ t: ctx.frame, running: page.app.running, alive: page.app.heliAlive, ...probe.sample() }); }
    cov.update(); return true;
  };
  const pl = new Pilot(page, async () => { if (!(await tick())) throw STOP; });
  if (spec.menuScript) await spec.menuScript(pl, ctx);
  const readsBeforeStart = page.counters.gamepadReads;
  await page.click('start');
  if (!page.app.running) throw Error(spec.id + ': session did not start');
  inScript = true;
  try { await spec.script(pl, ctx); } catch (e) { if (e !== STOP) throw e; }
  inScript = false;
  while (ctx.frame < frames) await tick();
  const errors = page.consoleLog.filter(x => x.level === 'error');
  if (errors.length) throw Error(spec.id + ': console errors ' + JSON.stringify(errors.slice(0, 3)));
  if (ctx.texts.length) ev.textHex = textHash(ctx.texts.join('\n'));
  const c = cov.c, coverage = { scriptedFrames: scripted, shots: c.shots, hits: c.hits, viewChanges: c.viewChanges, freeLookFrames: c.freeLookFrames, flightDistance: c.flightDistance, maxSpeedKmh: c.maxSpeedKmh, flaresUsed: c.flaresUsed,
    deaths: c.deaths, hudOps: c.hudOps, audioOps: c.audioOps, gameDraws: c.gameDraws, timersRun: c.timersRun };
  return { checkpoints, samples, coverage, events: ev, reads: { beforeStart: readsBeforeStart, total: page.counters.gamepadReads }, menuFrames: ctx.menuFrames, schema: probe.schemaJSON(), framesRun: ctx.frame };
}
// Two runs that must be the same at every checkpoint (strict groups and every group's digest), coverage included.
function sameRuns(a, b) {
  const diff = [];
  if (a.checkpoints.length !== b.checkpoints.length) diff.push({ checkpoints: [a.checkpoints.length, b.checkpoints.length] });
  a.checkpoints.forEach((c, i) => { const d = b.checkpoints[i]; if (!d || c.all !== d.all || JSON.stringify(c.groups) !== JSON.stringify(d.groups)) diff.push({ checkpoint: i, frame: c.t, groups: d ? Object.keys(c.groups).filter(k => c.groups[k] !== d.groups[k]) : null }); });
  if (JSON.stringify(a.samples) !== JSON.stringify(b.samples)) diff.push({ samples: true });
  if (JSON.stringify(a.coverage) !== JSON.stringify(b.coverage)) diff.push({ coverage: [a.coverage, b.coverage] });
  return diff.slice(0, 5);
}

// Key controls or stick controls for the same script (G-J3): pitch, roll and yaw at full deflection, fire, flares and view
// on buttons; everything else (collective, mouse) stays on the keys.
const STICK_OF = { pitchUp: [1, 1], pitchDown: [1, -1], rollLeft: [0, -1], rollRight: [0, 1], yawLeft: [5, -1], yawRight: [5, 1] };
const BUTTON_OF = { fire: 0, flares: 1, view: 2 };
function controls(pl, stick) {
  const on = new Set(), key = (code, down) => code.startsWith('Mouse') ? pl.page.mouseButton(+code.slice(5), down) : pl.page.key(code, down);
  return { set(action, want) {
    if (!!want === on.has(action)) return; if (want) on.add(action); else on.delete(action);
    if (!stick || !(action in STICK_OF || action in BUTTON_OF)) return key(GOLDEN_BINDINGS[action], !!want);
    if (action in BUTTON_OF) return stick.press(BUTTON_OF[action], !!want);
    const [ax] = STICK_OF[action]; let v = 0; for (const [a, [x, sign]] of Object.entries(STICK_OF)) if (x === ax && on.has(a)) v += sign; stick.set(ax, v);
  } };
}
const headingError = (pl, target) => { const f = pl.app.flight, a = f.attitude(), p = f.position, brg = Math.atan2(target.x - p.x, -(target.z - p.z)) * 180 / Math.PI; let e = brg - a.heading; e = ((e + 540) % 360) - 180; return e; };
const heightAbove = pl => { const f = pl.app.flight, p = f.position, v = f.velocity; return p.y - Math.max(pl.terrain(p.x, p.z), pl.terrain(p.x + v.x * 3, p.z + v.z * 3), pl.terrain(p.x + v.x * 6, p.z + v.z * 6)); };
// G-J3 script: take-off on the collective key, then bang-bang pitch and roll toward a cruise attitude and waypoints, yaw
// pulses, bursts, flares, two view changes, mouse sweeps.
async function deflect(pl, ctl, frames) {
  const W = pl.W, at = z => pl.V(W.valleyX(z), 0, z); let i = 0;
  ctl.set('collectiveUp', true); await pl.frames(250); ctl.set('collectiveUp', false);
  await pl.frames(frames, () => {
    if (!pl.app.running) return; i++;
    const f = pl.app.flight, a = f.attitude(), v = f.velocity, h = heightAbove(pl);
    ctl.set('collectiveUp', h < 60 || v.y < -6); ctl.set('collectiveDown', h > 110 && v.y > -3);
    const dp = h < 25 ? 6 : -8; ctl.set('pitchDown', a.pitch > dp + 3); ctl.set('pitchUp', a.pitch < dp - 3);
    const bank = clamp(headingError(pl, at(i < 1400 ? -1500 : 300)) * .8, 25); ctl.set('rollRight', a.bank < bank - 6); ctl.set('rollLeft', a.bank > bank + 6);
    const ph = i % 400; ctl.set('yawLeft', ph >= 100 && ph < 140); ctl.set('yawRight', ph >= 300 && ph < 330);
    ctl.set('fire', i % 600 >= 200 && i % 600 < 320); ctl.set('flares', i >= 900 && i < 905); ctl.set('view', i >= 1200 && i < 1203 || i >= 2000 && i < 2003);
    pl.page.mouseMove(Math.round(3 * Math.sin(i / 37)), Math.round(2 * Math.cos(i / 53)));
  });
}
// Stick pilot (vjoy-b0, twins): raw axis values from small controllers (a lever ramp off the pad, then a height and climb
// rate hold; pitch toward a target attitude in turn; bank toward waypoints; twist pulses): partial deflections across
// the dead zones. lever(raw) / pitch / roll / yaw: (stick, axis, sign) of each control.
function stickPilot(pl, map) {
  const W = pl.W, at = z => pl.V(W.valleyX(z), 0, z); let i = 0;
  return () => {
    if (!pl.app.running) return false; i++;
    const f = pl.app.flight, a = f.attitude(), v = f.velocity, h = heightAbove(pl);
    const lever = i < 200 ? -1 + i * .0075 : clamp(-.2 + .012 * (60 - h) - .05 * v.y);
    const tp = [-6, -12, 0][Math.floor(i / 800) % 3], bank = clamp(headingError(pl, at(i % 2400 < 1200 ? -1500 : 300)) * .8, 25), ph = i % 500;
    const out = { lever, pitch: clamp((tp - a.pitch) * .08), roll: clamp((bank - a.bank) * .04), yaw: ph >= 100 && ph < 150 ? .5 : ph >= 300 && ph < 350 ? -.5 : 0 };
    for (const [k, [stick, ax, sign]] of Object.entries(map)) stick.set(ax, out[k] * sign);
    return i;
  };
}

// G-J2 resting pad: the bound axes inside their dead zone (seeded noise below 0.04), the unbound ones swept over their
// whole travel, an unbound button toggled, the hat centred.
function restingEach(r) { return ctx => { const s = ctx.sticks[0]; for (const k of [0, 1, 3, 4, 5]) s.set(k, (r() - .5) * .08); s.set(2, (ctx.frame % 200) / 100 - 1); s.set(6, 1 - (ctx.frame % 300) / 150); s.press(7, ctx.frame % 100 < 50); }; }
const RUNS = {
  'G-J2': { gate: 'resting sticks with the HOTAS on fly as the keys and mouse with the HOTAS off', seedG: 141, map: 'vallee', frames: 4000, settings: { scenario: 'free', graphics: 'low' },
    pair: [{ name: 'keys', joystick: null }, { name: 'resting', joystick: PROFILES.resting }],
    spec: () => ({ sticks: () => [new Stick(0, VJOY_ID, { hat: HAT_CENTRED })], each: restingEach(lcg(141)), menuScript: (pl, ctx) => ctx.menu(30), script: pl => SCRIPTS.free(pl) }) },
  'G-J3': { gate: 'full stick deflections and stick buttons fly as the keys', seedG: 142, map: 'vallee', frames: 3000, settings: { scenario: 'free', graphics: 'low' },
    pair: [{ name: 'keys', joystick: null }, { name: 'stick', joystick: PROFILES.deflect }],
    spec: name => ({ sticks: () => [new Stick(0, VJOY_ID, { hat: HAT_CENTRED })], script: (pl, ctx) => deflect(pl, controls(pl, name === 'stick' ? ctx.sticks[0] : null), 3000) }) },
  'vjoy-b0': { seedG: 143, map: 'vallee', frames: 3600, settings: { scenario: 'free', graphics: 'low' }, joystick: null,
    required: ['imported', 'shots', 'flaresUsed', 'viewChanges', 'lookFrames', 'leverFrames', 'pausedOnUnplug', 'shotsAfterRelease', 'flightDistance'], spec: () => VJOY_B0 },
  twins: { seedG: 144, map: 'vallee', frames: 2400, settings: { scenario: 'free', graphics: 'low' }, joystick: PROFILES.twins,
    required: ['proposedFrames', 'swapped', 'pausedOnUnplug', 'leverHeldFrames', 'leverFollowsFrames', 'shots', 'flightDistance'], spec: () => TWINS }
};

// vjoy-b0: the import of the game section in the menu, then the stick alone.
const VJOY_B0 = {
  sticks: () => [new Stick(0, VJOY_ID, { hat: HAT_CENTRED })],
  async menuScript(pl, ctx) {
    const page = ctx.page, s = ctx.sticks[0]; s.set(2, -1);
    page.ev(page.el('importJoystick'), 'change', { target: { files: [{ size: Buffer.byteLength(VJOY_SECTION), text: async () => VJOY_SECTION }], value: '' } }); await page.flush(); await page.flush();
    const box = page.el('joyPreview'); if (box.hidden) throw Error('vjoy-b0: no preview of the game section (' + page.toast() + ')');
    ctx.ev.previewLines = box.children.length; ctx.texts.push(box.textContent);
    await page.click(box.children[box.children.length - 1].children[0]);   // Appliquer
    const j = ctx.stored(); ctx.ev.imported = j && j.useHotas && box.hidden ? 1 : 0; ctx.ev.importedProfile = short(j); ctx.texts.push(page.toast());
    await ctx.menu(20);
  },
  async script(pl, ctx) {
    const s = ctx.sticks[0], ev = ctx.ev, app = () => pl.app, shots = () => app().stats.shots, J = pl.page.window.HeliPhysics.joystick;
    const pilot = stickPilot(pl, { lever: [s, 2, 1], pitch: [s, 1, 1], roll: [s, 0, 1], yaw: [s, 5, -1] });
    // The lever follows the collective axis (law L): after each frame, the collective is the processed value of the raw
    // value that frame read.
    const LEVER = { invert: false, sensitivity: 1, deadZone: .05 }; let read = null;
    ev.lookFrames = 0; ev.leverFrames = 0;
    await pl.frames(2500, () => {
      if (read !== null && app().running && app().flight.collective === J.axisValue(read, LEVER)) ev.leverFrames++;
      const i = pilot(); if (!i) return; read = s.next.axes[2];
      s.set(9, i >= 1000 && i < 1100 ? hatAt(2) : i >= 1200 && i < 1300 ? hatAt(0) : HAT_CENTRED);
      s.press(3, i >= 800 && i < 950 || i >= 1600 && i < 1700); s.press(4, i >= 1400 && i < 1405); s.press(5, i >= 1800 && i < 1803 || i >= 2200 && i < 2203);
      if (app().freeLook.yaw !== 0 && i > 1000) ev.lookFrames++;
    });
    // Unplugged in flight: the session pauses.
    ctx.unplug(s); await pl.frames(5, () => { if (!app().running) { ev.pausedOnUnplug = 1; return false; } });
    ctx.texts.push(pl.page.toast());
    await pl.frames(60);
    // Plugged again; resumed with the trigger held: no round until it is released, then a burst.
    ctx.plug(s); s.press(3, true); await pl.page.click('pauseResume'); ev.resumed = app().running ? 1 : 0;
    const before = shots(); await pl.frames(70, pilot); ev.shotsWhileLatched = shots() - before;
    s.press(3, false); await pl.frames(30, pilot); const released = shots(); s.press(3, true); await pl.frames(100, pilot); ev.shotsAfterRelease = shots() - released; s.press(3, false);
    await pl.frames(10000, pilot);
  }
};
// twins: two identical sticks; the saved slots propose left = 0, right = 1; the stick in slot 1 is the left one.
const TWINS = {
  sticks: () => [new Stick(0, T16_ID, { hat: HAT_CENTRED, reporting: false }), new Stick(1, T16_ID, { hat: HAT_CENTRED, reporting: false })],
  async script(pl, ctx) {
    const [A, B] = ctx.sticks, ev = ctx.ev, app = () => pl.app, shots = () => app().stats.shots;
    await pl.frames(4); B.reporting = true; await pl.frames(2); A.reporting = true;
    // Both sticks report while the roles are only proposed (left = slot 0, right = slot 1): fully deflected, they fly
    // nothing until the confirming press (the slot-0 stick's Y, inverted, would put the lever at the top; the slot-1
    // stick's X and Y would roll and pitch).
    A.set(1, -1); B.set(0, 1).set(1, -1); const c0 = app().flight.collective; ev.proposedFrames = 0; ev.flewWhileProposed = 0;
    await pl.frames(30, () => { ev.proposedFrames++; if (app().flight.collective !== c0) ev.flewWhileProposed++; });
    if (app().flight.collective !== c0) ev.flewWhileProposed++;
    A.set(1, 0); B.set(0, 0);
    ctx.texts.push(pl.page.toast());
    // The first trigger press (the left stick, slot 1): the roles swap, and that press never fires while it is held. The
    // left stick's Y axis goes to its aft stop with it (collective lever down: the axis is inverted).
    B.press(0, true).set(1, 1); await pl.frames(60); ev.shotsWhileConfirming = shots(); B.press(0, false); await pl.frames(2);
    const j = ctx.stored(); ev.swapped = j && j.devices.left.slotHint === 1 && j.devices.right.slotHint === 0 ? 1 : 0; ctx.texts.push(pl.page.toast());
    let B2 = B, held = null; ev.leverHeldFrames = 0; ev.leverFollowsFrames = 0;
    const lever = { stick: B, ax: 1 }, pilot = stickPilot(pl, { lever: [{ set: (ax, v) => lever.stick.set(lever.ax, v) }, 1, -1], pitch: [A, 1, 1], roll: [A, 0, 1], yaw: [A, 5, -1] });
    await pl.frames(1100, () => { const i = pilot(); if (i) A.press(0, i >= 600 && i < 700); });
    // The left stick is unplugged (pause), then comes back zero-initialised: it takes the free role by elimination, and
    // the lever stays where it was until that stick reports.
    ctx.unplug(B); await pl.frames(5, () => { if (!app().running) { ev.pausedOnUnplug = 1; return false; } });
    ctx.texts.push(pl.page.toast());
    await pl.frames(50); B2 = new Stick(1, T16_ID, { hat: HAT_CENTRED, reporting: false }); ctx.sticks.push(B2); ctx.plug(B2); lever.stick = B2;
    await pl.frames(10); await pl.page.click('pauseResume'); held = app().flight.collective;
    await pl.frames(60, () => { pilot(); if (app().flight.collective === held) ev.leverHeldFrames++; });
    B2.reporting = true;
    await pl.frames(10000, () => { const i = pilot(); if (!i) return; A.press(0, i >= 1300 && i < 1400); if (app().flight.collective !== held) ev.leverFollowsFrames++; });
  }
};

async function runs(rt, { golden, defaults, log }) {
  const out = {};
  for (const [id, R] of Object.entries(RUNS)) {
    const g = golden && golden.runs[id]; if (golden && !g) continue;
    const settings = g ? g.meta.settings : { ...defaults.settings, ...GOLDEN_BASE, ...R.settings }, bindings = g ? g.meta.bindings : defaults.bindings, frames = g ? g.meta.frames : R.frames, schema = g ? g.meta.probeSchema : null;
    if (R.pair) {
      const done = [];
      for (const p of R.pair) { const joystick = g ? g.meta.joysticks[p.name] : p.joystick; done.push({ p, joystick, r: await fly(rt, { id: id + '/' + p.name, seedG: R.seedG, map: R.map, ...R.spec(p.name) }, { settings, bindings, joystick, frames, schema }) }); }
      const [a, b] = done, diff = sameRuns(a.r, b.r);
      const gate = { holds: diff.length === 0, runs: R.pair.map(p => p.name), differences: diff, reads: Object.fromEntries(done.map(d => [d.p.name, d.r.reads])) };
      if (!golden && !gate.holds) throw Error(`${id}: the gate does not hold (${R.gate}): ${JSON.stringify(diff)}`);
      if (!golden && (a.r.reads.total !== 0 || b.r.reads.beforeStart !== 0 || !(b.r.reads.total > 0))) throw Error(`${id}: joystick reads ${JSON.stringify(gate.reads)}`);
      log(id, gate.holds ? 'holds' : 'DOES NOT HOLD', JSON.stringify(gate.reads));
      out[id] = { meta: { gate: R.gate, seedG: R.seedG, seedT: SEED_T, map: R.map, frames: a.r.framesRun, frameMs: 10, checkpointEvery: EVERY, settings, bindings, joysticks: Object.fromEntries(done.map(d => [d.p.name, d.joystick])), probeSchema: g ? g.meta.probeSchema : a.r.schema },
        gate, coverage: a.r.coverage, checkpoints: a.r.checkpoints, samples: a.r.samples };
      continue;
    }
    const joystick = g ? g.meta.joystick : R.joystick, r = await fly(rt, { id, seedG: R.seedG, map: R.map, ...R.spec() }, { settings, bindings, joystick, frames, schema });
    const missing = R.required.filter(k => !((r.events[k] ?? r.coverage[k]) > 0)); if (r.events.shotsWhileLatched || r.events.shotsWhileConfirming) missing.push('a latched or consumed press fired');
    if (r.events.flewWhileProposed) missing.push('a stick flew before its role was confirmed');
    if (!golden && missing.length) throw Error(`${id}: ${missing.join(', ')} (${JSON.stringify({ ...r.events, ...r.coverage })})`);
    log(id, JSON.stringify(r.events));
    out[id] = { meta: { seedG: R.seedG, seedT: SEED_T, map: R.map, frames: r.framesRun, menuFrames: r.menuFrames, frameMs: 10, checkpointEvery: EVERY, settings, bindings, joystick, required: R.required, probeSchema: g ? g.meta.probeSchema : r.schema },
      events: r.events, reads: r.reads, coverage: r.coverage, checkpoints: r.checkpoints, samples: r.samples };
  }
  return out;
}

// ---- Oracle: seeded profile blocks through the profile import, seeded game sections through the joystick import ----
function joyBlock(r) {
  const pick = a => a[Math.floor(r() * a.length)], x = r();
  if (x < .03) return pick([null, [], 'joystick', 1, true]);
  const src = () => pick([null, { device: pick(['main', 'left', 'right', 'x', null]), button: pick([0, 3, 31, 127, 128, -1, 2.5, '4']) }, { device: pick(['main', 'left', 'right']), dir: pick(['up', 'right', 'down', 'left', 'upLeft', 'x', '__proto__']) }, 'main', []]);
  const model = () => pick([null, { vendor: '1234', product: 'bead', name: 'vJoy Device', slotHint: pick([0, 3, 7, 8, -1, 1.5]), hatAxis: pick([9, -1, 15, 16]) }, { vendor: '044f', product: 'b10a', name: 'T.16000M' + 'x'.repeat(pick([0, 80])) }, { vendor: '044F', product: 'b10a' }, { vendor: 'zz', product: '1' }, 'main', []]);
  const b = { schema: pick([1, 1, 1, 1, 1, 2, '1', undefined]), useHotas: pick([true, false, 'true', 1]), deviceMatch: pick(['role', 'first', 'any', 'ROLE', 'x', null]), confirmRoles: pick([true, false, 0]), devices: { main: model(), left: model(), right: model() }, axes: {}, actions: {} };
  if (r() < .1) b.devices = pick([null, 'x', []]);
  for (const n of ['Pitch', 'Throttle', 'Roll', 'Yaw', 'LookYaw', 'LookPitch', 'Other']) if (r() < .8) b.axes[n] = r() < .05 ? pick([null, 'x', [1]]) : { device: pick(['main', 'left', 'right', 'x', null]), axis: pick([-1, 0, 1, 2, 5, 9, 15, 16, -2, 1.5, '3']), invert: pick([true, false, 'yes']),
    sensitivity: pick([.1, .5, 1, 2.2, 3, 0, -1, 1e308, -0, null, '1', 3.5]), deadZone: pick([0, .05, .2, .95, 1, -0.1, null, '0.1']), positive: src(), negative: src() };
  for (const a of ['fire', 'flares', 'view', 'freeLook', 'reset', 'pitchUp', 'collectiveUp', 'horn', 'PROTO']) if (r() < .5) b.actions[a] = r() < .1 ? pick([null, 'x', {}]) : Array.from({ length: pick([0, 1, 2, 3]) }, src);
  if (r() < .1) b.unknownKey = 1;
  return b;
}
function sectionText(r) {
  const pick = a => a[Math.floor(r() * a.length)], dev = () => pick(['1234:BEAD:vJoy Device', '044F:B10A:T.16000M', '044F:B10B:T.16000M', '', '06A3:0763:Pedals', 'zz:yy:bad', '1234:BEAD:' + 'n'.repeat(70)]);
  const src = () => `(DeviceIdentifier="${dev()}",_b=${pick([-1, 0, 4, 200])},_c=${pick([-1, 0, 1])},_d=${pick(['Up', 'Right', 'Down', 'Left', 'None'])})`;
  const lines = [];
  if (r() < .9) lines.push('[/Script/WDGame.WDUserSettings]', `bUseHOTASHelicopters=${pick(['True', 'False', 'Yes'])}`, `bCollectiveSelfCentering=${pick(['True', 'False'])}`);
  if (r() < .95) lines.push('[/Script/WDJoystick.WDJoystickSettings]');
  for (const n of ['Pitch', 'Throttle', 'Roll', 'Yaw', 'LookYaw', 'LookPitch']) if (r() < .85) {
    const body = `DeviceIdentifier="${dev()}",_a=${pick([-1, 0, 1, 2, 5, 6, 9, 16, 'x'])},bInvert=${pick(['True', 'False', '1'])},_e=False,Positive=${src()},Negative=${src()},_g=1.000000,Sensitivity=${pick(['0.500000', '1.000000', '2.500000', '9.0', '-1', 'abc'])},DeadZone=${pick(['0.050000', '0.200000', '0.990000', '-0.5'])}`;
    lines.push(n + '=' + pick([`(${body})`, `(${body}`, `((((((((${body}))))))))`, `(${body},_x="${'s'.repeat(pick([10, 250]))}")`]));
  }
  for (let k = pick([0, 1, 3, 6]); k > 0; k--) lines.push(`ActionBindings=(Action=${pick(['Fire', 'Flares', 'ToggleCameraMode', 'Horn', 'FreeLookReset', '__proto__'])},Binding=(DeviceIdentifier="${dev()}",_b=${pick([0, 3, 17, 127, 128, -1])}))`);
  if (r() < .05) lines.push('Pitch=(' + 'x'.repeat(20001) + ')');
  if (r() < .1) lines.push('[/Script/Engine.InputSettings]', 'Pitch=(DeviceIdentifier="1234:BEAD:vJoy Device",_a=9,Sensitivity=3.000000)');
  return lines.join(r() < .5 ? '\r\n' : '\n');
}
async function oracle(rt) {
  const page = await createPage(rt, { audio: false }), r = lcg(ORACLE.seed);
  const stored = () => { const d = JSON.parse(page.storage.get(STORE) || 'null'); return d && Object.hasOwn(d, 'joystick') ? d.joystick : '#none'; };
  const profiles = [], profileToasts = [], sections = [], sectionTexts = [], stats = { stored: 0, defaults: 0, previews: 0, applied: 0, refused: 0 };
  for (let i = 0; i < ORACLE.profiles; i++) {
    await page.click('defaults');
    const text = JSON.stringify({ version: 1, tuningRevision: 16, settings: {}, bindings: {}, joystick: joyBlock(r) }).replace(/"PROTO"/g, '"__proto__"').replace(/"Other"/g, '"constructor"');
    await page.importProfile(text);
    const j = stored(); profiles.push(short(j)); profileToasts.push(textHash(page.toast())); stats[j === '#none' ? 'defaults' : 'stored']++;
  }
  for (let i = 0; i < ORACLE.sections; i++) {
    await page.click('defaults');
    const text = sectionText(r), box = page.el('joyPreview');
    page.ev(page.el('importJoystick'), 'change', { target: { files: [{ size: Buffer.byteLength(text), text: async () => text }], value: '' } }); await page.flush(); await page.flush();
    let preview = '-', lines = 0;
    if (!box.hidden) { stats.previews++; preview = textHash(box.textContent); lines = box.children.length; await page.click(box.children[box.children.length - 1].children[0]); if (box.hidden) stats.applied++; else { stats.refused++; await page.click(box.children[box.children.length - 1].children[1]); } }
    sections.push(short([lines, stored()])); sectionTexts.push(textHash(preview + '|' + page.toast()));
  }
  return { stats, profilesHex: profiles.join(''), sectionsHex: sections.join(''), toastHex: textHash(profileToasts.join('') + sectionTexts.join('')) };
}

// ---- Automation: the app's emulation answers; the browser's getGamepads (which would hand out a stick) is never called ----
async function automation(rt, recording) {
  const machine = new Stick(0, T16_ID, { hat: HAT_CENTRED }); machine.report();
  const page = await createPage(rt, { audio: false, automation: true, gamepads: [machine.pad] }), w = page.window, d = Object.getOwnPropertyDescriptor(w.navigator, 'getGamepads');
  const r = { emulated: !!d && d.writable === false && typeof d.value === 'function', emulatedList: Array.isArray(w.__LB_EMULATED_GAMEPADS__) };
  await page.click('joyRead'); await page.advance(60);
  r.padsListedBefore = page.el('joyDevices').children.length;
  // Without the emulation (a broken shim) there is no list to put the pad into: the run goes on, and its reads show it.
  const vj = new Stick(0, VJOY_ID, { hat: HAT_CENTRED }); if (r.emulatedList) w.__LB_EMULATED_GAMEPADS__.push(vj.pad);
  for (let i = 0; i < 60; i++) { vj.report(); await page.frame(); }
  r.padsListed = page.el('joyDevices').children.length; r.listedIsVjoy = /vJoy Device/.test(page.el('joyDevices').textContent);
  await page.click('joyRead');
  await page.setInput('joyUseHotas', true); await page.setInput('joyPitchDevice', 'main');
  await page.click('start'); r.running = page.app.running;
  const f = page.app.flight; f.position.set(0, 400, -300); f.velocity.set(0, 0, 0); f.onGround = false;
  vj.set(1, 1); for (let i = 0; i < 40; i++) { vj.report(); await page.frame(); }
  r.emulatedStickPitches = f.angular.x > .2;
  r.realGamepadReads = page.counters.realGamepadReads;
  const ok = r.emulated && r.emulatedList && r.padsListedBefore === 0 && r.padsListed === 1 && r.listedIsVjoy && r.running && r.emulatedStickPitches && r.realGamepadReads === 0;
  if (recording && !ok) throw Error('joystick automation: ' + JSON.stringify(r));
  return r;
}

async function record(rt, { golden = null, log = () => {} } = {}) {
  const defaults = golden ? null : await readDefaults(rt);
  const out = { suite: 'joystick', meta: { checkpointEvery: EVERY, ids: { vjoy: VJOY_ID, t16000m: T16_ID }, hatCentred: HAT_CENTRED, oracle: ORACLE,
    note: 'joystick input path with scripted pads only (no device); B0 response laws are placeholders, SUPPOSED until measured in the game; settings are neutral golden values, never a player\'s' } };
  out.law = law(rt);
  out.automation = await automation(rt, !golden);
  out.oracle = await oracle(rt); log('joystick', 'oracle', JSON.stringify(out.oracle.stats));
  out.runs = await runs(rt, { golden, defaults, log });
  return out;
}
module.exports = { record, Stick, PROFILES, gameSection, VJOY_ID, T16_ID };
