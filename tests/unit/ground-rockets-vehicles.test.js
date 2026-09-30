'use strict';
// Ground battle without a browser (ground.js): rocket gunners (RPG-7, MAAWS: values published by community databases,
// check F32), armed vehicles in the convoy (Humvee minigun, pickup M249), the factions of the camps, and the village
// houses and tower stairs as shelters. Every test runs with Math.random seeded (LB_TEST_SEED).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');
const { withSeededMathRandom, SEED } = require('../helpers/rng');
const NAMES = require('../helpers/names');

const T = load('vendor/three.min.js');
const P = load('physics.js');
const G = load('ground.js');
const W = load('world.js');
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const DT = 1 / 120;
const flat = () => 0;
const [FACTION_A, FACTION_B] = NAMES.factions;

const battleWith = (cfg) => {
  const field = new P.ObstacleField();
  const los = (a, b) => !field.hit(a, b, 0, new Set(['arbre']));
  return new G.Battlefield({ ...G.defaults, ...cfg }, { terrain: flat, field, los });
};
const heliAt = (x, y, z, vx = 0) => ({
  position: V(x, y, z),
  velocity: V(vx, 0, 0),
  quaternion: new T.Quaternion(),
  agl: y,
  alive: true,
  firing: false,
});
function run(b, heli, seconds, until) {
  for (let t = 0; t < seconds; t += DT) {
    b.step(DT, heli);
    if (heli.velocity) heli.position.addScaledVector(heli.velocity, DT);
    if (until) {
      const r = until(t);
      if (r) return { t, r };
    }
  }
  return null;
}
const gunner = (b, kind = 'rpg7', opts = {}) => {
  const s = b.addSoldier(0, 0, null, Math.random, { role: 'rpg', home: true, rocketKind: kind, rockets: 3, ...opts });
  s.brave = true;
  s.aimDelay = 0.8;
  return s;
};
const seeded = (k, fn) => () => withSeededMathRandom(SEED + 2000 + k, fn);

test('F32 the two launchers of the databases: RPG-7 100 m/s 110/12/2.5, MAAWS 230 m/s 100; ranges 300 and 400 m', () => {
  const R = G.ROCKETS;
  assert.deepEqual(
    [R.rpg7.speed, R.rpg7.direct, R.rpg7.blast, R.rpg7.full],
    [100, 110, 12, 2.5],
    'RPG-7 of the databases',
  );
  assert.deepEqual([R.maaws.speed, R.maaws.direct], [230, 100], 'MAAWS of the databases');
  assert.ok(R.rpg7.range >= 300 && R.maaws.range >= 400, 'effective ranges 300 m and 400 m');
  assert.equal(G.defaults.rpgPerCamp, 1);
  assert.equal(G.defaults.aaRockets, 1);
});

test(
  'rocket gunner cycle: shoulder (0.8 s), fire from the launcher toward the lead point, kneel and reload; aims above for the drop',
  seeded(1, () => {
    const b = battleWith({ enemyFire: true });
    const s = gunner(b);
    const heli = heliAt(0, 60, -200);
    let shot = null;
    const seen = new Set();
    const r = run(b, heli, 8, () => {
      seen.add(s.state);
      const e = b.events.find((q) => q.type === 'rocketFired');
      if (e) {
        shot = { ...e, pose: s.pose, weapon: s.weapon, raise: s.raise, state: s.state };
        return true;
      }
      b.events.length = 0;
      return false;
    });
    assert.ok(r && shot, 'the gunner fired');
    assert.ok(seen.has('aimrpg'), 'shouldered the launcher');
    assert.equal(shot.weapon, 'rpg');
    assert.equal(shot.raise, 1, 'launcher fully raised when firing');
    assert.equal(shot.kind, 'rpg7');
    assert.equal(shot.spec, G.ROCKETS.rpg7);
    assert.ok(r.t >= 0.78 && r.t < 3, 'fires once steady (0.8 s to raise the launcher)');
    const eye = s.position.clone().add(V(0, 1.5, 0));
    assert.ok(Math.abs(shot.from.distanceTo(eye) - 0.8) < 1e-6, 'rocket leaves the launcher 0.8 m ahead of his eye');
    const toHeli = heli.position.clone().sub(eye).normalize();
    assert.ok(shot.dir.dot(toHeli) > Math.cos((6 * Math.PI) / 180), 'aimed at the helicopter');
    assert.equal(s.state, 'reload');
    assert.equal(s.pose, 'kneel');
    assert.equal(s.rockets, 2);
    assert.equal(s.loaded, false);
    run(b, heli, G.ROCKETS.rpg7.reload + 0.5);
    assert.equal(s.loaded, true, 'reloaded after 5 s');
    assert.equal(b.stats.rocketsFired >= 1, true);
    // Aim above for the drop: over 25 shots the mean elevation error is positive (the scatter is +-2.2 deg).
    const b2 = battleWith({ enemyFire: true });
    let sum = 0;
    let n = 0;
    for (let k = 0; k < 25; k++) {
      const g = gunner(b2);
      const h = heliAt(0, 40, -300);
      run(b2, h, 4, () => {
        const e = b2.events.find((q) => q.type === 'rocketFired' && q.soldier === g);
        if (e) {
          const ey = g.position.clone().add(V(0, 1.5, 0));
          const th = h.position.clone().sub(ey).normalize();
          sum += Math.asin(e.dir.y) - Math.asin(th.y);
          n++;
          return true;
        }
        return false;
      });
      g.alive = false;
      b2.events.length = 0;
    }
    assert.ok(n >= 20 && sum / n > 0, 'aims above the helicopter at 300 m on average');
  }),
);

