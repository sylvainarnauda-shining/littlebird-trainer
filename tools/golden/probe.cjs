'use strict';
// State probe of a running session, read only through the test API the app exposes (__LB_EXPOSE__), the page's DOM
// and the harness. Groups are hashed separately so that a failure names the part of the game that moved:
//   strict: flight, input, session, camera, targets, bots, air, battle, ciws, towers, projectiles (explicit fields or
//     the plain own fields of the simulation objects), effects (particle buffers: count and the used part of every
//     attribute), scene (every top-level scene object's type, visibility and transform), domHud (the numbers the DOM
//     HUD, the kill feed, the notice and the result card show, with their sign, and the screen flags), rng (stream G
//     draw count), hud (canvas draw log of the frame, texts reduced to their numbers), audio (Web Audio log so far);
//   wording (strict, except in a step declared as wording with record.cjs --wording-step): hudText (canvas texts),
//     domHudText (DOM HUD, feed, notice and result texts), names (display names and faction ids, to be replaced by
//     neutral names);
//   advisory (reported, never failing): rngT (three.js UUID draws), diag (the whole trainerDiagnostics() snapshot).
// Plain own fields: numbers, strings, booleans, null/undefined and three.js vectors, quaternions, eulers and colours,
// hashed as (name, value) pairs in name order; references to other objects are skipped. The names seen per object type
// are written into the golden (meta.probeSchema). A check hands that schema back to the probe, which then hashes only
// those names: a field added by a behaviour-neutral refactor does not change a golden, and a field renamed by one is
// mapped back to its golden name through the alias table (probe-aliases.json: {type: {newName: goldenName}}). Record
// mode never reads the alias table. The same rule covers the statistics objects (stats, duel, ciwsStats).
const fs = require('node:fs'), path = require('node:path');
const { Hasher, sample } = require('./canon.cjs');
const { numbersOf } = require('./dom.cjs');
const { pick } = require('./runtime-names.cjs');

const FLIGHT = ['position', 'velocity', 'quaternion', 'angular', 'cyclic', 'mouseRate', 'collective', 'verticalAccel', 'lift', 'sideslip', 'onGround', 'crashed', 'time'];
const MOUSE = ['mousePitch', 'mouseYaw', 'accX', 'accY', 'accT', 'ratePitch', 'rateYaw'];
const eligible = v => v === null || v === undefined || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || !!(v && (v.isVector3 || v.isQuaternion || v.isVector2 || v.isEuler || v.isColor));
const ADVISORY = ['rngT', 'diag'];
const WORDING = ['hudText', 'domHudText', 'names'];
const NAME_FIELDS = new Set(['faction', 'label', 'name', 'skillName']);
// The DOM HUD: telemetry, session box, kill feed, notice, result card, and the screens' visibility.
const DOM_HUD_IDS = ['speed', 'altitude', 'collective', 'vario', 'timer', 'score', 'accuracy', 'kills', 'tracking', 'modeLabel', 'toast', 'resultTitle', 'resultDetail'];
const SCREENS = ['menu', 'pause', 'results', 'shop', 'loading'];
const ALIAS_FILE = path.join(__dirname, 'probe-aliases.json');
const loadAliases = () => { const a = JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8')); delete a.$comment; return a; };

// Schema-aware field hashing, shared with the module goldens (suites/modules.cjs).
class FieldHasher {
  // schema: null (record: collect the names) or {type: [names]} (check: hash only those); aliases: {type: {new: golden}}.
  constructor(schema = null, aliases = null) { this.check = !!schema; this.schema = new Map(); this.aliases = aliases || {};
    if (schema) for (const [t, names] of Object.entries(schema)) this.schema.set(t, new Set(names)); }
  names(type) { let s = this.schema.get(type); if (!s) { s = new Set(); this.schema.set(type, s); } return s; }
  // The (golden name, value) pairs of an object's eligible own fields, in name order.
  fields(type, o, keep = eligible) {
    const seen = this.names(type), al = this.aliases[type], out = [];
    for (const k of Object.keys(o)) { const v = o[k]; if (!keep(v)) continue; const name = al && Object.hasOwn(al, k) ? al[k] : k;
      if (this.check) { if (!seen.has(name)) continue; } else seen.add(name); out.push([name, v]); }
    return out.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  }
  json() { return Object.fromEntries([...this.schema.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([k, s]) => [k, [...s].sort()])); }
}

// DOM HUD: strict numbers (with sign) and flags; the texts go to the wording hasher.
function domHud(doc, h, th) {
  const el = id => doc.getElementById(id);
  for (const id of DOM_HUD_IDS) { const e = el(id); if (!e) { h.str('#missing:' + id); continue; } const t = e.textContent; h.str(id).val(numbersOf(t)); th.str(id).str(t); }
  { const e = el('resultStats'), t = e ? e.innerHTML : ''; h.str('resultStats').val(numbersOf(t)); th.str('resultStats').str(t); }
  { const f = el('feed'), kids = f ? f.children : []; h.str('feed').num(kids.length); for (const d of kids) { h.val(numbersOf(d.textContent)).str(d.className).str(String(d.style.borderLeftColor || '')); th.str(d.textContent); } }
  h.str('flags').val([el('toast').classList.contains('visible'), el('mouseMode').hidden, doc.body.classList.contains('flying'), doc.body.classList.contains('telemetry'),
    ...SCREENS.map(id => el(id) ? el(id).classList.contains('hidden') : null)]);
}
// Particles (the app's Points systems): draw range and the used part of each attribute, in scene order.
function effects(scene, h) {
  for (const o of scene.children) { if (!o.isPoints) continue; const g = o.geometry, n = g.drawRange.count; h.str('points').num(g.drawRange.start).num(n);
    for (const name of Object.keys(g.attributes).sort()) { const a = g.attributes[name], used = Math.min(a.array.length, (g.drawRange.start + n) * a.itemSize); h.str(name).num(a.itemSize);
      const arr = a.array.subarray(0, used); h.bytes(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)); } }
}
function sceneState(scene, h) {
  h.num(scene.children.length);
  for (const o of scene.children) h.str(o.type || 'Object3D').bool(!!o.visible).val([o.position, o.quaternion, o.scale]).num(o.children.length);
}

