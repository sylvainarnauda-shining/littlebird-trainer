'use strict';
// Per-module goldens: each simulation module driven on its own through scripted scenarios (patterned on the current
// unit tests), its whole state hashed after every step (plain own fields of every object: numbers, strings, booleans,
// three.js vectors; references skipped) together with the events it emits; 16-hex digests every 0.5 s, full digest at
// the end. missiles.js (AirDefense), ground.js (Battlefield, and its Verba gunners coupled with AirDefense launchers as
// app.js wires them), bot.js (BotPilot), physics.js (Minigun, EvasiveMotion, ObstacleField, collision helpers, hit
// damage). Streams: each scenario runs in a fresh realm seeded for it.
// Field names: every hashed object has a type ('missiles.launcher', 'ground.soldier', ...); the names seen per type are
// written into meta.probeSchema, and a check hashes only those (probe.cjs FieldHasher): a field added by a
// behaviour-neutral refactor leaves the module goldens as they are, a renamed one is mapped through probe-aliases.json.
const { makeModuleRealm } = require('../harness.cjs');
const { Hasher } = require('../canon.cjs');
const { FieldHasher, NAME_FIELDS, loadAliases } = require('../probe.cjs');

const DT = 1 / 120;
let FH = new FieldHasher();   // set per record() call (record: collects the names; check: the golden's schema)
function plain(h, type, o) { if (!o || typeof o !== 'object') { h.val(o === undefined ? '#u' : o); return; } for (const [k, v] of FH.fields(type, o)) { if (NAME_FIELDS.has(k) && typeof v === 'string') continue; h.str(k); h.val(v); } h.str('#end'); }
const list = (h, type, arr) => { h.num(arr ? arr.length : -1); if (arr) for (const x of arr) plain(h, type, x); };
class Trace {
  constructor(mod) { this.mod = mod; this.h = new Hasher(); this.n = 0; this.cps = []; this.events = {}; }
  step(fn) { fn(this.h); this.n++; if (this.n % 60 === 0) this.cps.push(this.h.peek().slice(0, 16)); }
  ev(list) { for (const e of list) { this.events[e.type] = (this.events[e.type] || 0) + 1; this.h.str('ev'); plain(this.h, this.mod + '.event.' + e.type, e); } }
  result() { return { steps: this.n, final: this.h.digest(), checkpointHex: this.cps.join(''), events: Object.fromEntries(Object.entries(this.events).sort()) }; }
}

