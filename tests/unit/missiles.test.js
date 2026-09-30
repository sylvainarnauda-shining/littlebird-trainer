'use strict';
// Surface-to-air model (missiles.js) without a browser: the values published by community databases (check F31: the
// man-portable launcher and the crewed emplacement fire the same 72 mm missile at 450 m/s, 20 m/s out of the tube,
// armed after 0.13 s, 1 000 m range, 200 of the 400 hull points on a direct hit, blast to 10.8 m, a 3 s emplacement
// cycle and no shot straight up from it), the seeker, tones, masking, flares, launchers, dodges, fuse and burn-out, the
// motor along the tube axis and the dud before arming. Every engagement is seeded through AirDefense.reset(sites, seed).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');

const T = load('vendor/three.min.js');
const M = load('missiles.js');
const DT = 1 / 120;
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const BASE = { ...M.defaults, aaLockRange: 1500 };

function makeEnv(ground = () => 0, hit = () => null) {
  return {
    terrain: ground,
    hit,
    los(a, b) {
      const d = b.clone().sub(a);
      const n = Math.max(6, Math.ceil(d.length() / 15));
      for (let i = 1; i < n; i++) {
        const t = i / n;
        if (a.y + d.y * t < ground(a.x + d.x * t, a.z + d.z * t) + 0.3) return false;
      }
      return true;
    },
  };
}
function heliAt(x, y, z, vx = 0, vz = 0) {
  const h = { position: V(x, y, z), velocity: V(vx, 0, vz), quaternion: new T.Quaternion(), agl: y, alive: true };
  if (vx || vz) h.quaternion.setFromUnitVectors(V(0, 0, -1), h.velocity.clone().normalize());
  return h;
}
function moveHeli(h, dt, ground = () => 0) {
  h.position.addScaledVector(h.velocity, dt);
  h.agl = h.position.y - ground(h.position.x, h.position.z);
}
const site = (x, z, y = 0, kind = 'manpads') => ({ x, y, z, kind });
function runUntil(air, heli, cond, maxT, ground) {
  for (let t = 0; t < maxT; t += DT) {
    air.step(DT, heli);
    moveHeli(heli, DT, ground);
    const r = cond(t);
    if (r) return { t, r };
  }
  return null;
}

test('F31 community-database values: 450 m/s, 20 m/s ejection, arming 0.13 s, one missile for both launchers, 3 s cycle; damage by distance', () => {
  assert.equal(M.defaults.aaMissileSpeed, 450);
  assert.equal(M.defaults.aaHitsToKill, 0, 'damage of the databases by default');
  assert.equal(M.constants.EJECT_SPEED, 20);
  assert.equal(M.constants.ARMING, 0.13);
  assert.equal(M.constants.SAM_RANGE, 1, 'the emplacement fires the Verba missile');
  assert.equal(M.constants.SAM_CYCLE, 3);
  assert.equal(M.missileDamage(0), 50, 'direct hit: 200 of the 400 hull points');
  assert.equal(M.missileDamage(2), 50, 'full damage within 2 m');
  assert.ok(Math.abs(M.missileDamage(6.4) - 25) < 1e-9, 'linear down to the edge of the blast');
  assert.equal(M.missileDamage(10.8), 0);
  assert.equal(M.missileDamage(20), 0);
  for (let d = 0; d < 12; d += 0.25)
    assert.ok(M.missileDamage(d + 0.25) <= M.missileDamage(d), 'never more damage farther out');
});

test('lock: operator reaction, then aaLockTime of continuous line of sight, then the launch and the ignition', () => {
  const cfg = { ...BASE };
  const air = new M.AirDefense(cfg, makeEnv());
  air.reset([site(0, 0)], 7);
  const heli = heliAt(800, 80, 0);
  const times = {};
  for (let t = 0; t < 12; t += DT) {
    air.step(DT, heli);
    for (const e of air.events.splice(0)) if (!(e.type in times)) times[e.type] = t;
  }
  assert.ok(times.acquire >= 0.39 && times.acquire <= 1.55, 'operator reaction before acquiring');
  assert.ok(Math.abs(times.lock - times.acquire - cfg.aaLockTime) < 0.05, 'lock after aaLockTime of line of sight');
  assert.ok(times.launch - times.lock >= 0.45 && times.launch - times.lock <= 1.15, 'launch after the lock delay');
  assert.ok(Math.abs(times.ignite - times.launch - M.constants.IGNITION) < 0.02, 'motor ignites after the ejection');
});

