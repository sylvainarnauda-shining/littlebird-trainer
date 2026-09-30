'use strict';
// The bot pilot (bot.js) in simulation, on the reference valley and the measured flight model: it flies the same Flight
// class as the player through the same four controls. No crash and ground clearance against hovering, fleeing,
// circling and evasive targets at every level; it engages and fires; the levels rank easy < normal < real in rounds
// passing within 3 m per minute; bot against bot without mid-air collision; perception delay; no fire without line of
// sight; patrol inside its home area beyond the detection range; climbs over a 90 m structure and a power-line wire.
// Every draw comes from the bots' and targets' own seeded generators.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');

const T = load('vendor/three.min.js');
const P = load('physics.js');
const W = load('world.js');
const B = load('bot.js');
const V = (x, y, z) => new T.Vector3(x, y, z);
const DT = 1 / 120;

const los = (a, b) => {
  const n = Math.ceil(a.distanceTo(b) / 40);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (W.height(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) > a.y + (b.y - a.y) * t - 2) return false;
  }
  return true;
};
function target(kind, seed = 7) {
  const z0 = -900;
  const x0 = W.valleyX(z0);
  const tg = {
    position: V(x0, W.height(x0, z0) + 60, z0),
    velocity: V(),
    forward: V(0, 0, -1),
    alive: true,
    firing: false,
  };
  const ev = new P.EvasiveMotion(tg.position, V(x0, W.height(x0, z0) + 70, z0), true, 55, seed);
  let t = 0;
  tg.step = (dt) => {
    t += dt;
    if (kind === 'hover') tg.velocity.set(0, 0, 0);
    else if (kind === 'valley') {
      const dir = Math.sin((t / 40) * Math.PI) >= 0 ? 1 : -1;
      const z = tg.position.z - 45 * dt * dir;
      const x = W.valleyX(z);
      tg.velocity.set((x - tg.position.x) / dt, 0, -45 * dir);
      tg.position.x = x;
      tg.position.z = z;
    } else if (kind === 'circle') {
      const w = 40 / 250;
      tg.velocity.set(-Math.sin(t * w) * 40, 0, -Math.cos(t * w) * 40);
    } else if (kind === 'evasive') {
      ev.step(dt, null);
      tg.velocity.copy(ev.velocity);
      tg.position.copy(ev.position);
    }
    if (kind === 'hover' || kind === 'circle') tg.position.addScaledVector(tg.velocity, dt);
    const g = W.height(tg.position.x, tg.position.z) + (kind === 'valley' ? 50 : 40);
    if (tg.position.y < g) {
      tg.velocity.y = (g - tg.position.y) / dt;
      tg.position.y = g;
    }
    if (tg.velocity.lengthSq() > 1) tg.forward.copy(tg.velocity).normalize();
  };
  return tg;
}
// Rounds of the same miniguns (800 m/s plus the bot's speed, gravity); a round counts as close when it passes within
// 3 m of the target's centre.
function rounds() {
  const list = [];
  let shots = 0;
  let near = 0;
  return {
    fire(f, n) {
      for (let r = 0; r < n; r++) {
        const fw = V(0, 0, -1).applyQuaternion(f.quaternion);
        list.push({
          p: f.position.clone().addScaledVector(fw, 2),
          v: fw.multiplyScalar(800).add(f.velocity),
          age: 0,
          best: 1e9,
        });
        shots++;
      }
    },
    step(dt, tp) {
      for (const b of list) {
        const a = b.p.clone();
        b.v.y -= 9.81 * dt;
        b.p.addScaledVector(b.v, dt);
        b.age += dt;
        const ab = b.p.clone().sub(a);
        const l = ab.lengthSq();
        const t = l ? Math.max(0, Math.min(1, tp.clone().sub(a).dot(ab) / l)) : 0;
        b.best = Math.min(b.best, a.addScaledVector(ab, t).distanceTo(tp));
      }
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].age > 1.5) {
          if (list[i].best < 3) near++;
          list.splice(i, 1);
        }
      }
    },
    get shots() {
      return shots;
    },
    get near() {
      return near;
    },
  };
}
function newBot(x, z, h, opts) {
  const f = new P.Flight({ ...P.defaults });
  f.reset(0);
  f.position.set(x, W.height(x, z) + h, z);
  return { f, bot: new B.BotPilot(f, { terrain: W.height, lineOfSight: los, ...opts }) };
}
function sim(kind, skill, secs = 75, seed = 3) {
  const sz = -1700;
  const { f, bot } = newBot(W.valleyX(sz) + 150, sz, 80, { skill, seed });
  const tg = target(kind, seed + 4);
  const gun = new P.Minigun({ ...P.defaults });
  const r = rounds();
  let first = null;
  let minAgl = 1e9;
  let t = 0;
  for (; t < secs; t += DT) {
    tg.step(DT);
    const out = bot.step(DT, tg);
    f.step(DT, out.input);
    if (f.crashed) break;
    minAgl = Math.min(minAgl, f.position.y - W.height(f.position.x, f.position.z));
    const n = gun.step(DT, out.fire);
    if (n && first === null) first = t;
    r.fire(f, n);
    r.step(DT, tg.position);
  }
  return { crashed: f.crashed, first, shots: r.shots, near: r.near, t, minAgl };
}