test(
  'a crossing helicopter: the rocket gunner leads it (more than 4 deg at 40 m/s and 250 m)',
  seeded(2, () => {
    const b = battleWith({ enemyFire: true });
    let lead = 0;
    let n = 0;
    for (let k = 0; k < 20; k++) {
      const s = gunner(b);
      const h = heliAt(-60, 50, -250, 40);
      run(b, h, 4, () => {
        const e = b.events.find((q) => q.type === 'rocketFired' && q.soldier === s);
        if (e) {
          const ey = s.position.clone().add(V(0, 1.5, 0));
          const th = h.position.clone().sub(ey);
          lead += Math.atan2(e.dir.x, -e.dir.z) - Math.atan2(th.x, -th.z);
          n++;
          return true;
        }
        return false;
      });
      s.alive = false;
      b.events.length = 0;
    }
    assert.ok(n >= 15, 'fired at the crossing helicopter');
    assert.ok(((lead / n) * 180) / Math.PI > 4, 'aims ahead along its path');
  }),
);

test(
  'rockets fly only when the ground fights back: not in the plain assault; yes in the air-defence drill',
  seeded(3, () => {
    const b = battleWith({ enemyFire: false, aaEverywhere: false, scenario: 'assault' });
    const s = gunner(b);
    const heli = heliAt(0, 60, -200);
    const r = run(b, heli, 10, () => b.events.some((e) => e.type === 'rocketFired'));
    assert.equal(r, null, 'no rocket in the plain assault');
    assert.equal(s.state, 'alert', 'he watches the helicopter');
    const d = battleWith({ enemyFire: false, scenario: 'missiles' });
    gunner(d);
    assert.ok(
      run(d, heliAt(0, 60, -200), 6, () => d.events.some((e) => e.type === 'rocketFired')),
      'rockets in the air-defence drill',
    );
  }),
);

test(
  'ranges: an RPG-7 gunner holds fire at 400 m, a MAAWS gunner fires; too close he runs',
  seeded(4, () => {
    const b = battleWith({ enemyFire: true });
    gunner(b, 'rpg7');
    assert.equal(
      run(b, heliAt(0, 60, -395), 8, () => b.events.some((e) => e.type === 'rocketFired')),
      null,
      'RPG-7: nothing at 400 m',
    );
    const c = battleWith({ enemyFire: true });
    gunner(c, 'maaws');
    assert.ok(
      run(c, heliAt(0, 60, -395), 8, () => c.events.some((e) => e.type === 'rocketFired')),
      'MAAWS at 400 m',
    );
    const d = battleWith({ enemyFire: true });
    const t = gunner(d, 'rpg7');
    run(d, heliAt(10, 20, -15), 1);
    assert.ok(['flee', 'prone', 'inside'].includes(t.state), 'helicopter right on him: he runs (' + t.state + ')');
  }),
);