test('warning levels: beeping while acquiring, steady when locked and while the missile guides', () => {
  const air = new M.AirDefense({ ...BASE }, makeEnv());
  air.reset([site(0, 0)], 3);
  const heli = heliAt(900, 80, 0);
  const seen = new Set();
  runUntil(
    air,
    heli,
    () => {
      seen.add(air.warning + ':' + air.launchers[0].state + ':' + air.missiles.length);
      return air.missiles.length && air.warning === 2;
    },
    10,
  );
  assert.ok(seen.has('1:acquiring:0'), 'beeping while acquiring');
  assert.ok(
    [...seen].some((s) => s.startsWith('2:locked')),
    'steady tone once locked',
  );
  assert.equal(air.warning, 2, 'steady tone while the missile guides');
});

test('no lock below aaMinAltitude; the lock starts once the helicopter climbs; dropping low breaks it', () => {
  const air = new M.AirDefense({ ...BASE }, makeEnv());
  air.reset([site(0, 0)], 5);
  const heli = heliAt(700, 6, 0);
  assert.equal(
    runUntil(air, heli, () => air.warning > 0, 8),
    null,
    'no acquisition at 6 m',
  );
  heli.position.y = 25;
  assert.ok(
    runUntil(air, heli, () => air.warning > 0, 3),
    'acquisition at 25 m',
  );
  heli.position.y = 5;
  runUntil(air, heli, () => air.warning === 0, 2);
  assert.equal(air.stats.brokenAcquisitions, 1);
});

test('terrain masking: a ridge hides the helicopter; above the ridge the lock starts', () => {
  const ridge = (x) => (x > 300 && x < 400 ? 120 : 0);
  const ground = (x) => ridge(x);
  const air = new M.AirDefense({ ...BASE }, makeEnv(ground));
  air.reset([site(0, 0)], 9);
  const heli = heliAt(800, 80, 0);
  assert.equal(
    runUntil(air, heli, () => air.warning > 0, 6, ground),
    null,
    'hidden behind the ridge',
  );
  heli.position.y = 320;
  assert.ok(
    runUntil(air, heli, () => air.warning > 0, 3, ground),
    'visible above the ridge',
  );
});

function engagement(seed, flareTTG, speed = 50, { atLock = false, start = [0, 90, -1100] } = {}) {
  const cfg = { ...BASE, flareUnlimited: true };
  const air = new M.AirDefense(cfg, makeEnv());
  air.reset([site(0, 0)], seed);
  const heli = heliAt(start[0], start[1], start[2], speed, 0);
  let flared = false;
  let outcome = null;
  let launched = null;
  for (let t = 0; t < 25 && !outcome; t += DT) {
    air.step(DT, heli);
    moveHeli(heli, DT);
    if (atLock && !flared && air.launchers[0].state === 'locked') flared = air.deployFlares(heli);
    const m = air.missiles.find((q) => q.target === 'heli' && q.ignited);
    if (flareTTG !== null && m && !flared) {
      const ttg = M.timeToGo(m, heli);
      if (ttg !== null && ttg <= flareTTG) flared = air.deployFlares(heli);
    }
    for (const e of air.events.splice(0)) {
      if (e.type === 'launch') launched = t;
      if (e.type === 'hit') outcome = 'hit';
      if (e.type === 'miss') outcome = e.reason;
      if (outcome && launched !== null) outcome = { o: outcome, tof: t - launched };
    }
  }
  return outcome && outcome.o ? outcome : { o: outcome };
}
function rate(flareTTG, speed, n = 40, opt) {
  let hits = 0;
  let tof = 0;
  for (let s = 1; s <= n; s++) {
    const r = engagement(1000 + s * 17, flareTTG, speed, opt);
    if (r.o === 'hit') hits++;
    tof += r.tof || 0;
  }
  return { hit: hits / n, flight_s: +(tof / n).toFixed(2) };
}

