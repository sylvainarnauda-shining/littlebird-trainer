'use strict';
// Session scenario scripts (G2b): one scripted session per mode through the app's own handlers (keys, mouse, buttons),
// with scripted "set-ups" where a script needs a guaranteed event (placing the helicopter within range of a target,
// pointing it at the target at the start of a burst), as the existing mock-DOM tests do. Every script keeps engaging
// until the frame budget runs out (it loops; a finished session is restarted with the results card's replay button, a
// lost helicopter is waited for), so that every checkpoint of the golden carries a session in play. Every scenario
// ends with coverage counters and fails when one it requires is zero, or when less than 90 % of its frames were
// scripted, or when the flight state or the helicopter's position stays still at more than 10 % of its running
// checkpoints (sessions.cjs): a golden that never shot, hit, launched, took damage, killed or respawned, or that idles,
// would prove little.
// The main scenarios cover the nine modes for 62 s; the variants (shorter) cover option values the main ones do not
// use: trajectory 'cross', graphics 'medium', aaObjective 'destroy' (and its end condition), duelStart 'behind' and
// 'random', duelRespawn false (and its end condition), mapRandomEach (a generated map at every page load).
// Settings are explicit (the full object is written into the golden's meta); player-specific values are replaced by
// neutral golden values (chosen): sensitivities 25/25 x1, normal Y axis, 90 deg fields of view.
const { resultCard } = require('./probe.cjs');
const { pick } = require('./runtime-names.cjs');

const GOLDEN_BASE = { pitchSens: 25, yawSens: 25, vehicleMultiplier: 1, invertY: false, isolation: 0, fovCockpit: 90, fovChase: 90, dpi: 1000, volume: 0.5,
  lighting: 'random', mapRandomEach: false, graphics: 'high', mouseLaw: 'rate', mouseFine: 1, duration: 0, difficulty: 'normal' };
// Key bindings are explicit too (chosen: a mouse-pilot layout, collective on W / Shift, pitch on S / ArrowUp, roll on the
// mouse buttons, yaw on A / D), the keys the scripts press: a change of the app's default bindings changes no golden.
const GOLDEN_BINDINGS = { collectiveUp: 'KeyW', collectiveDown: 'ShiftLeft', pitchUp: 'KeyS', pitchDown: 'ArrowUp', yawLeft: 'KeyA', yawRight: 'KeyD', rollLeft: 'Mouse0', rollRight: 'Mouse2',
  fire: 'Space', flares: 'KeyV', freeLook: 'AltLeft', shop: 'KeyB', view: 'KeyE', reset: 'KeyR', neutral: 'KeyX' };

