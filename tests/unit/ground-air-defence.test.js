'use strict';
// Ground air defence without a browser: ground.js soldiers carrying missiles.js launchers, wired as app.js does
// (unit = soldier + shouldered tube). The Verba gunner's cycle (patrol, shoulder, acquire, lock, fire from the tube,
// kneel to reload), suppression, brave gunners holding, resupply at the camp's dump, the crew of the surface-to-air
// emplacement and a rifleman taking the seat back, the roof gunner, and the body capsules of the new poses. Soldiers
// draw from lcg(SEED + k) (LB_TEST_SEED, fixed by default); Math.random is seeded as well for the draws ground.js still
// takes from it. The reload-race regression keeps its own fixed seed.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');
const { lcg, withSeededMathRandom, SEED } = require('../helpers/rng');

const T = load('vendor/three.min.js');
const P = load('physics.js');
const M = load('missiles.js');
const G = load('ground.js');
const Models = load('models.js');

const DT = 1 / 120;
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const models = Models.create(T);
const flat = () => 0;
const field = new P.ObstacleField();
const los = (a, b) => !field.hit(a, b, 0, new Set(['arbre']));

function world() {
  const battle = new G.Battlefield({ ...G.defaults, enemyFire: false }, { terrain: flat, field, los });
  const air = new M.AirDefense({ ...M.defaults }, { terrain: flat, los, hit: () => null });
  air.reset([], 7);
  return { battle, air };
}

// Same wiring as app.js armVerba(): the launcher follows the soldier's shouldered tube.
function arm(air, s, ammo = 3) {
  s.role = 'verba';
  s.weapon = 'tube';
  const unit = {
    soldier: s,
    get alive() {
      return s.alive;
    },
    get ready() {
      return s.alive && s.state === 'engage' && s.raise >= 1;
    },
    eye: V(),
    muzzle: V(),
    axis: V(0, 0, -1),
    aligned: true,
  };
  models.tubeMuzzle(s, unit.eye, unit.muzzle, unit.axis);
  const l = air.addLauncher({ id: 'v' + s.id, x: s.position.x, y: 0, z: s.position.z, kind: 'manpads', unit, ammo });
  l.range = air.range(l);
  l.minRange = air.minRange();
  s.launcher = l;
  return l;
}

function stepAll(w, heli, seconds, until) {
  for (let t = 0; t < seconds; t += DT) {
    w.battle.step(DT, heli);
    for (const l of w.air.launchers) {
      if (!l.dead && l.unit && l.unit.soldier)
        models.tubeMuzzle(l.unit.soldier, l.unit.eye, l.unit.muzzle, l.unit.axis);
    }
    w.air.step(DT, heli);
    if (until && until(t)) return t;
  }
  return null;
}

const heliAt = (x, y, z) => ({
  position: V(x, y, z),
  velocity: V(),
  quaternion: new T.Quaternion(),
  agl: y,
  alive: true,
  firing: false,
});

function gunner(w, seed, opts = {}) {
  const s = w.battle.addSoldier(opts.x || 0, opts.z || 0, opts.camp || null, lcg(seed), {
    role: 'verba',
    home: true,
    ...opts.extra,
  });
  s.brave = opts.brave ?? true;
  return s;
}
const seeded = (k, fn) => () => withSeededMathRandom(SEED + 1000 + k, fn);