test('a crossing helicopter without countermeasures is hit after about 3.3 s of flight over 1.1 km', () => {
  const r = rate(null, 50);
  assert.ok(r.hit >= 0.95, 'missile hits without countermeasures: ' + r.hit);
  assert.ok(r.flight_s > 2.8 && r.flight_s < 3.8, 'about 3.3 s of flight over 1.1 km at 450 m/s: ' + r.flight_s);
});

test('flares: decoy at 1.5 s to go, burnt out when fired at the lock tone, too late at 0.25 s, work in a hover', () => {
  const good = rate(1.5, 50);
  const atLock = rate(null, 50, 40, { atLock: true });
  const late = rate(0.25, 50);
  const hover = rate(1.5, 0);
  assert.ok(good.hit <= 0.1, 'flares 1.5 s before impact: missile decoyed');
  assert.ok(atLock.hit >= 0.7, 'flares at the lock tone, before the launch: burnt out when the missile comes');
  assert.ok(late.hit >= 0.6, 'flares 0.25 s before impact: too late');
  assert.ok(hover.hit <= 0.25, 'flares also work in a hover when fired in time');
});

test('terrain masking of a missile in flight: diving behind a ridge defeats most missiles', () => {
  const ground = (x) => (x > 800 && x < 850 ? 70 : 0);
  let masked = 0;
  for (let s = 1; s <= 20; s++) {
    const air = new M.AirDefense({ ...BASE }, makeEnv(ground));
    air.reset([site(0, 0)], 200 + s);
    const heli = heliAt(1000, 150, 0);
    runUntil(air, heli, () => air.missiles.length > 0, 10, ground);
    heli.velocity.set(0, -45, 0);
    const end = runUntil(
      air,
      heli,
      () => {
        if (heli.position.y < 30) heli.velocity.set(0, 0, 0);
        return air.events.find((q) => q.type === 'hit' || q.type === 'miss');
      },
      12,
      ground,
    );
    if (end && end.r.reason === 'terrain') masked++;
  }
  assert.ok(masked >= 16, 'hiding behind the ridge defeats most missiles: ' + masked);
});

test('flares: two charges, a cooldown between salvos, refill, six flares per salvo', () => {
  const air = new M.AirDefense({ ...BASE, flareCooldown: 12 }, makeEnv());
  air.reset([], 1);
  const heli = heliAt(0, 50, 0);
  assert.equal(air.deployFlares(heli), true);
  assert.equal(air.deployFlares(heli), false, 'cooldown');
  for (let t = 0; t < 12.1; t += DT) air.step(DT, heli);
  assert.equal(air.deployFlares(heli), true, 'second charge');
  for (let t = 0; t < 12.1; t += DT) air.step(DT, heli);
  assert.equal(air.deployFlares(heli), false, 'empty after 2 charges');
  air.refill();
  assert.equal(air.deployFlares(heli), true, 'refilled');
  assert.equal(air.stats.flaresUsed, 3);
  for (let t = 0; t < 0.5; t += DT) air.step(DT, heli);
  assert.equal(air.flares.length, 6, 'six flares per salvo');
});

test('concurrency limit: six launchers around a helicopter for 60 s never engage more than aaMaxConcurrent', () => {
  const air = new M.AirDefense({ ...BASE, flareUnlimited: true }, makeEnv());
  const sites = [];
  for (let i = 0; i < 6; i++) sites.push(site(Math.cos(i) * 900, Math.sin(i) * 900));
  air.reset(sites, 11);
  const heli = heliAt(0, 120, 0, 40, 0);
  let maxEngaged = 0;
  for (let t = 0; t < 60; t += DT) {
    air.step(DT, heli);
    heli.position.addScaledVector(heli.velocity, DT);
    if (heli.position.x > 600) heli.velocity.x = -40;
    if (heli.position.x < -600) heli.velocity.x = 40;
    maxEngaged = Math.max(maxEngaged, air.launchers.filter((l) => l.state !== 'idle').length);
    air.events.length = 0;
  }
  assert.ok(maxEngaged <= M.defaults.aaMaxConcurrent, 'no more simultaneous engagements than allowed');
});