const FRAMES = 6200;   // 62 s at 100 Hz for the main scenarios (the 'air' session ends on its 60 s timer inside the window)
// Per scenario: map, stream G seed, frame budget, explicit settings, the counters its script must drive above zero, and
// for a variant the option it exists for. storageMap: the page's saved map choice (world.js STORE_KEY).
const SCENARIOS = {
  air: { map: 'vallee', seedG: 101, settings: { scenario: 'air', rangeType: 'air', trajectory: 'evasive', targetCount: 4, airHealth: 20, groundHealth: 20, unlimitedAmmo: true, duration: 60 },
    required: ['shots', 'hits', 'kills', 'targetRespawns', 'viewChanges', 'finished', 'restarts'] },
  ground: { map: 'vallee', seedG: 102, settings: { scenario: 'ground', rangeType: 'ground', trajectory: 'zigzag', targetCount: 3, groundHealth: 20, airHealth: 20, unlimitedAmmo: true },
    required: ['shots', 'hits', 'kills', 'targetRespawns'] },
  mixed: { map: 'gen-4242', seedG: 103, settings: { scenario: 'mixed', rangeType: 'mixed', trajectory: 'circle', targetCount: 4, airHealth: 20, groundHealth: 20, unlimitedAmmo: false, targetSpeed: 90 },
    required: ['shots', 'hits', 'kills', 'targetRespawns', 'shopOpened', 'resupplies'] },
  free: { map: 'vallee', seedG: 104, settings: { scenario: 'free', graphics: 'low' }, required: ['flightDistance', 'viewChanges', 'freeLookFrames', 'maxSpeedKmh'] },
  towers: { map: 'vallee', seedG: 105, settings: { scenario: 'towers', targetCount: 3, baseHealth: 10 }, required: ['shots', 'hits', 'kills', 'towersCaptured', 'finished', 'restarts'] },
  missiles: { map: 'vallee', seedG: 106, settings: { scenario: 'missiles', aaLaunchers: 4, aaObjective: 'survive', ciwsCount: 1, aaRockets: 1, difficulty: 'easy' },
    required: ['shots', 'hits', 'launches', 'flaresUsed', 'missileHits', 'damageEvents', 'launchersKilled'] },
  assault: { map: 'vallee', seedG: 107, settings: { scenario: 'assault', camps: 3, infantryPerCamp: 6, convoy: 2, enemyFire: true, aaEverywhere: false, rpgPerCamp: 1 },
    required: ['shots', 'hits', 'structuresDestroyed', 'soldiersKilled', 'shotsAtHeli', 'hitsOnHeli', 'damageEvents'] },
  match: { map: 'vallee', seedG: 108, settings: { scenario: 'match', camps: 3, infantryPerCamp: 5, convoy: 2, aaLaunchers: 2, ciwsCount: 1, airHealth: 20, difficulty: 'real' },
    required: ['shots', 'hits', 'botShots', 'damageEvents', 'deaths', 'respawns', 'shopOpened'] },
  duel: { map: 'gen-77', seedG: 109, settings: { scenario: 'duel', duelBots: 2, duelHealth: 20, duelRespawn: true, duelStart: 'front', duelEnemy: 'mix' },
    required: ['shots', 'hits', 'botKills', 'botRespawns', 'botShots', 'damageEvents'] },
  // ---- variants: option values the main scenarios leave out ----
  'air-cross': { variantOf: 'air', option: "trajectory 'cross', graphics 'medium'", map: 'vallee', seedG: 111, frames: 2500,
    settings: { scenario: 'air', rangeType: 'air', trajectory: 'cross', targetCount: 4, airHealth: 20, groundHealth: 20, unlimitedAmmo: true, duration: 0, graphics: 'medium' },
    required: ['shots', 'hits', 'kills', 'crossMotionFrames'] },
  'missiles-destroy': { variantOf: 'missiles', option: "aaObjective 'destroy' (the session ends when every launcher is down)", map: 'vallee', seedG: 112, frames: 4000,
    settings: { scenario: 'missiles', aaLaunchers: 2, aaObjective: 'destroy', ciwsCount: 0, aaRockets: 0, difficulty: 'easy' },
    required: ['shots', 'hits', 'launchersKilled', 'finished', 'destroyObjectiveMet'] },
  'duel-behind': { variantOf: 'duel', option: "duelStart 'behind', duelRespawn false (the session ends when every enemy is down)", map: 'gen-77', seedG: 113, frames: 4000,
    settings: { scenario: 'duel', duelBots: 1, duelHealth: 20, duelRespawn: false, duelStart: 'behind', duelEnemy: 'ah6m' },
    required: ['shots', 'hits', 'botKills', 'finished', 'botsBehindAtStart'] },
  'duel-random': { variantOf: 'duel', option: "duelStart 'random'", map: 'vallee', seedG: 114, frames: 2500,
    settings: { scenario: 'duel', duelBots: 2, duelHealth: 20, duelRespawn: true, duelStart: 'random', duelEnemy: 'ah6r' },
    required: ['shots', 'botShots', 'botsInBandAtStart'] },
  'random-map': { variantOf: 'free', option: 'mapRandomEach (a generated map at the page load)', map: 'vallee', seedG: 115, frames: 2000, storageMap: { id: 'vallee', random: true },
    settings: { scenario: 'free', mapRandomEach: true, graphics: 'low' }, required: ['randomMap', 'flightDistance'] }
};
const REQUIRED = Object.fromEntries(Object.entries(SCENARIOS).map(([k, s]) => [k, s.required]));
const framesOf = id => SCENARIOS[id].frames || FRAMES;