const perSkill = {};
for (const skill of ['easy', 'normal', 'real']) {
  test(`${skill} bots: no crash, clearance above 15 m, fire opened within 35 s and more than 50 rounds, against every target kind`, () => {
    perSkill[skill] = { shots: 0, near: 0, t: 0 };
    for (const kind of ['hover', 'valley', 'circle', 'evasive']) {
      for (const seed of [3, 11, 19]) {
        const s = sim(kind, skill, 75, seed);
        const tag = `${skill}/${kind}/${seed}`;
        assert.ok(!s.crashed, `${tag}: no crash`);
        assert.ok(s.minAgl > 15, `${tag}: ground clearance ${s.minAgl.toFixed(1)} m`);
        assert.ok(s.first !== null && s.first < 35, `${tag}: opens fire (${s.first})`);
        assert.ok(s.shots > 50, `${tag}: ${s.shots} rounds`);
        perSkill[skill].shots += s.shots;
        perSkill[skill].near += s.near;
        perSkill[skill].t += s.t;
      }
    }
  });
}

test('the levels rank easy < normal < real in rounds within 3 m per minute', () => {
  const rate = (k) => (perSkill[k].near / perSkill[k].t) * 60;
  assert.ok(
    rate('easy') < rate('normal') && rate('normal') < rate('real'),
    ['easy', 'normal', 'real'].map((k) => k + ' ' + rate(k).toFixed(1)).join(', '),
  );
});

test('bot against bot: they fight without colliding or crashing, both fire', () => {
  for (const seed of [5, 9]) {
    const za = -600;
    const zb = -1900;
    const A = newBot(W.valleyX(za), za, 70, { skill: 'normal', seed });
    const Bb = newBot(W.valleyX(zb) + 100, zb, 70, { skill: 'normal', seed: seed * 7 + 1 });
    const ga = new P.Minigun({ ...P.defaults });
    const gb = new P.Minigun({ ...P.defaults });
    const ra = rounds();
    const rb = rounds();
    let minD = 1e9;
    const view = (f, b) => ({
      position: f.position,
      velocity: f.velocity,
      forward: V(0, 0, -1).applyQuaternion(f.quaternion),
      alive: !f.crashed,
      firing: b.firing,
    });
    for (let t = 0; t < 120; t += DT) {
      const oa = A.bot.step(DT, view(Bb.f, Bb.bot));
      const ob = Bb.bot.step(DT, view(A.f, A.bot));
      A.f.step(DT, oa.input);
      Bb.f.step(DT, ob.input);
      assert.ok(!A.f.crashed && !Bb.f.crashed, 'duel: no crash');
      minD = Math.min(minD, A.f.position.distanceTo(Bb.f.position));
      ra.fire(A.f, ga.step(DT, oa.fire));
      rb.fire(Bb.f, gb.step(DT, ob.fire));
      ra.step(DT, Bb.f.position);
      rb.step(DT, A.f.position);
    }
    assert.ok(minD > 10, 'duel: no mid-air collision (closest ' + minD.toFixed(0) + ' m)');
    assert.ok(ra.shots > 100 && rb.shots > 100, 'both fire');
  }
});

test('perception delay: the bot sees where the target was 0.35 s ago, extrapolated to now', () => {
  const { bot } = newBot(W.valleyX(-900), -900, 80, { skill: 'normal' });
  const tg = { position: V(0, 100, -1500), velocity: V(50, 0, 0), alive: true };
  let seen;
  for (let i = 0; i < 240; i++) {
    bot.time += DT;
    tg.position.x += 50 * DT;
    seen = bot.perceive(tg);
  }
  const lagged = tg.position.x - 50 * 0.35;
  assert.ok(Math.abs(seen.p.x - tg.position.x) < 3, 'delayed state extrapolated to now');
  assert.ok(Math.abs(bot.history[0].p.x - lagged) < 2, 'history point 0.35 s old');
});