test(
  "out of rockets: to the camp's dump, back with two",
  seeded(5, () => {
    const b = battleWith({ enemyFire: true });
    const camp = { id: 0, x: 0, z: 0, y: 0, structures: [] };
    b.camps.push(camp);
    const dump = b.addStructure('munitions', 30, 0, 0, camp);
    camp.structures.push(dump);
    const s = b.addSoldier(-10, 0, camp, Math.random, { role: 'rpg', rocketKind: 'rpg7', rockets: 0 });
    s.loaded = false;
    const heli = heliAt(0, 60, -250);
    const r = run(b, heli, 40, () => s.rockets > 0);
    assert.ok(r, 'resupplied');
    assert.equal(s.rockets, 2);
    assert.equal(s.loaded, true);
    assert.ok(s.position.distanceTo(dump.position) < 6, 'at the dump');
  }),
);

test(
  'F32 armed vehicles in the convoy: Humvee 22 HP minigun, pickup 12 HP M249, unarmed trucks; their points',
  seeded(6, () => {
    const b = battleWith({ enemyFire: true });
    b.generate(99, { camps: 0, soldiersPerCamp: 0, vehicles: 60 });
    const kinds = {};
    for (const v of b.vehicles) kinds[v.kind] = (kinds[v.kind] || 0) + 1;
    assert.ok(
      kinds.humvee >= 10 && kinds.pickup >= 10 && kinds.truck >= 10,
      'all three kinds: ' + JSON.stringify(kinds),
    );
    for (const v of b.vehicles) {
      assert.equal(v.armed, { humvee: 'minigun', pickup: 'm249', truck: null }[v.kind]);
      assert.equal(v.maxHealth, { humvee: 22, pickup: 12, truck: 18 }[v.kind]);
      assert.equal(v.points, v.kind === 'humvee' ? 120 : 70);
    }
  }),
);

function convoyFire(kind, distance, seconds = 30, cfg = { enemyFire: true }) {
  const b = battleWith(cfg);
  b.generate(7, { camps: 0, soldiersPerCamp: 0, vehicles: 0 });
  const v = {
    id: 1,
    z: -1000,
    dir: 1,
    speed: 0,
    kind,
    armed: kind === 'humvee' ? 'minigun' : kind === 'pickup' ? 'm249' : null,
    health: 20,
    maxHealth: 20,
    alive: true,
    position: V(),
    heading: 0,
    points: 70,
    burning: 0,
    fire: 0.5,
    burst: 0,
    sees: false,
    look: 0,
    firing: false,
    faction: FACTION_A,
  };
  b.vehicles.push(v);
  b.placeVehicle(v, 0);
  const heli = heliAt(v.position.x + distance, 60, v.position.z);
  let rounds = 0;
  let hits = 0;
  let shots = 0;
  let firing = 0;
  let streak = 0;
  let longest = 0;
  for (let t = 0; t < seconds; t += DT) {
    b.step(DT, heli);
    if (v.firing) {
      firing++;
      streak += DT;
      longest = Math.max(longest, streak);
    } else streak = 0;
    for (const e of b.events.splice(0)) {
      if (e.type === 'vehicleShot') {
        shots++;
        rounds += e.rounds;
        hits += e.hits;
        assert.equal(e.gun, v.armed);
        assert.ok(e.hits <= e.rounds);
      }
    }
  }
  return {
    shots,
    rounds,
    hits,
    firingShare: +((firing * DT) / seconds).toFixed(2),
    longestBurst_s: +longest.toFixed(2),
  };
}