class Pilot {
  constructor(page, tick) { this.page = page; this.tick = tick; this.T = page.window.THREE; this.P = page.window.HeliPhysics; this.W = page.window.HeliWorld; this.carry = { x: 0, y: 0 }; this.restarts = 0; this.resupplies = 0; this.ticks = 0; this.roundTicks = -1; }
  get app() { return this.page.app; }
  V(x = 0, y = 0, z = 0) { return new this.T.Vector3(x, y, z); }
  async frames(n, each) { for (let i = 0; i < n; i++) { if (each && each(i) === false) return false; await this.tick(); this.ticks++; } return true; }
  hold(code) { this.page.key(code, true); } release(code) { this.page.key(code, false); }
  async tap(code, frames = 2) { this.hold(code); await this.frames(frames); this.release(code); }
  terrain(x, z) { return this.P.terrain(x, z); }
  hidden(id) { return this.page.el(id).classList.contains('hidden'); }
  // A finished session is played again (the results card's replay button); a pause is resumed. Returns true on a restart.
  async ensureRunning() {
    if (!this.hidden('results')) { await this.page.click('retry'); this.restarts++; await this.frames(2); return true; }
    if (!this.hidden('pause')) { await this.page.click('pauseResume'); await this.frames(2); }
    return false;
  }
  // Waits (at most `max` frames) while the helicopter is a wreck.
  async waitAlive(max = 400) { if (!this.app.heliAlive) await this.frames(max, () => this.app.heliAlive ? false : undefined); }
  // Hover at p (flight state set as the tests do), nose toward `face` if given, drifting at `drift` (a vector) if given.
  hover(p, face, drift = null) {
    const f = this.app.flight; f.position.copy(p); f.velocity.set(0, 0, 0); if (drift) f.velocity.copy(drift); f.angular.set(0, 0, 0); f.cyclic.set(0, 0, 0); f.mouseRate.set(0, 0, 0);
    f.collective = this.app.cfg.leverHover || 0; f.onGround = false; f.verticalAccel = 0; if (face) this.face(face);
  }
  face(point) { const m = new this.T.Matrix4().lookAt(this.app.flight.position, point, this.V(0, 1, 0)); this.app.flight.quaternion.setFromRotationMatrix(m); }
  // Nose error to a point, degrees: [yaw (+ left), pitch (+ up)].
  error(point) {
    const f = this.app.flight, l = point.clone().sub(f.position).applyQuaternion(f.quaternion.clone().invert());
    return [Math.atan2(-l.x, -l.z) * 180 / Math.PI, Math.atan2(l.y, Math.hypot(l.x, l.z)) * 180 / Math.PI];
  }
  // Mouse steering toward a point through the real mousemove handler (rate law: px = rate x frame time / K).
  steer(point, gain = 3, cap = 30) {
    const c = this.app.cfg, [ey, ep] = this.error(point), kP = c.mouseRateScale * c.pitchSens / 100 * c.vehicleMultiplier * (c.mouseFine || 1), kY = c.mouseYawScale * c.yawSens / 100 * c.vehicleMultiplier * (c.mouseFine || 1);
    const clamp = (x, a) => Math.max(-a, Math.min(a, x)), rateY = clamp(ey * gain, cap), rateP = clamp(ep * gain, cap), dt = this.page.frameMs / 1000;
    // rateYaw = -dx K (nose left for dx < 0); ratePitch = dy K (invertY) or -dy K (normal axis).
    const wantX = -rateY * dt / kY + this.carry.x, wantY = (c.invertY ? rateP : -rateP) * dt / kP + this.carry.y;
    const dx = Math.round(wantX), dy = Math.round(wantY); this.carry.x = wantX - dx; this.carry.y = wantY - dy;
    if (dx || dy) this.page.mouseMove(dx, dy);
    return Math.hypot(ey, ep);
  }
  // A firing position about `dist` m from aim point a, `up` m above it, with a clear line (scenery and ground): 16
  // bearings at the asked distance and height, then closer and higher, then farther.
  spot(a, dist, up, bearing0 = 0, owner = null) {
    const O = this.app.obstacles;
    for (const [kd, ku] of [[1, 1], [.7, 1.6], [.5, 2.6], [1.3, 2.2]]) for (let k = 0; k < 16; k++) {
      const b = bearing0 + k * Math.PI / 8, p = this.V(a.x + Math.sin(b) * dist * kd, a.y + up * ku, a.z + Math.cos(b) * dist * kd);
      p.y = Math.max(p.y, this.terrain(p.x, p.z) + 12);
      const hit = O.hit(p, a, .2); if (hit && hit.fraction < .995 && !(owner && hit.owner === owner)) continue;
      let clear = true; for (let i = 1; i < 24; i++) { const q = p.clone().lerp(a, i / 24); if (q.y < this.terrain(q.x, q.z) + .3) { clear = false; break; } }
      if (clear) return p;
    }
    return null;
  }
  // Lead point for a moving target at bullet speed (gravity drop compensated).
  lead(pos, vel) {
    const f = this.app.flight, d = pos.distanceTo(f.position), tof = d / this.app.cfg.bulletSpeed, p = pos.clone();
    if (vel) p.addScaledVector(vel, tof); p.y += .5 * 9.81 * tof * tof; return p;
  }
  // A burst at a target: set-up (place, point, and a slow sideways drift of `strafe` m/s so that the helicopter keeps
  // moving as in play), then fire while steering with the mouse, re-pointing when the error exceeds `repoint` degrees.
  // aim(): current aim point (or null when the target is gone). Returns false (no frame used) when no position is clear.
  async burst(aim, { frames = 200, dist = 180, up = 30, repoint = 2.5, bearing = 0, place = true, owner = null, strafe = 2.5 } = {}) {
    let a = aim(); if (!a) return false;
    if (place) {
      const p = this.spot(a, dist, up, bearing, owner); if (!p) return false;
      const los = a.clone().sub(p); los.y = 0; const side = los.lengthSq() > 1 ? this.V(-los.z, 0, los.x).normalize().multiplyScalar(strafe * (bearing % 2 ? -1 : 1)) : null;
      this.hover(p, a, side);
    }
    this.hold('Space');
    await this.frames(frames, () => { if (!this.app.running) return false; const q = aim(); if (!q) return false; const e = this.steer(q); if (e > repoint) this.face(q); });
    this.release('Space'); return true;
  }
  // Resupply on the helipad: set down on the pad, open the vendor (B), take ammunition, close it (Escape).
  async resupply() {
    const W = this.W, f = this.app.flight; this.hover(this.V(W.PAD.x, this.terrain(W.PAD.x, W.PAD.z) + 1.3, W.PAD.z)); f.onGround = true; f.collective = -1;
    await this.frames(60); await this.tap('KeyB'); await this.frames(20);
    if (!this.hidden('shop')) {
      const buy = this.page.document.querySelector('[data-item="ammo"]'); for (let i = 0; i < 2 && buy; i++) { await this.page.click(buy); await this.frames(5); }
      this.resupplies++; this.page.key('Escape', true); this.page.key('Escape', false); await this.frames(20);
    }
    this.hold('KeyW'); await this.frames(200); this.release('KeyW');
  }
}