test('F31 ranges: about 1 000 m, nothing under 100 m; the emplacement reaches as far (same missile)', () => {
  assert.equal(M.defaults.aaLockRange, 1000);
  assert.equal(M.defaults.aaMinRange, 100);
  const air = new M.AirDefense({ ...M.defaults }, makeEnv());
  air.reset([site(0, 0)], 21);
  assert.equal(
    runUntil(air, heliAt(1050, 80, 0), () => air.warning > 0, 5),
    null,
    'no lock at 1 050 m',
  );
  air.reset([site(0, 0)], 22);
  assert.ok(
    runUntil(air, heliAt(950, 80, 0), () => air.warning > 0, 3),
    'lock at 950 m',
  );
  air.reset([site(0, 0)], 23);
  assert.equal(
    runUntil(air, heliAt(70, 40, 0), () => air.warning > 0, 5),
    null,
    'nothing under 100 m',
  );
  air.reset([site(0, 0, 0, 'sam')], 24);
  assert.ok(
    runUntil(air, heliAt(950, 120, 0), () => air.warning > 0, 3),
    'emplacement at 950 m',
  );
  air.reset([site(0, 0, 0, 'sam')], 25);
  assert.equal(
    runUntil(air, heliAt(1050, 120, 0), () => air.warning > 0, 5),
    null,
    'emplacement: no lock at 1 050 m either',
  );
});

test('a unit must be ready (tube shouldered); losing readiness breaks the acquisition; a dead unit kills the launcher', () => {
  const unit = {
    alive: true,
    ready: false,
    eye: V(0, 1.5, 0),
    muzzle: V(0, 1.5, -1.1),
    axis: V(0, 0, -1),
    aligned: true,
  };
  const air = new M.AirDefense({ ...M.defaults }, makeEnv());
  air.reset([{ ...site(0, 0), unit }], 31);
  const heli = heliAt(600, 80, 0);
  assert.equal(
    runUntil(air, heli, () => air.warning > 0, 4),
    null,
    'no acquisition while the gunner is not ready',
  );
  unit.ready = true;
  assert.ok(
    runUntil(air, heli, () => air.launchers[0].state === 'acquiring', 3),
    'acquires once shouldered',
  );
  unit.ready = false;
  runUntil(air, heli, () => air.launchers[0].state === 'idle', 1);
  assert.equal(air.stats.brokenAcquisitions, 1, 'gunner scared off: acquisition broken');
  unit.ready = true;
  runUntil(air, heli, () => air.launchers[0].state === 'locked', 6);
  unit.alive = false;
  air.step(DT, heli);
  const e = air.events.find((q) => q.type === 'launcherKilled');
  assert.ok(air.launchers[0].dead && e && e.interrupted === 'locked', 'gunner killed while locked');
  assert.equal(air.warning, 0, 'tone stops');
});

test('F31 launch from the muzzle along the tube: 20 m/s ejection without thrust, then the motor along the tube', () => {
  const eye = V(0, 1.52, 0);
  const axis = V(1, 0.25, 0).normalize();
  const muzzle = eye.clone().addScaledVector(axis, 1.15);
  const unit = { alive: true, ready: true, eye, muzzle, axis, aligned: true };
  const air = new M.AirDefense({ ...M.defaults }, makeEnv());
  air.reset([{ ...site(0, 0), unit }], 41);
  const heli = heliAt(700, 170, 0);
  runUntil(air, heli, () => air.missiles.length > 0, 8);
  const m = air.missiles[0];
  assert.ok(m.origin.distanceTo(muzzle) < 1e-9, 'missile leaves the tube muzzle');
  const launched = air.events.find((e) => e.type === 'launch');
  assert.ok(launched.muzzle.distanceTo(muzzle) < 1e-9 && launched.axis.distanceTo(axis) < 1e-9);
  let t = 0;
  const speeds = [];
  while (!m.ignited && t < 1) {
    air.step(DT, heli);
    t += DT;
    speeds.push(m.velocity.length());
  }
  assert.ok(Math.abs(t - M.constants.IGNITION) < 0.02, 'ignition after the ejection');
  assert.ok(Math.max(...speeds.slice(0, -1)) < 21, 'no thrust during the ejection (20 m/s)');
  const out = m.position.distanceTo(muzzle);
  assert.ok(out > 3.5 && out < 5.5, 'motor lights about 4.4 m out: ' + out);
  const turned = (Math.acos(Math.min(1, m.velocity.clone().normalize().dot(axis))) * 180) / Math.PI;
  assert.ok(turned < 0.5, 'after ignition the missile flies along the tube, not along the sagging ejection path');
  for (let k = 0; k < 120; k++) air.step(DT, heli);
  assert.ok(m.velocity.length() > 400, 'boost to 450 m/s');
});