// ---- missiles.js ----
function missiles(rt) {
  const out = {};
  const run = (id, seed, fn) => { const m = makeModuleRealm(rt, { files: ['world.js', 'physics.js', 'missiles.js'], seedG: seed }); out[id] = fn(m); };
  const makeEnv = (T, ground = () => 0) => ({ terrain: ground, hit: () => null, los(a, b) { const d = b.clone().sub(a), n = Math.max(6, Math.ceil(d.length() / 15)); for (let i = 1; i < n; i++) { const t = i / n; if (a.y + d.y * t < ground(a.x + d.x * t, a.z + d.z * t) + .3) return false; } return true; } });
  const heliAt = (T, x, y, z, vx = 0, vz = 0) => { const h = { position: new T.Vector3(x, y, z), velocity: new T.Vector3(vx, 0, vz), quaternion: new T.Quaternion(), agl: y, alive: true }; if (vx || vz) h.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), h.velocity.clone().normalize()); return h; };
  const site = (x, z, y = 0, kind = 'manpads') => ({ x, y, z, kind });
  const drive = (M, air, heli, seconds, each, ground = () => 0) => { const tr = new Trace('missiles'); for (let t = 0; t < seconds; t += DT) { air.step(DT, heli); heli.position.addScaledVector(heli.velocity, DT); heli.agl = heli.position.y - ground(heli.position.x, heli.position.z); if (each) each(t, tr); tr.step(h => { plain(h, 'missiles.airDefense', air); h.val(air.stats); list(h, 'missiles.missile', air.missiles); list(h, 'missiles.flare', air.flares); list(h, 'missiles.launcher', air.launchers); plain(h, 'missiles.heli', heli); }); tr.ev(air.events.splice(0)); } return tr.result(); };
  run('lock-launch', 7, ({ M, THREE: T }) => { const air = new M.AirDefense({ ...M.defaults, aaLockRange: 1500 }, makeEnv(T)); air.reset([site(0, 0)], 7); return drive(M, air, heliAt(T, 800, 80, 0), 12); });
  for (const [i, ttg] of [null, 2.5, 1.5, .8, 'lock'].entries()) run('engagement-' + (ttg === null ? 'noflare' : 'flare-' + ttg), 31 + i, ({ M, THREE: T }) => {
    const air = new M.AirDefense({ ...M.defaults, aaLockRange: 1500, flareUnlimited: true }, makeEnv(T)); air.reset([site(0, 0)], 31 + i); const heli = heliAt(T, 0, 90, -1100, 50, 0); let flared = false;
    return drive(M, air, heli, 25, () => { if (flared) return; if (ttg === 'lock' && air.launchers[0].state === 'locked') flared = air.deployFlares(heli); const m = air.missiles.find(q => q.target === 'heli' && q.ignited); if (typeof ttg === 'number' && m) { const t = M.timeToGo(m, heli); if (t !== null && t <= ttg) flared = air.deployFlares(heli); } }); });
  run('sam-long', 41, ({ M, THREE: T }) => { const air = new M.AirDefense({ ...M.defaults, aaLockRange: 1700 }, makeEnv(T)); air.reset([site(0, 0, 0, 'sam')], 41); return drive(M, air, heliAt(T, 0, 150, -1650), 20); });
  run('ridge-and-clutter', 9, ({ M, THREE: T }) => { const ground = x => x > 300 && x < 400 ? 120 : 0, air = new M.AirDefense({ ...M.defaults, aaLockRange: 1500 }, makeEnv(T, ground)); air.reset([site(0, 0)], 9); const heli = heliAt(T, 800, 80, 0);
    return drive(M, air, heli, 20, t => { if (t > 6 && t < 6 + DT) heli.position.y = 320; if (t > 12 && t < 12 + DT) heli.position.y = 6; }, ground); });
  run('six-sites-circling', 11, ({ M, THREE: T }) => { const air = new M.AirDefense({ ...M.defaults, flareUnlimited: true }, makeEnv(T)); const sites = []; for (let i = 0; i < 6; i++) sites.push(site(Math.cos(i) * 900, Math.sin(i) * 900)); air.reset(sites, 11);
    const heli = heliAt(T, 0, 120, -300); let k = 0; return drive(M, air, heli, 60, t => { const w = .12; heli.velocity.set(-Math.sin(t * w) * 45, 0, -Math.cos(t * w) * 45); if (++k % 900 === 0) air.deployFlares(heli); if (k === 3000) air.killLauncher(air.launchers[0]); if (k === 4000) air.clearThreats(3); if (k === 5000) air.refill(); }); });
  run('functions', 1, ({ M, THREE: T }) => { const h = new Hasher(); for (let d = 0; d <= 12; d += .125) h.num(M.missileDamage(d)); for (let a = 0; a <= 3; a += .05) h.num(M.flareIntensity(a)); const V = (x, y, z) => new T.Vector3(x, y, z);
    for (let i = 0; i < 50; i++) h.num(M.segmentDistance(V(i, i % 7, -i), V(-20, 3, 5), V(30, -2, i - 25))); h.val(M.constants); return { final: h.digest() }; });
  return out;
}
// ---- ground.js ----
function ground(rt) {
  const out = {};
  const run = (id, seed, fn) => { const m = makeModuleRealm(rt, { files: ['world.js', 'physics.js', 'missiles.js', 'ground.js'], seedG: seed }); out[id] = fn(m); };
  const drive = (b, heli, seconds, each) => { const tr = new Trace('ground'); for (let t = 0; t < seconds; t += DT) { b.step(DT, heli); if (heli.velocity) heli.position.addScaledVector(heli.velocity, DT); if (each) each(t); tr.step(h => { plain(h, 'ground.battlefield', b); h.val(b.stats); list(h, 'ground.soldier', b.soldiers); list(h, 'ground.structure', b.structures); list(h, 'ground.vehicle', b.vehicles); list(h, 'ground.camp', b.camps); list(h, 'ground.emplacement', b.emplacements); plain(h, 'ground.heli', heli); }); tr.ev(b.events.splice(0)); } return tr.result(); };
  const heliAt = (T, x, y, z, vx = 0) => ({ position: new T.Vector3(x, y, z), velocity: new T.Vector3(vx, 0, 0), quaternion: new T.Quaternion(), agl: y, alive: true, firing: false });
  run('valley-battle', 1234, ({ G, P, W, THREE: T }) => {
    const field = new P.ObstacleField(), los = (a, b) => !field.hit(a, b, 0, new Set(['arbre']));
    const b = new G.Battlefield({ ...G.defaults, enemyFire: true, scenario: 'match', aaEverywhere: true }, { terrain: W.height, field, los }); b.factions = ['a', 'b']; b.generate(1234, { camps: 4, soldiersPerCamp: 6, vehicles: 4 });
    const c = b.camps[0], heli = heliAt(T, c.x + 120, c.y + 60, c.z); let k = 0;
    return drive(b, heli, 60, t => { k++; heli.firing = (k % 600) < 200; if (k === 1500) { heli.position.set(c.x + 30, c.y + 40, c.z + 30); } if (k === 2000) { const st = b.structures.find(s => s.alive); if (st) b.damageStructure(st, 999); } if (k === 2500) { const s = b.soldiers.find(q => q.alive); if (s) b.damageSoldier(s, 5); }
      if (k === 3000) b.blast(new T.Vector3(c.x, c.y, c.z), 12); if (k === 3500) b.panic(new T.Vector3(c.x, c.y, c.z), 40); if (k === 4000 && b.vehicles[0]) b.damageVehicle(b.vehicles[0], 50); if (k === 4500) heli.alive = false; if (k === 5000) heli.alive = true; });
  });
  run('rocket-gunners', 5, ({ G, P, THREE: T, g }) => {
    // The realm's own (seeded) Math.random, never the recorder's: the soldiers draw from the game's stream.
    const rnd = g.Math.random;
    const field = new P.ObstacleField(), b = new G.Battlefield({ ...G.defaults, enemyFire: true }, { terrain: () => 0, field, los: (a, c) => !field.hit(a, c, 0, new Set(['arbre'])) });
    for (const [i, kind] of [[0, 'rpg7'], [1, 'maaws'], [2, 'rpg7']]) { const s = b.addSoldier(i * 40, 0, null, rnd, { role: 'rpg', home: true, rocketKind: kind, rockets: 3 }); s.brave = true; s.aimDelay = .8; }
    const camp = { id: 0, x: 0, z: 0, y: 0, structures: [] }; b.camps.push(camp); const dump = b.addStructure('munitions', 30, 0, 0, camp); camp.structures.push(dump);
    const s = b.addSoldier(-10, 0, camp, rnd, { role: 'rpg', rocketKind: 'rpg7', rockets: 0 }); s.loaded = false;
    const heli = heliAt(T, -60, 50, -250, 40); return drive(b, heli, 40, t => { if (heli.position.x > 200) heli.velocity.x = -40; if (heli.position.x < -200) heli.velocity.x = 40; });
  });
  run('convoy', 99, ({ G, P, W, THREE: T }) => { const field = new P.ObstacleField(), b = new G.Battlefield({ ...G.defaults, enemyFire: true }, { terrain: W.height, field, los: () => true }); b.generate(99, { camps: 0, soldiersPerCamp: 0, vehicles: 12 });
    const v = b.vehicles[0]; return drive(b, heliAt(T, v.position.x + 150, 60, v.position.z), 30); });
  run('segSeg', 1, ({ G, THREE: T }) => { const h = new Hasher(), V = (x, y, z) => new T.Vector3(x, y, z); for (let i = 0; i < 60; i++) h.val(G.segSeg(V(i, 0, -i), V(-i, 5, i), V(3, -i % 5, 2), V(-7, i, 9 - i))); h.val(G.ROCKETS); h.val(G.TYPES); return { final: h.digest() }; });
  Object.assign(out, verba(rt));
  return out;
}
// ---- ground.js Verba gunners with missiles.js launchers (the declared fix R5.7 lands here) ----
// Wiring as app.js armVerba: a manpads launcher per gunner whose unit is ready when the gunner is in 'engage' with the
// tube raised; each step: battle.step, the tube's eye and muzzle follow the gunner (models.js tubeMuzzle), air.step. A
// gunner's own random source is an LCG seeded per case (addSoldier's r), as in the audit probe of the reload race.
// Cases: the audit's failing seeds 11, 19, 48, 55, 67 and passing seeds 1-6 (one brave gunner, two missiles, the
// helicopter hovering 600 m away, 40 s); and a two-gunner case with three missiles each, a helicopter circling at
// 450-750 m and flares on some missiles (60 s). verbaReloadSkipped counts the steps where a gunner went from 'engage'
// straight back to 'patrol' while his launcher reloads: the race the fix R5.7 removed (the recording requires 0);
// verbaReloadStarted counts the steps where a gunner went from 'engage' to 'reload' after a launch (required above 0,
// so that the cases still exercise the moment of the race).
const lcg = seed => { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
function verba(rt) {
  const out = {}; let skipped = 0, started = 0;
  const run = (id, seed, fn) => { const m = makeModuleRealm(rt, { files: ['world.js', 'physics.js', 'missiles.js', 'models.js', 'ground.js'], seedG: seed }); out[id] = fn(m); };
  const setup = ({ G, M, P, Models, THREE: T }) => {
    const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z), models = Models.create(T), flat = () => 0, field = new P.ObstacleField(), los = (a, b) => !field.hit(a, b, 0, new Set(['arbre']));
    const battle = new G.Battlefield({ ...G.defaults, enemyFire: false }, { terrain: flat, field, los }), air = new M.AirDefense({ ...M.defaults, flareUnlimited: true }, { terrain: flat, los, hit: () => null }); air.reset([], 7);
    const arm = (s, ammo) => { s.role = 'verba'; s.weapon = 'tube';
      const unit = { soldier: s, get alive() { return s.alive; }, get ready() { return s.alive && s.state === 'engage' && s.raise >= 1; }, eye: V(), muzzle: V(), axis: V(0, 0, -1), aligned: true };
      models.tubeMuzzle(s, unit.eye, unit.muzzle, unit.axis);
      const l = air.addLauncher({ id: 'v' + s.id, x: s.position.x, y: 0, z: s.position.z, kind: 'manpads', unit, ammo }); l.range = air.range(l); l.minRange = air.minRange(); s.launcher = l; return l; };
    return { V, models, battle, air, arm, T };
  };
  const drive = (w, heli, seconds, each) => {
    const tr = new Trace('verba'), prev = new Map();
    for (let t = 0; t < seconds; t += DT) {
      w.battle.step(DT, heli);
      for (const s of w.battle.soldiers) { if (s.launcher && !s.launcher.dead) w.models.tubeMuzzle(s, s.launcher.unit.eye, s.launcher.unit.muzzle, s.launcher.unit.axis);
        if (prev.get(s) === 'engage' && s.state === 'patrol' && s.launcher && s.launcher.reload > 0) skipped++;
        if (prev.get(s) === 'engage' && s.state === 'reload') started++; }
      w.air.step(DT, heli); if (heli.velocity) heli.position.addScaledVector(heli.velocity, DT); if (each) each(t);
      for (const s of w.battle.soldiers) prev.set(s, s.state);
      tr.step(h => { plain(h, 'ground.battlefield', w.battle); h.val(w.battle.stats); list(h, 'ground.soldier', w.battle.soldiers); plain(h, 'missiles.airDefense', w.air); h.val(w.air.stats); list(h, 'missiles.missile', w.air.missiles); list(h, 'missiles.flare', w.air.flares); list(h, 'missiles.launcher', w.air.launchers); plain(h, 'ground.heli', heli); });
      tr.ev(w.battle.events.splice(0)); tr.ev(w.air.events.splice(0));
    }
    return tr.result();
  };
  for (const seed of [11, 19, 48, 55, 67, 1, 2, 3, 4, 5, 6]) run('verba-seed-' + seed, seed, m => {
    const w = setup(m), s = w.battle.addSoldier(0, 0, null, lcg(seed), { role: 'verba', home: true }); s.brave = true; w.arm(s, 2);
    return drive(w, { position: w.V(0, 70, -600), velocity: w.V(), quaternion: new w.T.Quaternion(), agl: 70, alive: true, firing: false }, 40);
  });
  run('verba-pair-circling', 29, m => {
    const w = setup(m); for (const [i, x] of [[0, -40], [1, 60]]) { const s = w.battle.addSoldier(x, 10 * i, null, lcg(21 + i), { role: 'verba', home: true }); s.brave = i === 0; w.arm(s, 3); }
    const heli = { position: w.V(0, 90, -600), velocity: w.V(), quaternion: new w.T.Quaternion(), agl: 90, alive: true, firing: false }; let k = 0;
    return drive(w, heli, 60, t => { k++; const r = 600 + 150 * Math.sin(t / 9), a = t * .09; heli.velocity.set((Math.cos(a) * r - heli.position.x) * 2, 0, (-Math.sin(a) * r - heli.position.z) * 2); heli.agl = heli.position.y;
      if (k % 1800 === 900) w.air.deployFlares(heli); if (k === 5000) heli.alive = false; if (k === 5600) heli.alive = true; });
  });
  out.verbaReloadSkipped = { final: new Hasher().num(skipped).digest(), count: skipped };
  out.verbaReloadStarted = { final: new Hasher().num(started).digest(), count: started };
  return out;
}
// ---- bot.js ----
function bots(rt) {
  const out = {};
  const run = (id, seed, fn) => { const m = makeModuleRealm(rt, { files: ['world.js', 'physics.js', 'bot.js'], seedG: seed }); out[id] = fn(m); };
  const FL = ['position', 'velocity', 'quaternion', 'angular', 'cyclic', 'collective', 'crashed'];
  for (const skill of ['easy', 'normal', 'real']) for (const kind of ['hover', 'valley', 'circle', 'evasive']) run(`${skill}/${kind}`, 3, ({ P, W, B, THREE: T }) => {
    const V = (x, y, z) => new T.Vector3(x, y, z), los = (a, b) => { const n = Math.ceil(a.distanceTo(b) / 40); for (let i = 1; i < n; i++) { const t = i / n; if (W.height(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) > a.y + (b.y - a.y) * t - 2) return false; } return true; };
    const z0 = -900, x0 = W.valleyX(z0), tg = { position: V(x0, W.height(x0, z0) + 60, z0), velocity: V(0, 0, 0), forward: V(0, 0, -1), alive: true, firing: false }, ev = new P.EvasiveMotion(tg.position, V(x0, W.height(x0, z0) + 70, z0), true, 55, 7); let t = 0;
    const stepT = dt => { t += dt; if (kind === 'hover') tg.velocity.set(0, 0, 0); else if (kind === 'valley') { const dir = Math.sin(t / 40 * Math.PI) >= 0 ? 1 : -1, z = tg.position.z - 45 * dt * dir, x = W.valleyX(z); tg.velocity.set((x - tg.position.x) / dt, 0, -45 * dir); tg.position.x = x; tg.position.z = z; }
      else if (kind === 'circle') { const w = 40 / 250; tg.velocity.set(-Math.sin(t * w) * 40, 0, -Math.cos(t * w) * 40); } else { ev.step(dt, null); tg.velocity.copy(ev.velocity); tg.position.copy(ev.position); }
      if (kind === 'hover' || kind === 'circle') tg.position.addScaledVector(tg.velocity, dt); const g = W.height(tg.position.x, tg.position.z) + (kind === 'valley' ? 50 : 40); if (tg.position.y < g) { tg.velocity.y = (g - tg.position.y) / dt; tg.position.y = g; } if (tg.velocity.lengthSq() > 1) tg.forward.copy(tg.velocity).normalize(); };
    const sz = -1700, f = new P.Flight({ ...P.defaults }); f.reset(0); f.position.set(W.valleyX(sz) + 150, W.height(W.valleyX(sz) + 150, sz) + 80, sz);
    const bot = new B.BotPilot(f, { terrain: W.height, lineOfSight: los, skill, seed: 3 }), gun = new P.Minigun({ ...P.defaults }), tr = new Trace('bots');
    for (let k = 0; k < 40 * 120; k++) { stepT(DT); const o = bot.step(DT, tg); f.step(DT, o.input); const n = gun.step(DT, o.fire); if (k === 2400) bot.hit(); if (k === 3600) bot.forget();
      tr.step(h => { for (const x of FL) h.val(f[x]); h.val(o.input); h.bool(!!o.fire); h.num(n); plain(h, 'bots.botPilot', bot); h.val(bot.history.length); }); if (f.crashed) break; }
    return tr.result();
  });
  run('bot-vs-bot', 5, ({ P, W, B, THREE: T }) => {
    const mk = (z, x, seed) => { const f = new P.Flight({ ...P.defaults }); f.reset(0); f.position.set(x, W.height(x, z) + 70, z); return { f, bot: new B.BotPilot(f, { terrain: W.height, skill: 'normal', seed, weapon: seed % 2 ? 'rockets' : 'miniguns', drop: seed % 2 ? 4.9 : 9.81 }) }; };
    const a = mk(-600, W.valleyX(-600), 5), b = mk(-1900, W.valleyX(-1900) + 100, 36), view = (f, p) => ({ position: f.position, velocity: f.velocity, forward: new T.Vector3(0, 0, -1).applyQuaternion(f.quaternion), alive: !f.crashed, firing: p.firing });
    a.bot.others = [b.f]; b.bot.others = [a.f]; const tr = new Trace('bots');
    for (let k = 0; k < 60 * 120; k++) { const oa = a.bot.step(DT, view(b.f, b.bot)), ob = b.bot.step(DT, view(a.f, a.bot)); a.f.step(DT, oa.input); b.f.step(DT, ob.input); tr.step(h => { for (const x of FL) { h.val(a.f[x]); h.val(b.f[x]); } h.val([oa.input, ob.input, !!oa.fire, !!ob.fire]); plain(h, 'bots.botPilot', a.bot); plain(h, 'bots.botPilot', b.bot); }); }
    return tr.result();
  });
  return out;
}
// ---- physics.js (besides the flight model: G2a) ----
function physics(rt) {
  const { P, THREE: T } = makeModuleRealm(rt, { files: ['world.js', 'physics.js'], seedG: 17 }), out = {}, V = (x, y, z) => new T.Vector3(x, y, z);
  { const tr = new Trace('physics'); for (const cfg of [{ ...P.defaults }, { ...P.defaults, rpm: 3000, spinUp: 0 }, { ...P.defaults, spinUp: .8 }]) { const g = new P.Minigun(cfg); for (let k = 0; k < 1200; k++) { const n = g.step(DT, (k % 400) < 250); tr.step(h => h.val([n, g.spin, g.clock])); } } out.minigun = tr.result(); }
  { const field = new P.ObstacleField(); for (let i = 0; i < 40; i++) field.add((i % 8) * 40 - 160, 5, Math.floor(i / 8) * 40 - 100, 12, 10 + i % 5, 8, i % 3 ? 'house' : 'wall');
    const tr = new Trace('physics'); for (const [air, seed] of [[true, 4], [false, 9], [true, 123456]]) { const c = V(0, air ? 60 : .9, 0), m = new P.EvasiveMotion(c, c, air, 18, seed); for (let k = 0; k < 3600; k++) { m.step(DT, field); tr.step(h => plain(h, 'physics.evasive', m)); } }
    const h = new Hasher(); for (let i = 0; i < 300; i++) { const a = V(-200 + (i * 37) % 400, (i * 13) % 30, -150 + (i * 53) % 300), b = V(200 - (i * 29) % 400, (i * 7) % 40, 150 - (i * 17) % 300), r = field.hit(a, b, i % 4 ? 0 : 2, i % 5 ? null : new Set(['wall'])); h.val(r ? [r.fraction, r.kind] : null); h.val(P.segmentBox(a, b, field.items[i % 40], i % 3)); h.bool(P.sweptSphere(a, b, V(0, 5, 0), V(3, 5, 1), 20 + i % 30)); }
    out.evasive = tr.result(); out.field = { final: h.digest() }; }
  { const mesh = new T.Mesh(new T.BoxGeometry(4, 2, 6), new T.MeshBasicMaterial()); mesh.position.set(0, 10, -50); mesh.updateMatrixWorld(true); const h = new Hasher();
    for (let i = 0; i < 200; i++) { const a = V(-3 + (i % 7), 9 + (i % 5) * .5, 0), b = V(-3 + (i % 11) * .6, 9.5 + (i % 3) * .4, -120), prev = V((i % 9) * .1, 10, -50); const r = P.sweptMesh(a, b, prev, mesh, 6); h.val(r ? [r.fraction, r.point] : null); } out.sweptMesh = { final: h.digest() }; }
  { const h = new Hasher(); let s = 5; const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; for (let i = 0; i < 500; i++) h.num(P.hitDamage({ impactDamage: 0 }, r)); for (const d of [18.01, 36.01, 150.02]) h.num(P.hitDamage({ impactDamage: d }, r));
    for (let i = 0; i < 100; i++) h.val(P.attitudeOf(new T.Quaternion().setFromEuler(new T.Euler(i * .03 - 1.5, i * .07, i * -.05, 'YXZ')))); h.val(P.OBSERVED_HITS); h.num(P.G);
    for (let x = -2000; x <= 2000; x += 97) for (let z = -3000; z <= 700; z += 113) h.num(P.terrain(x, z)); out.helpers = { final: h.digest() }; }
  return out;
}
// The modules' default settings, apart: the declared public-defaults step (R5) moves exactly these records, and a
// move of the defaults into config files (S6) must leave them bit-identical.
function defaults(rt) {
  const { P, M, G } = makeModuleRealm(rt, { files: ['world.js', 'physics.js', 'missiles.js', 'ground.js'], seedG: 1 }), out = {};
  for (const [k, d] of [['physics', P.defaults], ['missiles', M.defaults], ['ground', G.defaults]]) { const h = new Hasher(); for (const key of Object.keys(d).sort()) h.str(key).val(d[key]); out[k] = { final: h.digest(), keys: Object.keys(d).length }; }
  return out;
}
async function record(rt, { golden = null, log = () => {} } = {}) {
  FH = golden ? new FieldHasher(golden.meta.probeSchema, loadAliases()) : new FieldHasher();
  const out = { missiles: missiles(rt), ground: ground(rt), bots: bots(rt), physics: physics(rt), defaults: defaults(rt) };
  for (const [m, o] of Object.entries(out)) for (const [k, v] of Object.entries(o)) log('modules', m + '/' + k, v.steps || '', v.final.slice(0, 16), v.events ? JSON.stringify(v.events) : v.count !== undefined ? 'count ' + v.count : '');
  if (!golden && out.ground.verbaReloadSkipped.count !== 0) throw Error('modules: the Verba reload race is back (verbaReloadSkipped = ' + out.ground.verbaReloadSkipped.count + ')');
  if (!golden && !(out.ground.verbaReloadStarted.count > 0)) throw Error('modules: no Verba gunner reloaded after a launch (verbaReloadStarted = 0)');
  return { suite: 'modules', meta: { stepHz: 120, checkpointEverySteps: 60, note: 'fresh realm per scenario; the plain own fields of every object hashed after every step, restricted in a check to probeSchema',
    probeSchema: golden ? golden.meta.probeSchema : FH.json() }, ...out };
}
module.exports = { record };