// Coverage counters, updated after every frame from the exposed state.
class Coverage {
  constructor(page) { this.page = page; this.c = { shots: 0, hits: 0, kills: 0, deaths: 0, respawns: 0, damageEvents: 0, targetRespawns: 0, botKills: 0, botRespawns: 0, botShots: 0,
    launches: 0, flaresUsed: 0, missileHits: 0, launchersKilled: 0, soldiersKilled: 0, structuresDestroyed: 0, vehiclesDestroyed: 0, shotsAtHeli: 0, hitsOnHeli: 0, rocketsFired: 0,
    ciwsShots: 0, ciwsHits: 0, towersCaptured: 0, shopOpened: 0, finished: 0, viewChanges: 0, freeLookFrames: 0, flightDistance: 0, maxSpeedKmh: 0, crossMotionFrames: 0,
    destroyObjectiveMet: 0, verbaReloadSkipped: 0, hudOps: 0, audioOps: 0, gameDraws: 0, timersRun: 0 };
    this.prev = null; this.results = []; this.frame = 0; this.verba = new Map(); }
  update() {
    const a = this.page.app, c = this.c, p = this.prev || {}; this.frame++;
    const now = { alive: a.heliAlive, health: a.health, running: a.running, view: a.view, pos: a.flight.position.clone(),
      bots: a.bots.map(t => t.active), targets: a.targets.map(t => t.active), shop: this.page.el('shop').classList.contains('hidden') ? 0 : 1, results: this.page.el('results').classList.contains('hidden') ? 0 : 1,
      air: a.targets.map(t => t.air && t.active && !t.bot ? t.group.position.clone() : null) };
    if (p.alive === false && now.alive) c.respawns++;
    if (p.health !== undefined && now.health < p.health - 1e-9 && now.alive) c.damageEvents++;
    if (p.targets) a.targets.forEach((t, i) => { if (p.targets[i] === false && now.targets[i] && !t.bot) c.targetRespawns++; });
    if (p.bots) now.bots.forEach((on, i) => { if (p.bots[i] === false && on) c.botRespawns++; });
    if (p.view && p.view !== now.view) c.viewChanges++;
    if (p.shop === 0 && now.shop) c.shopOpened++;
    if (p.results === 0 && now.results) { c.finished++; this.results.push({ frame: this.frame, ...resultCard(this.page.document) });
      if (a.run.aaObjective === 'destroy' && a.run.scenario === 'missiles' && a.defense.launchers.length && a.defense.launchers.every(l => l.dead)) c.destroyObjectiveMet++; }
    // Cross trajectory: an air target moving across (x changes, y and z fixed).
    if (p.air && now.running) now.air.forEach((q, i) => { const o = p.air[i]; if (q && o && q.x !== o.x && q.y === o.y && q.z === o.z) c.crossMotionFrames++; });
    // ground.js decideVerba reload race (declared fix R5.7): a Verba gunner that goes from 'engage' straight back to
    // 'patrol' while his launcher reloads skipped the kneel-and-reload of the shot he just fired (informative here; the
    // module golden ground/verba-* requires it).
    for (const s of a.battle.soldiers) { if (s.role !== 'verba' || !s.launcher) continue; const was = this.verba.get(s);
      if (was === 'engage' && s.state === 'patrol' && s.launcher.reload > 0) c.verbaReloadSkipped++; this.verba.set(s, s.state); }
    if (a.freeLook.held) c.freeLookFrames++;
    if (p.pos && now.alive && p.alive) { const step = now.pos.distanceTo(p.pos); if (step < 20) c.flightDistance += step; }   // set-up jumps excluded
    c.maxSpeedKmh = Math.max(c.maxSpeedKmh, a.flight.velocity.length() * 3.6);
    c.shots = Math.max(c.shots, a.stats.shots); c.hits = Math.max(c.hits, a.stats.hits); c.kills = Math.max(c.kills, a.stats.kills); c.deaths = Math.max(c.deaths, a.stats.deaths);
    c.botKills = Math.max(c.botKills, a.duel ? a.duel.kills : 0); c.botShots = Math.max(c.botShots, a.bots.reduce((s, t) => s + t.bot.shots, 0));
    const d = a.defense.stats, b = a.battle.stats;
    c.launches = Math.max(c.launches, d.launches); c.flaresUsed = Math.max(c.flaresUsed, d.flaresUsed); c.missileHits = Math.max(c.missileHits, d.hits + (d.grazes || 0)); c.launchersKilled = Math.max(c.launchersKilled, d.launchersKilled);
    c.soldiersKilled = Math.max(c.soldiersKilled, b.soldiersKilled); c.structuresDestroyed = Math.max(c.structuresDestroyed, b.structuresDestroyed); c.vehiclesDestroyed = Math.max(c.vehiclesDestroyed, b.vehiclesDestroyed);
    c.shotsAtHeli = Math.max(c.shotsAtHeli, b.shotsAtHeli); c.hitsOnHeli = Math.max(c.hitsOnHeli, b.hitsOnHeli); c.rocketsFired = Math.max(c.rocketsFired, b.rocketsFired || 0);
    c.ciwsShots = Math.max(c.ciwsShots, a.ciwsStats.shots || 0); c.ciwsHits = Math.max(c.ciwsHits, a.ciwsStats.hits || 0);
    c.towersCaptured = Math.max(c.towersCaptured, a.towers.filter(t => t.captured).length);
    c.hudOps = this.page.hudOps(); c.audioOps = this.page.audioOps; c.gameDraws = this.page.counters.gameDraws; c.timersRun = this.page.counters.timersRun;
    this.prev = now;
  }
}