test('the operator leads a crossing helicopter; a turret must be aligned before it fires', () => {
  const air = new M.AirDefense({ ...M.defaults }, makeEnv());
  air.reset([site(0, 0)], 51);
  const heli = heliAt(0, 120, -800, 60, 0);
  air.step(DT, heli);
  const l = air.launchers[0];
  const toHeli = heli.position.clone().sub(l.eye).normalize();
  const toLead = l.lead.clone().sub(l.eye).normalize();
  const lead = (Math.acos(toHeli.dot(toLead)) * 180) / Math.PI;
  assert.ok(lead > 3 && lead < 25, 'aims ahead of a crossing target: ' + lead);
  assert.ok(l.lead.x > heli.position.x, 'ahead along the flight path');
  const unit = { alive: true, ready: true, eye: V(0, 2, 0), muzzle: V(0, 2, -1.2), axis: V(0, 0, -1), aligned: false };
  const air2 = new M.AirDefense({ ...M.defaults }, makeEnv());
  air2.reset([{ ...site(0, 0, 0, 'sam'), unit }], 52);
  const h2 = heliAt(0, 150, -900);
  assert.ok(runUntil(air2, h2, () => air2.launchers[0].state === 'locked', 8));
  assert.equal(
    runUntil(air2, h2, () => air2.missiles.length > 0, 3),
    null,
    'no shot while the turret is off target',
  );
  unit.aligned = true;
  assert.ok(
    runUntil(air2, h2, () => air2.missiles.length > 0, 2),
    'fires once aligned',
  );
});

// Dodging without flares: a break across the line of sight from the launch, or very low flight.
function dodge(seed, { brk = null, A = 20, dir = 'perp', low = null, speed = 40 } = {}) {
  const air = new M.AirDefense({ ...M.defaults }, makeEnv());
  air.reset([site(0, 0)], seed);
  const h = heliAt(0, 90, -800, speed, 0);
  let t0 = null;
  let out = null;
  for (let t = 0; t < 30 && !out; t += DT) {
    air.step(DT, h);
    const m = air.missiles.find((q) => q.target === 'heli' && q.ignited);
    if (low !== null && air.missiles.length) h.position.y = Math.min(h.position.y, low);
    if (m && brk !== null && t0 === null) {
      const ttg = M.timeToGo(m, h);
      if (ttg !== null && ttg <= brk) {
        t0 = t;
        const l = m.position.clone().sub(h.position);
        l.y = 0;
        l.normalize();
        h.dir = dir === 'perp' ? V(-l.z, 0, l.x) : l.clone().negate();
        if (dir === 'perp' && h.dir.dot(h.velocity) < 0) h.dir.negate();
      }
    }
    if (t0 !== null) h.velocity.addScaledVector(h.dir, A * Math.min(1, (t - t0) / 1.2) * DT);
    moveHeli(h, DT);
    for (const e of air.events.splice(0)) {
      if (e.type === 'hit' || e.type === 'graze') out = e.type;
      if (e.type === 'miss') out = e.reason;
    }
  }
  return out;
}
function outcomes(opt, n = 40) {
  const c = {};
  for (let s = 1; s <= n; s++) {
    const o = dodge(1000 + s * 17, opt) || 'none';
    c[o] = (c[o] || 0) + 1;
  }
  return c;
}