class Probe {
  // opts.schema: the golden's probeSchema (check mode); opts.aliases: alias table (check mode only).
  constructor(page, { schema = null, aliases = null } = {}) { this.page = page; this.fh = new FieldHasher(schema, schema ? (aliases || loadAliases()) : null); }
  plain(h, type, o) {
    if (!o) { h.str('#none'); return; }
    for (const [k, v] of this.fh.fields(type, o)) {
      // Display names and faction ids (to be replaced by neutral names) go to the wording group 'names'.
      if (NAME_FIELDS.has(k) && typeof v === 'string') { this.names.str(type + '.' + k).str(v); continue; }
      h.str(k); h.val(v);
    }
    h.str('#end');
  }
  // A statistics object: its top-level fields through the schema, each value hashed whole.
  obj(h, type, o) { if (!o) { h.val(o); return; } h.str('#obj'); for (const [k, v] of this.fh.fields(type, o, () => true)) { h.str(k); h.val(v); } h.str('#end'); }
  explicit(h, o, names) { for (const k of names) h.val(o[k]); }
  list(h, type, arr, each) { h.num(arr ? arr.length : -1); if (arr) for (const x of arr) each ? each(x) : this.plain(h, type, x); }
  groups(hudDigest = null, hudTextDigest = null) {
    const page = this.page, app = page.app, g = {}, H = () => new Hasher(); this.names = new Hasher();
    let h = H(); this.explicit(h, app.flight, FLIGHT); g.flight = h.digest();
    h = H(); this.explicit(h, app.mouse, MOUSE); const fl = app.freeLook; h.val([fl.held, fl.latch, fl.yaw, fl.pitch]); h.num(app.accumulator); g.input = h.digest();
    h = H(); h.val([app.running, app.time, app.view, app.heliAlive, app.health, app.ammo, app.fuel, app.score]); this.obj(h, 'stats', app.stats); h.val([app.gun.spin, app.gun.clock]);
    // The light preset by its parameters, not its id (ids are names to be replaced by neutral ones).
    const L = page.window.HeliWorld.LIGHTS[app.lightName], light = L ? Object.keys(L).filter(k => k !== 'label').sort().map(k => L[k]) : null;
    const hot = app.hot; h.val(hot ? [hot.center, hot.next, hot.radius] : null); h.val([light, app.chaseZoom, app.chaseYaw]); this.names.str('light').str(String(app.lightName));
    this.obj(h, 'duel', app.duel); this.obj(h, 'ciwsStats', app.ciwsStats); h.val(app.cfg); h.val(app.run); h.val(app.bindings); g.session = h.digest();
    h = H(); const cam = app.camera; h.val([cam.position, cam.quaternion, cam.fov, cam.aspect, cam.near, cam.far]); h.val([app.own.group.position, app.own.group.quaternion, app.own.group.visible]); g.camera = h.digest();
    h = H(); this.list(h, 'target', app.targets, t => { this.plain(h, 'target', t); h.val([t.group.position, t.group.quaternion, t.group.visible]); this.plain(h, 'motion', t.motion); }); g.targets = h.digest();
    h = H(); this.list(h, 'bot', app.bots, t => { const b = t.bot; this.plain(h, 'bot', b); this.explicit(h, b.flight, FLIGHT); h.val([b.gun.spin, b.gun.clock]); this.plain(h, 'pilot', b.pilot); }); g.bots = h.digest();
    h = H(); const d = app.defense; this.plain(h, 'defense', d); this.obj(h, 'defenseStats', d.stats); this.list(h, 'missile', d.missiles); this.list(h, 'flare', d.flares); this.list(h, 'launcher', d.launchers); g.air = h.digest();
    h = H(); const b = app.battle; this.plain(h, 'battle', b); this.obj(h, 'battleStats', b.stats); this.list(h, 'soldier', b.soldiers); this.list(h, 'structure', b.structures); this.list(h, 'vehicle', b.vehicles); this.list(h, 'camp', b.camps); g.battle = h.digest();
    h = H(); this.list(h, 'ciws', app.ciws, u => { this.plain(h, 'ciws', u); this.plain(h, 'ciwsTarget', u.target); }); this.list(h, 'samSite', pick(app, 'samSites'), u => { this.plain(h, 'samSite', u); this.plain(h, 'emplacement', u.emp); }); g.ciws = h.digest();
    h = H(); this.list(h, 'tower', app.towers); g.towers = h.digest();
    h = H(); this.list(h, 'bullet', app.bullets); this.list(h, 'enemyRound', app.enemyRounds); this.list(h, 'rocket', app.rockets); g.projectiles = h.digest();
    h = H(); effects(app.scene, h); g.effects = h.digest();
    h = H(); sceneState(app.scene, h); g.scene = h.digest();
    { h = H(); const th = H(); domHud(page.document, h, th); g.domHud = h.digest(); g.domHudText = th.digest(); }
    h = H(); h.num(page.counters.gameDraws); g.rng = h.digest();
    g.hud = hudDigest || '-'; g.hudText = hudTextDigest || '-';
    g.audio = page.audioLog ? page.audioLog.peek() : '-';
    h = H(); h.num(page.counters.threeDraws); g.rngT = h.digest();
    h = H(); h.val(page.diag()); g.diag = h.digest();
    g.names = this.names.digest();
    return g;
  }
  sample() {
    const app = this.page.app, f = app.flight;
    return sample({ p: f.position.toArray(), v: f.velocity.toArray(), q: f.quaternion.toArray(), collective: f.collective, health: app.health, ammo: app.ammo, fuel: app.fuel, score: app.score,
      shots: app.stats.shots, hits: app.stats.hits, kills: app.stats.kills, deaths: app.stats.deaths, draws: this.page.counters.gameDraws });
  }
  schemaJSON() { return this.fh.json(); }
}
// The result card (at each end of session): its numbers (strict) and texts (wording).
function resultCard(doc) {
  const h = new Hasher(), th = new Hasher();
  for (const id of ['resultTitle', 'resultDetail']) { const t = doc.getElementById(id).textContent; h.str(id).val(numbersOf(t)); th.str(id).str(t); }
  const s = doc.getElementById('resultStats').innerHTML; h.str('resultStats').val(numbersOf(s)); th.str('resultStats').str(s);
  return { numbers: h.digest().slice(0, 16), text: th.digest().slice(0, 16) };
}
// Checkpoint entry: 16 hex digits per group (for localisation) and the full digest of the strict groups (wording and
// advisory groups are compared on their own).
function checkpoint(t, groups) {
  const short = {}, all = new Hasher();
  for (const k of Object.keys(groups)) { short[k] = groups[k].slice(0, 16); if (!ADVISORY.includes(k) && !WORDING.includes(k)) all.str(k).str(groups[k]); }
  return { t, all: all.digest(), groups: short };
}
module.exports = { Probe, FieldHasher, checkpoint, resultCard, FLIGHT, MOUSE, ADVISORY, WORDING, NAME_FIELDS, eligible, loadAliases };