// ---- the scripts: each receives the pilot and loops until the frame budget stops it ----
const nearest = (pl, list) => { const f = pl.app.flight.position; let best = null, d = Infinity; for (const x of list) { const q = x.pos.distanceTo(f); if (q < d) { d = q; best = x; } } return best; };
const aliveTargets = pl => pl.app.targets.filter(t => t.active && !t.bot && !t.convoy && !t.tower && !t.aa && !t.ciws && !pick(t, 'samSiteOf')).map(t => ({ t, pos: t.group.position }));
const aimSoldier = (pl, s) => () => s.alive ? s.position.clone().add(pl.V(0, s.pose === 'prone' ? .3 : 1.1, 0)) : null;

// Key autopilot through the real bindings (collective W / Shift, pitch S / ArrowUp, roll with the mouse buttons, yaw
// A / D) plus small mouse corrections: holds a height above the ground (looking 3 s ahead), a nose-down cruise
// attitude, and banks toward a waypoint. Bang-bang with dead bands: crude, deterministic, and it keeps the helicopter
// flying through the regimes of real play (climb, cruise, turns, speed changes).
async function cruise(pl, frames, { agl = 70, pitch = -8, to = null, sweep = true } = {}) {
  const held = new Set(), want = (code, on) => { if (on && !held.has(code)) { held.add(code); code.startsWith('Mouse') ? pl.page.mouseButton(+code.slice(5), true) : pl.hold(code); }
    if (!on && held.has(code)) { held.delete(code); code.startsWith('Mouse') ? pl.page.mouseButton(+code.slice(5), false) : pl.release(code); } };
  let i = 0;
  try {
    return await pl.frames(frames, () => {
      if (!pl.app.running) return;   // no control while the session is stopped; the frames still run
      i++; const f = pl.app.flight, a = f.attitude(), p = f.position, v = f.velocity;
      const ahead = Math.max(pl.terrain(p.x, p.z), pl.terrain(p.x + v.x * 3, p.z + v.z * 3), pl.terrain(p.x + v.x * 6, p.z + v.z * 6)), h = p.y - ahead;
      want('KeyW', h < agl - 10 || v.y < -6); want('ShiftLeft', h > agl + 40 && v.y > -3);
      const dp = h < 25 ? 6 : pitch; want('ArrowUp', a.pitch > dp + 3); want('KeyS', a.pitch < dp - 3);
      let bank = 0; if (to) { const target = typeof to === 'function' ? to() : to, brg = Math.atan2(target.x - p.x, -(target.z - p.z)) * 180 / Math.PI; let e = brg - a.heading; e = ((e + 540) % 360) - 180; bank = Math.max(-25, Math.min(25, e * .8)); }
      want('Mouse2', a.bank < bank - 6); want('Mouse0', a.bank > bank + 6);
      if (sweep) pl.page.mouseMove(Math.round(3 * Math.sin(i / 37)), Math.round(2 * Math.cos(i / 53)));
    });
  } finally { for (const c of [...held]) want(c, false); }
}
async function flightTour(pl, seconds) {
  // Real input: climb, then the key autopilot down the valley with mouse sweeps.
  pl.hold('KeyW'); await pl.frames(120); pl.release('KeyW');
  const W = pl.W, z = pl.app.flight.position.z - 600;
  await cruise(pl, Math.round(seconds * 100) - 120, { to: pl.V(W.valleyX(z), 0, z) });
}
// Between engagements: a short leg of the autopilot (the helicopter keeps flying instead of hovering in place).
const leg = (pl, frames = 60, agl = 45) => cruise(pl, frames, { agl, pitch: -6 });
// Restart after the end of a session, wait out a wreck: the start of every loop round. A round that used no frame
// (every engagement refused) runs one, so that a loop always reaches the frame budget.
async function round(pl, tour = 2) {
  if (pl.ticks === pl.roundTicks) await pl.frames(1);
  pl.roundTicks = pl.ticks; if (await pl.ensureRunning()) await flightTour(pl, tour); await pl.waitAlive();
}