test(
  'F32 vehicle guns: bursts in sight and range (minigun 650 m, M249 500 m), hits fall with distance, none without return fire or over the helipad',
  seeded(7, () => {
    const hNear = convoyFire('humvee', 150);
    const hFar = convoyFire('humvee', 560);
    const hOut = convoyFire('humvee', 700);
    const pNear = convoyFire('pickup', 150);
    const pOut = convoyFire('pickup', 540);
    const truck = convoyFire('truck', 150);
    const calm = convoyFire('humvee', 150, 20, { enemyFire: false });
    assert.ok(hNear.rounds > 100 && hNear.firingShare > 0.2, 'the Humvee gunner fires bursts');
    assert.ok(hNear.longestBurst_s >= 1.2, '"firing" (heard) held through a whole burst');
    assert.equal(hOut.rounds, 0, 'nothing beyond 650 m');
    assert.equal(pOut.rounds, 0, 'M249: nothing beyond 500 m');
    assert.ok(pNear.rounds > 30, 'the pickup gunner fires');
    assert.ok(
      hNear.rounds / hNear.shots === 5 && pNear.rounds / pNear.shots === 3,
      '5 minigun or 3 M249 rounds per tracer report (0.2 s)',
    );
    assert.ok(hNear.hits / hNear.rounds > hFar.hits / Math.max(1, hFar.rounds), 'more hits close in');
    assert.equal(truck.rounds, 0, 'trucks are unarmed');
    assert.equal(calm.rounds, 0, 'no fire without return fire');
    // The helipad is the player's base (respawn, rearming): a Humvee passing on the road holds fire there.
    const b = battleWith({ enemyFire: true });
    b.generate(7, { camps: 0, soldiersPerCamp: 0, vehicles: 0 });
    const hv = {
      id: 1,
      z: W.PAD.z - 150,
      dir: 1,
      speed: 0,
      kind: 'humvee',
      armed: 'minigun',
      health: 22,
      maxHealth: 22,
      alive: true,
      position: V(),
      heading: 0,
      points: 120,
      burning: 0,
      fire: 0.5,
      burst: 0,
      sees: false,
      look: 0,
      firing: false,
      faction: FACTION_A,
    };
    b.vehicles.push(hv);
    b.placeVehicle(hv, 0);
    let padShots = 0;
    const overPad = heliAt(W.PAD.x, 25, W.PAD.z);
    for (let t = 0; t < 20; t += DT) {
      b.step(DT, overPad);
      padShots += b.events.splice(0).filter((e) => e.type === 'vehicleShot').length;
    }
    assert.equal(padShots, 0, 'no fire on the helipad (safe zone)');
  }),
);

test(
  'factions: camps alternate between the two opposing factions; soldiers and vehicles follow; rocket gunners per camp',
  seeded(8, () => {
    const b = battleWith({ enemyFire: false, rpgPerCamp: 2 });
    b.factions = [FACTION_A, FACTION_B];
    b.generate(1234, { camps: 4, soldiersPerCamp: 6, vehicles: 4 });
    const cf = b.camps.map((c) => c.faction);
    assert.ok(cf.includes(FACTION_A) && cf.includes(FACTION_B), 'both factions');
    for (let i = 1; i < cf.length; i++) assert.notEqual(cf[i], cf[i - 1], 'alternating');
    for (const s of b.soldiers) assert.equal(s.faction, s.camp.faction, "soldiers wear their camp's faction");
    for (const c of b.camps) {
      assert.equal(
        b.soldiers.filter((s) => s.camp === c && s.role === 'rpg').length,
        2,
        'two rocket gunners per camp (menu)',
      );
    }
    const small = battleWith({ rpgPerCamp: 3 });
    small.generate(5, { camps: 2, soldiersPerCamp: 2, vehicles: 0 });
    for (const c of small.camps) {
      assert.equal(
        small.soldiers.filter((s) => s.camp === c && s.role === 'rpg').length,
        1,
        'never more than half the camp',
      );
    }
    const plain = battleWith({});
    plain.generate(5, { camps: 1, soldiersPerCamp: 3, vehicles: 1 });
    assert.ok(
      plain.soldiers.every((s) => s.faction === NAMES.defaultFaction),
      'default faction',
    );
  }),
);

test(
  'shelters: every village house (4 places, 10 in a block), the towers at the foot of their stairs; a soldier runs inside',
  seeded(9, () => {
    const b = battleWith({});
    const houses = b.shelters.filter((s) => s.kind === 'house');
    const towers = b.shelters.filter((s) => s.kind === 'tower');
    assert.equal(houses.length, W.HOUSES.length, 'one shelter per house');
    assert.equal(towers.length, W.TOWERS.length);
    for (let i = 0; i < houses.length; i++) assert.equal(houses[i].capacity, W.HOUSES[i].kind === 'block' ? 10 : 4);
    for (const t of towers)
      assert.ok(Math.abs(t.door.y - W.height(t.door.x, t.door.z)) < 0.05, 'tower door at the foot of the stairs');
    const door = houses[0].door;
    const s = b.addSoldier(door.x + 8, door.z + 6, null);
    s.brave = false;
    const heli = heliAt(door.x + 30, 25, door.z + 30);
    const r = run(b, heli, 15, () => s.state === 'inside');
    assert.ok(r, 'took cover in the house');
    assert.equal(s.shelter, houses[0]);
  }),
);