describe('Verba gunner', () => {
  it(
    'shoulders the tube, locks, fires from the muzzle, then kneels to reload',
    seeded(1, () => {
      const w = world();
      const s = gunner(w, SEED + 1);
      const l = arm(w.air, s, 2);
      const heli = heliAt(0, 70, -600);
      const seen = new Set();
      const at = {};
      stepAll(w, heli, 14, () => {
        seen.add(s.state + ':' + l.state);
        for (const e of w.air.events.splice(0)) {
          if (e.type === 'launch')
            Object.assign(at, {
              muzzle: e.muzzle.clone(),
              axis: e.axis.clone(),
              pose: s.pose,
              weapon: s.weapon,
              raise: s.raise,
            });
        }
        return s.state === 'reload';
      });
      assert.ok(
        seen.has('engage:idle') && seen.has('engage:acquiring') && seen.has('engage:locked'),
        'engage, then acquire and lock while shouldered',
      );
      assert.equal(at.pose, 'aim');
      assert.equal(at.weapon, 'tube');
      assert.equal(at.raise, 1, 'tube fully raised when firing');
      const toHeli = heli.position.clone().sub(at.muzzle).normalize();
      assert.ok(at.muzzle.y > 1.5 && at.muzzle.y < 3, 'muzzle at shoulder height, tube raised');
      assert.ok(Math.hypot(at.muzzle.x, at.muzzle.z) < 1.6, 'muzzle next to the gunner');
      assert.ok(at.axis.dot(toHeli) > Math.cos((20 * Math.PI) / 180), 'tube aimed at the helicopter (with lead)');
      assert.equal(s.state, 'reload');
      assert.equal(s.pose, 'kneel');
      assert.equal(l.ammo, 1, 'one missile used');
      stepAll(w, heli, 1);
      assert.equal(s.weapon, 'none', 'new missile being fitted');
      stepAll(w, heli, M.defaults.aaReload);
      assert.notEqual(s.state, 'reload', 'reload finished');
    }),
  );

  // Regression of the ground.js reload race (about 1 launch in 30 before the declared fix R5.7): when the soldier's
  // periodic think tick (0.2-0.3 s) lands on the frame right after the launch, decideVerba() saw an idle launcher and
  // turned 'engage' into 'patrol' before the 'engage' branch started the reload. lcg(11) hits that frame.
  it('still kneels to reload when the think tick lands on the frame after the launch (R5.7)', () => {
    const w = world();
    const s = gunner(w, 11);
    const l = arm(w.air, s, 2);
    stepAll(w, heliAt(0, 70, -600), 14, () => s.state === 'reload');
    assert.equal(s.state, 'reload');
    assert.equal(l.ammo, 1);
  });

  it(
    'suppression: rounds landing close scare the timid gunners off; the brave ones keep acquiring',
    seeded(2, () => {
      let broken = 0;
      let kept = 0;
      for (let k = 0; k < 8; k++) {
        const w = world();
        const s = gunner(w, SEED + 100 + k, { brave: k >= 4 });
        const l = arm(w.air, s, 3);
        const heli = heliAt(0, 70, -600);
        stepAll(w, heli, 10, () => l.state === 'acquiring');
        w.battle.panic(s.position, 12);
        stepAll(w, heli, 1);
        if (l.state === 'idle' && s.state !== 'engage') broken++;
        else kept++;
      }
      assert.equal(broken, 4, 'the 4 timid gunners left their post');
      assert.equal(kept, 4, 'the 4 brave ones kept acquiring');
    }),
  );

  it(
    'dies with his launcher; kneeling and seated bodies are hit at their own heights',
    seeded(3, () => {
      const w = world();
      const s = gunner(w, SEED + 3);
      const l = arm(w.air, s, 3);
      const heli = heliAt(0, 70, -600);
      stepAll(w, heli, 10, () => l.state === 'locked');
      const hit = w.battle.hitSoldier(V(20, 1.4, 0), V(-20, 1.4, 0));
      assert.ok(hit && hit.soldier === s, 'round through a standing gunner');
      w.battle.damageSoldier(s, 2);
      stepAll(w, heli, DT);
      const e = w.air.events.find((q) => q.type === 'launcherKilled');
      assert.ok(l.dead && e && e.interrupted === 'locked', 'launcher dead with its gunner, lock interrupted');
      const k = w.battle.addSoldier(40, 0, null, lcg(SEED + 4));
      k.pose = 'kneel';
      k.state = 'reload';
      assert.ok(w.battle.hitSoldier(V(60, 1, 0), V(20, 1, 0)), 'kneeling body hit at 1 m');
      assert.equal(w.battle.hitSoldier(V(60, 1.8, 0), V(20, 1.8, 0)), null, 'over a kneeling body (standing height)');
      const c = w.battle.addSoldier(80, 0, null, lcg(SEED + 5), { role: 'crew' });
      c.position.set(80, 0.7, 0);
      assert.ok(w.battle.hitSoldier(V(100, 1.9, 0), V(60, 1.9, 0)), 'seated crew hit at chest height');
    }),
  );

  it(
    'out of missiles: walks to the camp dump and comes back with two',
    seeded(4, () => {
      const w = world();
      const camp = { id: 0, x: 0, z: 0, y: 0, structures: [] };
      w.battle.camps.push(camp);
      const dump = w.battle.addStructure('munitions', 30, 0, 0, camp);
      camp.structures.push(dump);
      const s = w.battle.addSoldier(-10, 0, camp, lcg(SEED + 6));
      const l = arm(w.air, s, 0);
      let arrived = null;
      stepAll(w, heliAt(0, 70, -2500), 40, (t) => {
        if (s.state === 'resupply' && !s.target && arrived === null) arrived = t;
        return l.ammo > 0;
      });
      assert.ok(arrived !== null && s.position.distanceTo(dump.position) < 6, 'went to the dump');
      assert.equal(l.ammo, 2, 'two missiles picked up');
    }),
  );

  it(
    'roof gunner stays on his roof and lies behind the parapet when scared',
    seeded(5, () => {
      const w = world();
      const roof = { y: 44, x0: -5, x1: 5, z0: -5, z1: 5 };
      const s = gunner(w, SEED + 7, { brave: false, extra: { roof } });
      arm(w.air, s, 3);
      const heli = heliAt(0, 120, -800);
      stepAll(w, heli, 6);
      assert.equal(s.position.y, 44);
      assert.ok(Math.abs(s.position.x) <= 5 && Math.abs(s.position.z) <= 5, 'within the roof');
      w.battle.panic(s.position, 12);
      stepAll(w, heli, 0.5);
      assert.equal(s.state, 'prone', 'prone behind the parapet');
      assert.equal(s.position.y, 44);
    }),
  );
});

describe('surface-to-air emplacement crew', () => {
  it(
    'stays seated; killed, a rifleman of the camp runs to the seat and takes it',
    seeded(6, () => {
      const w = world();
      const camp = { id: 0, x: 0, z: 0, y: 0, structures: [] };
      w.battle.camps.push(camp);
      const e = w.battle.addEmplacement(10, 10, camp);
      e.seat.set(10, 1.56, 10.6);
      const crew = w.battle.addCrew(e);
      assert.equal(crew.role, 'crew');
      assert.equal(crew.pose, 'sit');
      const r = w.battle.addSoldier(40, -20, camp, lcg(SEED + 8));
      const heli = heliAt(0, 70, -2500);
      stepAll(w, heli, 2);
      assert.equal(crew.state, 'crew', 'the crew stays seated');
      w.battle.damageSoldier(crew, 5);
      assert.equal(crew.alive, false);
      const t = stepAll(w, heli, 30, () => e.crew && e.crew.alive);
      assert.ok(e.crew === r && r.role === 'crew' && r.state === 'crew', 'a rifleman took the seat');
      assert.ok(t > 8 && t < 25, 'after a few seconds and a run: ' + t);
    }),
  );
});