test('hard manoeuvre: only a 2 g break across the line of sight from the launch shakes a 450 m/s missile', () => {
  const straight = outcomes({});
  const turning = outcomes({ brk: 99 });
  const mid = outcomes({ brk: 2 });
  const late = outcomes({ brk: 1 });
  const wrong = outcomes({ brk: 99, dir: 'along' });
  assert.equal(straight.hit, 40, 'straight flight: always hit');
  assert.ok((turning.maneuver || 0) >= 6, '2 g break across the line of sight from the launch: a real chance');
  assert.ok((mid.maneuver || 0) <= 4, 'break started 2 s before impact: too late at 450 m/s');
  assert.ok((late.maneuver || 0) <= 4, 'break started 1 s before impact: too late for the roll-in');
  assert.ok((wrong.maneuver || 0) <= 4, 'turning toward or away from the missile does not help');
});

test('very low flight: the seeker loses the helicopter in the ground clutter (9 m little, 4 m often, 2 m mostly)', () => {
  const r9 = outcomes({ low: 9 });
  const r4 = outcomes({ low: 4 });
  const r2 = outcomes({ low: 2 });
  assert.ok((r9.clutter || 0) <= 4, '9 m: little effect');
  assert.ok((r4.clutter || 0) >= 12, '4 m: a good chance');
  assert.ok((r2.clutter || 0) >= 22, '2 m: most missiles lost');
});

test('fuse at the closest point of approach: fragments only beyond 2.5 m, nothing beyond 5 m', () => {
  const pass = (offset) => {
    const air = new M.AirDefense({ ...M.defaults }, makeEnv());
    air.reset([site(0, 0)], 61);
    const h = heliAt(0, 100, -300);
    air.launchers[0].lead.copy(h.position);
    air.launch(air.launchers[0], h);
    const m = air.missiles[0];
    m.position.set(offset, 100, -100);
    m.velocity.set(0, 0, -300);
    m.ignited = true;
    m.age = 1;
    m.target = null;
    m.blindUntil = 99;
    for (let t = 0; t < 2; t += DT) {
      air.step(DT, h);
      const e = air.events.find((q) => ['hit', 'graze', 'miss'].includes(q.type));
      if (e) return { type: e.type, distance: e.distance && +e.distance.toFixed(2) };
    }
    return null;
  };
  const near = pass(1);
  const mid = pass(3.5);
  const far = pass(6);
  assert.equal(near.type, 'hit');
  assert.ok(Math.abs(near.distance - 1) < 0.05, 'detonates at the closest point');
  assert.equal(mid.type, 'graze');
  assert.ok(Math.abs(mid.distance - 3.5) < 0.05);
  assert.ok(!far || far.type === 'miss', '6 m: flies past, no detonation');
});

test('motor burn-out: on a long shot at a helicopter running away the missile arrives much slower', () => {
  let hits = 0;
  let short = 0;
  const speeds = [];
  for (let s = 1; s <= 10; s++) {
    const air = new M.AirDefense({ ...M.defaults, aaLockRange: 1700 }, makeEnv());
    air.reset([site(0, 0, 0, 'sam')], 300 + s);
    const h = heliAt(0, 150, -1650);
    runUntil(air, h, () => air.missiles.length > 0, 8);
    h.velocity.set(0, 0, -75);
    const m = air.missiles[0];
    let last = 0;
    const end = runUntil(
      air,
      h,
      () => {
        if (m.alive) last = m.velocity.length();
        return air.events.find((q) => q.type === 'hit' || q.type === 'graze' || q.type === 'miss');
      },
      15,
    );
    if (end && end.r.type !== 'miss') {
      hits++;
      speeds.push(last);
    } else short++;
  }
  const vmax = M.defaults.aaMissileSpeed;
  assert.ok(hits + short === 10 && speeds.every((v) => v < 0.8 * vmax), 'slower than its top speed after the burn-out');
});