test('no line of sight: no fire', () => {
  const { f, bot } = newBot(W.valleyX(-1700), -1700, 80, { skill: 'real', lineOfSight: () => false });
  const tg = target('hover');
  let fired = 0;
  for (let t = 0; t < 40; t += DT) {
    tg.step(DT);
    const out = bot.step(DT, tg);
    f.step(DT, out.input);
    if (out.fire) fired++;
  }
  assert.equal(fired, 0, 'never fires at a hidden target');
});

test('beyond the detection range: patrol inside the home area', () => {
  const home = { x: W.valleyX(-2200), z: -2200, radius: 400 };
  const { f, bot } = newBot(home.x + 300, home.z, 80, { skill: 'normal', detectRange: 1300, home });
  const tg = target('hover');
  tg.position.set(W.valleyX(200), 60, 200);
  let out = 0;
  for (let t = 0; t < 90; t += DT) {
    const o = bot.step(DT, tg);
    f.step(DT, o.input);
    if (t > 30 && Math.hypot(f.position.x - home.x, f.position.z - home.z) > home.radius * 1.6) out++;
  }
  assert.equal(bot.mode, 'patrol');
  assert.equal(out, 0, 'stays in its patrol area');
  assert.ok(!f.crashed);
});

test('a 90 m structure in the way at 60 m above the ground: climbs over it', () => {
  const field = new P.ObstacleField();
  const z0 = -600;
  const x0 = W.valleyX(z0);
  const zc = -1000;
  const xc = W.valleyX(zc);
  const g = W.height(xc, zc);
  field.add(xc, g + 45, zc, 12, 90, 12, 'cheminee');
  const { f, bot } = newBot(x0, z0, 60, { skill: 'normal', obstacles: field });
  f.quaternion.setFromAxisAngle(V(0, 1, 0), Math.atan2(-(xc - x0), -(zc - z0)));
  f.velocity.set(xc - x0, 0, zc - z0).setLength(45);
  const tg = {
    position: V(W.valleyX(-1700), W.height(W.valleyX(-1700), -1700) + 40, -1700),
    velocity: V(),
    forward: V(0, 0, 1),
    alive: true,
    firing: false,
  };
  let struck = false;
  for (let t = 0; t < 40; t += DT) {
    const a = f.position.clone();
    const o = bot.step(DT, tg);
    f.step(DT, o.input);
    if (field.hit(a, f.position, 1.5)) struck = true;
  }
  assert.ok(!struck && !f.crashed, 'cleared the structure');
});

test('a power-line wire 32 m up in front of a low target: the attack climbs over it (kept clear, compared without the wire)', () => {
  const zw = -900;
  const wa = V(W.valleyX(zw) - 150, 0, zw);
  const wb = V(W.valleyX(zw) + 150, 0, zw);
  wa.y = W.height(wa.x, wa.z) + 32;
  wb.y = W.height(wb.x, wb.z) + 32;
  const dist = (p) => {
    const ab = wb.clone().sub(wa);
    const t = Math.max(0, Math.min(1, p.clone().sub(wa).dot(ab) / ab.lengthSq()));
    return wa.clone().addScaledVector(ab, t).distanceTo(p);
  };
  const wires = (a, b) => {
    const n = Math.max(2, Math.ceil(a.distanceTo(b) / 15));
    for (let i = 0; i <= n; i++) if (dist(a.clone().lerp(b, i / n)) < 12) return { fraction: i / n };
    return null;
  };
  const pass = (w) => {
    const z0 = -450;
    const { f, bot } = newBot(W.valleyX(z0), z0, 32, { skill: 'normal', wires: w, seed: 4 });
    f.velocity.set(0, 0, -40);
    const zt = -1080;
    const tg = {
      position: V(W.valleyX(zt), W.height(W.valleyX(zt), zt) + 18, zt),
      velocity: V(),
      forward: V(0, 0, 1),
      alive: true,
      firing: false,
    };
    let closest = 1e9;
    for (let t = 0; t < 25; t += DT) {
      const o = bot.step(DT, tg);
      f.step(DT, o.input);
      closest = Math.min(closest, dist(f.position));
      if (f.crashed) break;
    }
    return { closest, crashed: f.crashed };
  };
  pass(null);
  const seen = pass(wires);
  assert.ok(seen.closest > 6 && !seen.crashed, 'kept clear of the wire: ' + seen.closest.toFixed(1) + ' m');
});