// The range modes (air, ground, mixed): bursts at the nearest live target, a view change once, resupply when a
// limited magazine runs dry.
function rangeScript({ tour, aimUp = 0, frames, dist, up, bearingStep, moving }) {
  return async pl => {
    await flightTour(pl, tour);
    for (let k = 0; ; k++) {
      await round(pl);
      if (k === 6) { await pl.tap('KeyE'); await leg(pl, 200); await pl.tap('KeyE'); }
      if (!pl.app.run.unlimitedAmmo && pl.app.ammo <= 0) { await pl.resupply(); continue; }
      const tg = nearest(pl, aliveTargets(pl)); if (!tg) { await leg(pl, 100); continue; }
      const prev = tg.t.previous;
      await pl.burst(() => { if (!tg.t.active) return null; const pos = tg.t.group.position.clone().add(pl.V(0, tg.t.air ? 0 : aimUp, 0));
        const v = moving === 'motion' ? tg.t.motion && tg.t.motion.velocity : moving === 'previous' && prev ? tg.t.group.position.clone().sub(prev).multiplyScalar(120) : null; return pl.lead(pos, v); },
      { frames, dist, up, bearing: k * bearingStep });
      await leg(pl);
    }
  };
}
const SCRIPTS = {
  air: rangeScript({ tour: 6, frames: 220, dist: 150, up: 10, bearingStep: 1, moving: 'motion' }),
  ground: rangeScript({ tour: 5, aimUp: .8, frames: 250, dist: 170, up: 45, bearingStep: 2, moving: null }),
  mixed: rangeScript({ tour: 5, aimUp: .8, frames: 200, dist: 160, up: 25, bearingStep: 3, moving: 'previous' }),
  'air-cross': rangeScript({ tour: 3, frames: 220, dist: 150, up: 10, bearingStep: 1, moving: 'motion' }),
  async free(pl) {
    // Take-off from the pad, climb, cruise with the mouse, free look (Alt held), chase view, recentre (X), restart (R),
    // then laps of the valley until the budget.
    const W = pl.W, at = z => pl.V(W.valleyX(z), 0, z);
    pl.hold('KeyW'); await pl.frames(300); pl.release('KeyW');
    await cruise(pl, 1200, { agl: 60, pitch: -6, to: at(-900) });
    await pl.tap('KeyE');
    await cruise(pl, 1000, { agl: 80, pitch: -12, to: at(-1800) });
    pl.hold('AltLeft'); await cruise(pl, 150, { agl: 80, pitch: -8, to: at(-2000), sweep: false }); await pl.frames(1); pl.release('AltLeft');
    pl.hold('AltLeft'); await pl.frames(120, i => pl.page.mouseMove(6, i % 2 ? 2 : -1)); pl.release('AltLeft');
    await pl.tap('KeyX'); await pl.tap('KeyE');
    await cruise(pl, 1500, { agl: 70, pitch: -8, to: () => pl.V(W.PAD.x, 0, W.PAD.z) });
    await cruise(pl, 400, { agl: 40, pitch: 2, to: () => pl.V(W.PAD.x, 0, W.PAD.z) });
    await pl.tap('KeyR'); await pl.frames(100);
    pl.hold('KeyW'); await pl.frames(250); pl.release('KeyW');
    for (let k = 0; ; k++) { await round(pl); await cruise(pl, 800, { agl: 50 + 20 * (k % 3), pitch: -10, to: at(k % 2 ? 200 : -2200) }); }
  },
  async 'random-map'(pl) {
    pl.hold('KeyW'); await pl.frames(250); pl.release('KeyW');
    const W = pl.W, at = z => pl.V(W.valleyX(z), 0, z);
    for (let k = 0; ; k++) { await round(pl); await cruise(pl, 600, { agl: 60, pitch: -9, to: at(k % 2 ? 0 : -1800) }); }
  },
  async towers(pl) {
    for (let pass = 0; ; pass++) {
      await round(pl); await flightTour(pl, pass ? 2 : 4);
      for (const tower of pl.app.towers) {
        // Rounds of the two guns cross on the nose line at the 300 m convergence: a soldier-sized target is shot from
        // about 280 m (at 110 m each gun passes 0.9 m to its side of the aim point).
        for (let k = 0; k < 6; k++) {
          const def = pl.app.targets.filter(t => t.tower === tower && t.active)[0]; if (!def) break;
          if (!(await pl.burst(() => def.active ? def.group.position.clone().add(pl.V(0, .9, 0)) : null, { frames: 300, dist: 280, up: 60, bearing: k }))) await leg(pl, 30);
        }
        // Hold above the cleared roof: 10 s within 5-25 m, under 40 km/h (a slow orbit keeps the helicopter moving).
        pl.hover(pl.V(tower.x + 4, tower.height + 14, tower.z + 4)); pl.face(pl.V(tower.x + 4 - 100, tower.height + 14, tower.z + 4));
        await pl.frames(1080, i => { if (!pl.app.running) return false; const f = pl.app.flight; if (i % 25 === 0) { f.velocity.multiplyScalar(.5); f.velocity.x += Math.sin(i / 150) * 1.5; f.velocity.z += Math.cos(i / 150) * 1.5; if (f.position.y > tower.height + 20) pl.release('KeyW'); } });
        if (!pl.app.running) break;
      }
      if (pl.app.running) await leg(pl, 100);
    }
  },
  async missiles(pl) {
    await flightTour(pl, 4);
    const D = () => pl.app.defense, live = () => D().launchers.filter(x => !x.dead);
    for (let k = 0; ; k++) {
      await round(pl);
      // Engagements: hover 700 m from a live launcher at 120 m above its site, drifting; flares on every other missile.
      if (k % 3 !== 2) {
        const l = live()[k % Math.max(1, live().length)]; if (!l) { await leg(pl, 150); continue; }
        const p = pl.spot(l.eye.clone(), 700, 120, k) || pl.V(l.eye.x + 700, l.eye.y + 120, l.eye.z); pl.hover(p, l.eye, pl.V(Math.cos(k), 0, Math.sin(k)).multiplyScalar(3));
        let flared = false;
        await pl.frames(900, () => {
          if (!pl.app.running || !pl.app.heliAlive) return false;
          const m = D().missiles.find(q => q.target === 'heli' && q.ignited);
          if (k % 2 === 0 && m && !flared) { const ttg = pl.page.window.HeliMissiles.timeToGo(m, pl.app.flight); if (ttg !== null && ttg < 1.6) { pl.tap('KeyV'); flared = true; } }
          pl.steer(l.eye, 1.5, 10);
        });
        pl.release('KeyV');
      } else {
        // Shoot a gunner of a launcher.
        const l = live().find(x => x.unit && x.unit.soldier && x.unit.soldier.alive); if (!l) { await leg(pl, 150); continue; }
        if (!(await pl.burst(aimSoldier(pl, l.unit.soldier), { frames: 250, dist: 240, up: 25, bearing: k }))) await leg(pl, 60);
      }
    }
  },
  async 'missiles-destroy'(pl) {
    await flightTour(pl, 3);
    const D = () => pl.app.defense;
    for (let k = 0; ; k++) {
      await round(pl);
      const l = D().launchers.find(x => !x.dead && x.unit && x.unit.soldier && x.unit.soldier.alive); if (!l) { await leg(pl, 100); continue; }
      if (!(await pl.burst(aimSoldier(pl, l.unit.soldier), { frames: 250, dist: 220, up: 25, bearing: k }))) await leg(pl, 60);
      await leg(pl, 40);
    }
  },
  async assault(pl) {
    await flightTour(pl, 3);
    const B = () => pl.app.battle;
    // Hover near a camp to draw return fire (drifting), then destroy structures, soldiers and trucks in turn.
    const c0 = B().camps[0]; pl.hover(pl.V(c0.x + 120, c0.y + 60, c0.z), pl.V(c0.x, c0.y, c0.z), pl.V(0, 0, 3)); await pl.frames(500, () => { pl.app.flight.velocity.multiplyScalar(.995); });
    for (let k = 0; ; k++) {
      await round(pl);
      let done = false;
      if (k % 3 !== 2) { const st = B().structures.find(s => s.alive); if (st) { const box = st.boxes[0], c = box.min.clone().add(box.max).multiplyScalar(.5); done = await pl.burst(() => st.alive ? c : null, { frames: 260, dist: 150, up: 30, bearing: k, owner: st }); } }
      if (!done) { const s = B().soldiers.find(q => q.alive && q.state !== 'inside'); if (s) done = await pl.burst(aimSoldier(pl, s), { frames: 180, dist: 230, up: 30, bearing: k }); }
      if (!done) { const truck = pl.app.targets.find(t => t.convoy && t.active); if (truck) done = await pl.burst(() => truck.active ? truck.group.position.clone().add(pl.V(0, 1, 0)) : null, { frames: 260, dist: 160, up: 30, bearing: k }); }
      await leg(pl, done ? 40 : 120);
    }
  },
  async match(pl) {
    await flightTour(pl, 3);
    const W = pl.W, alive = () => pl.app.heliAlive;
    // A bot: fly at it without firing for 9 s (it engages: its rounds, our damage), then lead it and fire.
    { const b = pl.app.bots.find(t => t.active);
      if (b) { const f = b.bot.flight; await cruise(pl, 900, { agl: 60, pitch: 0, to: () => f.position });
        await pl.burst(() => b.active ? pl.lead(f.position, f.velocity) : null, { frames: 300, dist: 220, up: 15, bearing: 1 }); await pl.waitAlive(600); } }
    // Soldiers in the open and a structure of the hot camp.
    const standing = () => pl.app.battle.soldiers.find(q => q.alive && q.state !== 'inside' && q.position.y > pl.terrain(q.position.x, q.position.z) - 1);
    for (let k = 0; k < 2; k++) { const s = standing(); if (!s) break; await pl.burst(aimSoldier(pl, s), { frames: 200, dist: 260, up: 30, bearing: k }); await pl.waitAlive(600); }
    const st = pl.app.battle.structures.find(s => s.alive);
    if (st) { const box = st.boxes[0], c = box.min.clone().add(box.max).multiplyScalar(.5); await pl.burst(() => st.alive ? c : null, { frames: 250, dist: 150, up: 30, owner: st }); }
    // A loss (crash dive), the wreck, the respawn over the helipad.
    await pl.waitAlive(600);
    { const f = pl.app.flight; pl.hover(pl.V(f.position.x, pl.terrain(f.position.x, f.position.z) + 40, f.position.z)); f.velocity.set(0, -30, -30); pl.hold('ShiftLeft'); await pl.frames(200, () => alive() ? undefined : false); pl.release('ShiftLeft'); }
    await pl.waitAlive(600); await pl.frames(50);
    // Land on the helipad, open the vendor (B), take one item out, close it (Escape).
    { const f = pl.app.flight; pl.hover(pl.V(W.PAD.x, pl.terrain(W.PAD.x, W.PAD.z) + 1.3, W.PAD.z)); f.onGround = true; f.collective = -1; }
    await pl.frames(60); await pl.tap('KeyB'); await pl.frames(30);
    if (!pl.hidden('shop')) {
      const inv = pl.page.el('inventory').children.find(b => typeof b.onclick === 'function'); if (inv) await pl.page.click(inv);
      await pl.frames(30); pl.page.key('Escape', true); pl.page.key('Escape', false); await pl.frames(30);
    }
    // Back in the air: the bots, the soldiers and the hot zone in turn until the budget.
    pl.hold('KeyW'); await pl.frames(250); pl.release('KeyW');
    for (let k = 0; ; k++) {
      await round(pl);
      const b = pl.app.bots.find(t => t.active), s = standing();
      if (k % 3 === 1 && b) { const f = b.bot.flight; await cruise(pl, 900, { agl: 60, pitch: 0, to: () => f.position }); continue; }   // exposure to a bot (see duel)
      if (k % 3 === 0 && b) { const f = b.bot.flight; await pl.burst(() => b.active ? pl.lead(f.position, f.velocity) : null, { frames: 300, dist: 220, up: 15, bearing: k }); }
      else if (s) await pl.burst(aimSoldier(pl, s), { frames: 200, dist: 260, up: 30, bearing: k });
      await cruise(pl, 300, { agl: 80, pitch: -8, to: () => pl.app.hot ? pl.app.hot.center : pl.V(W.PAD.x, 0, W.PAD.z - 800) });
    }
  },
  async duel(pl) {
    await flightTour(pl, 3);
    for (let k = 0; ; k++) {
      await round(pl);
      const b = pl.app.bots.find(t => t.active); if (!b) { await leg(pl, 150); continue; }
      const f = b.bot.flight;
      // Every other round the helicopter flies at the enemy without firing: a bot under fire breaks away, one that is
      // not attacks (its rounds, our damage).
      if (k % 2 === 1) { await cruise(pl, 900, { agl: 60, pitch: 0, to: () => f.position }); continue; }
      if (!(await pl.burst(() => b.active ? pl.lead(f.position, f.velocity) : null, { frames: 300, dist: 170, up: 15, bearing: k * 2 }))) await leg(pl, 60);
      await leg(pl, 40);
    }
  }
};
SCRIPTS['duel-behind'] = SCRIPTS.duel; SCRIPTS['duel-random'] = SCRIPTS.duel;
module.exports = { GOLDEN_BASE, GOLDEN_BINDINGS, SCENARIOS, SCRIPTS, REQUIRED, FRAMES, framesOf, Pilot, Coverage };