test('low long shots: with the 20 m/s ejection the motor pushes along the tube, so no missile ends in the ground', () => {
  const c = {};
  let n = 0;
  let firstGround = Infinity;
  for (const [alt, x0] of [
    [20, -950],
    [30, -900],
    [40, -800],
    [25, -700],
  ]) {
    for (let s = 1; s <= 10; s++) {
      const air = new M.AirDefense({ ...M.defaults, flareUnlimited: true }, makeEnv());
      air.reset([site(0, 0)], 500 + s + alt);
      const h = heliAt(0, alt, x0, 45, 0);
      let out = null;
      for (let t = 0; t < 20 && !out; t += DT) {
        air.step(DT, h);
        moveHeli(h, DT);
        const m = air.missiles[0];
        if (m && m.alive && m.ignited && m.age < 0.8 && m.position.y < 0.5) firstGround = Math.min(firstGround, m.age);
        for (const e of air.events.splice(0)) {
          if (e.type === 'hit' || e.type === 'graze') out = e.type;
          if (e.type === 'miss') out = e.reason + (e.how ? '/' + e.how : '');
        }
      }
      out = out || 'none';
      c[out] = (c[out] || 0) + 1;
      n++;
    }
  }
  assert.equal(firstGround, Infinity, 'no missile skims the ground after ignition');
  assert.ok(!Object.keys(c).some((k) => k.includes('ground')), 'no missile flies into the ground');
  assert.ok((c.hit || 0) + (c.graze || 0) >= 0.9 * n, 'low targets are hit: ' + JSON.stringify(c));
});

test('F31 the emplacement cannot aim straight up (cone above 77 deg is safe); a shouldered launcher can', () => {
  const above = heliAt(60, 400, 0);
  const sam = new M.AirDefense({ ...M.defaults }, makeEnv());
  sam.reset([site(0, 0, 0, 'sam')], 71);
  assert.ok(M.constants.SAM_MAX_ELEVATION * (180 / Math.PI) < Math.atan2(400 - 1.5, 60) * (180 / Math.PI));
  assert.equal(
    runUntil(sam, above, () => sam.warning > 0, 6),
    null,
    'emplacement: nothing in the cone above it',
  );
  const verba = new M.AirDefense({ ...M.defaults }, makeEnv());
  verba.reset([site(0, 0)], 72);
  assert.ok(
    runUntil(verba, heliAt(60, 400, 0), () => verba.warning > 0, 3),
    'a shouldered launcher can aim up',
  );
  const sam2 = new M.AirDefense({ ...M.defaults }, makeEnv());
  sam2.reset([site(0, 0, 0, 'sam')], 73);
  assert.ok(
    runUntil(sam2, heliAt(300, 300, 0), () => sam2.warning > 0, 3),
    'emplacement at 45 deg: lock',
  );
});

test('F31 cycles: the emplacement is ready again 3 s after a launch; a shouldered launcher needs aaReload', () => {
  for (const [kind, expect] of [
    ['sam', M.constants.SAM_CYCLE],
    ['manpads', M.defaults.aaReload],
  ]) {
    const air = new M.AirDefense({ ...M.defaults }, makeEnv());
    air.reset([site(0, 0, 0, kind)], 81);
    const h = heliAt(0, 120, -700);
    runUntil(air, h, () => air.missiles.length > 0, 10);
    assert.ok(Math.abs(air.launchers[0].reload - expect) < 1e-9, kind + ' reload ' + expect + ' s');
  }
});

test('F31 arming: cover struck within 2.6 m of the muzzle (0.13 s at 20 m/s) gives a dud, farther out it explodes', () => {
  const wallAt = (x) => (a, b) => ((a.x - x) * (b.x - x) <= 0 && a.y < 6 ? { fraction: 0 } : null);
  const shot = (x) => {
    const air = new M.AirDefense(
      { ...M.defaults },
      makeEnv(() => 0, wallAt(x)),
    );
    air.reset([site(0, 0)], 91);
    const h = heliAt(600, 40, 0);
    for (let t = 0; t < 12; t += DT) {
      air.step(DT, h);
      for (const e of air.events.splice(0)) if (e.type === 'miss') return { how: e.how, reason: e.reason };
    }
    return null;
  };
  const close = shot(2.2);
  const far = shot(4.6);
  assert.equal(close.how, 'dud', 'wall 1 m past the muzzle: dud');
  assert.equal(close.reason, 'terrain');
  assert.equal(far.how, 'obstacle', 'wall 3.4 m past the muzzle: armed, explodes');
});
