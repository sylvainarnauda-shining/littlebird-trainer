'use strict';
// Ground battle (ground.js) without a browser: random camps with destructible structures, infantry taking cover in
// buildings and coming out, collapse and explosions, bullet hits on soldiers, return fire, road trucks. Draws that the
// module still takes from Math.random are seeded per test (LB_TEST_SEED).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');
const { withSeededMathRandom, lcg, SEED } = require('../helpers/rng');

const T = load('vendor/three.min.js');
const P = load('physics.js');
const W = load('world.js');
const G = load('ground.js');
const V = (x, y, z) => new T.Vector3(x, y, z);
const DT = 1 / 60;

function battlefield(cfg = {}) {
  const field = new P.ObstacleField();
  const los = (a, b) => {
    const d = b.clone().sub(a);
    const n = Math.max(6, Math.ceil(d.length() / 15));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (a.y + d.y * t < P.terrain(a.x + d.x * t, a.z + d.z * t) + 0.3) return false;
    }
    return !field.hit(a, b, 0, new Set(['arbre']));
  };
  return new G.Battlefield({ ...G.defaults, ...cfg }, { terrain: P.terrain, field, los });
}
const heliAt = (p, firing = false) => ({ position: p, velocity: V(0, 0, 0), firing, alive: true });
const seeded = (k, fn) => () => withSeededMathRandom(SEED + k, fn);

test(
  'generation: camps on open ground away from the helipad, 3+ solid structures each; seeds give different layouts',
  seeded(1, () => {
    const bf = battlefield().generate(42, { camps: 4, soldiersPerCamp: 6, vehicles: 3 });
    assert.equal(bf.camps.length, 4);
    for (const c of bf.camps) {
      assert.ok(Math.hypot(c.x - W.PAD.x, c.z - W.PAD.z) >= 450);
      assert.ok(c.structures.length >= 3);
    }
    for (const s of bf.structures) {
      const top = s.position.y + Math.max(...G.TYPES[s.type].boxes.map((b) => b[1]));
      assert.ok(
        bf.env.field.hit(V(s.position.x, top + 20, s.position.z), V(s.position.x, s.position.y - 1, s.position.z)),
        'solid ' + s.type,
      );
    }
    const other = battlefield().generate(7, { camps: 4 });
    assert.notDeepEqual(
      other.camps.map((c) => Math.round(c.x)),
      bf.camps.map((c) => Math.round(c.x)),
    );
  }),
);

test(
  'a helicopter overhead: soldiers take cover inside and cannot be hit there; after a calm period they come out',
  seeded(2, () => {
    const bf = battlefield().generate(3, { camps: 2, soldiersPerCamp: 8, vehicles: 0 });
    const camp = bf.camps[0];
    const heli = heliAt(V(camp.x, camp.y + 40, camp.z + 20));
    for (let t = 0; t < 14; t += DT) bf.step(DT, heli);
    const inside = bf.soldiers.filter((s) => s.camp === camp && s.state === 'inside').length;
    assert.ok(inside >= 3, 'soldiers took cover inside buildings: ' + inside);
    const hidden = bf.soldiers.find((s) => s.state === 'inside');
    const p = hidden.position.clone();
    assert.equal(
      bf.hitSoldier(p.clone().add(V(0, 1, -5)), p.clone().add(V(0, 1, 5))),
      null,
      'hidden soldier cannot be hit',
    );
    heli.position.set(camp.x + 2000, 300, camp.z);
    for (let t = 0; t < 40; t += DT) bf.step(DT, heli);
    const still = bf.soldiers.filter((s) => s.camp === camp && s.state === 'inside').length;
    assert.ok(still < inside, 'soldiers come out after the helicopter leaves');
  }),
);

test(
  'destroying a shelter kills its occupants; a fuel dump explosion kills the people around it',
  seeded(3, () => {
    const bf = battlefield().generate(11, { camps: 3, soldiersPerCamp: 8, vehicles: 0 });
    for (const c of bf.camps) {
      const heli = heliAt(V(c.x, c.y + 30, c.z));
      for (let t = 0; t < 12; t += DT) bf.step(DT, heli);
    }
    const shelter = bf.structures.find(
      (s) =>
        s.alive &&
        s.capacity &&
        bf.soldiers.some((q) => q.state === 'inside' && q.shelter && q.shelter.structure === s),
    );
    assert.ok(shelter, 'a shelter was occupied');
    const occ = bf.soldiers.filter((q) => q.state === 'inside' && q.shelter && q.shelter.structure === shelter).length;
    const before = bf.stats.soldiersKilled;
    bf.damageStructure(shelter, 99);
    assert.equal(bf.stats.soldiersKilled - before, occ, 'occupants die in the collapse');
    assert.ok(
      shelter.boxes.every((b) => b.off),
      'collapsed structure no longer solid',
    );
    const bf2 = battlefield().generate(5, { camps: 1, soldiersPerCamp: 0, vehicles: 0 });
    const dump = bf2.addStructure('carburant', bf2.camps[0].x + 60, bf2.camps[0].z, 0);
    const near = bf2.addSoldier(dump.position.x + 6, dump.position.z, null);
    const far = bf2.addSoldier(dump.position.x + 60, dump.position.z, null);
    bf2.damageStructure(dump, 99);
    assert.equal(near.alive, false, 'blast kills nearby');
    assert.equal(far.alive, true);
    assert.ok(bf2.events.some((e) => e.type === 'structureDestroyed' && e.explode));
  }),
);

test(
  "bullets against a soldier's capsule: torso hit, 1 m beside and above the head miss, two reference hits kill",
  seeded(4, () => {
    const bf = battlefield();
    const s = bf.addSoldier(100, -300, null);
    const p = s.position;
    assert.ok(bf.hitSoldier(p.clone().add(V(-30, 1.2, 0)), p.clone().add(V(30, 1.2, 0))), 'torso hit');
    assert.equal(bf.hitSoldier(p.clone().add(V(-30, 1.2, 1)), p.clone().add(V(30, 1.2, 1))), null, '1 m beside: miss');
    assert.equal(
      bf.hitSoldier(p.clone().add(V(-30, 2.3, 0)), p.clone().add(V(30, 2.3, 0))),
      null,
      'above the head: miss',
    );
    assert.equal(bf.damageSoldier(s, 1), false);
    assert.equal(bf.damageSoldier(s, 1), true, 'two reference hits kill');
  }),
);

test(
  'return fire (full match): soldiers in the open fire bursts; far or fast helicopters are harder to hit',
  seeded(5, () => {
    const rate = (dist, speed) => {
      let shots = 0;
      let hits = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const bf = battlefield({ enemyFire: true });
        const s = bf.addSoldier(0, -600, null);
        s.random = lcg(seed * 97);
        s.brave = true;
        const heli = {
          position: V(0, P.terrain(0, -600) + 60, -600 - dist),
          velocity: V(speed, 0, 0),
          firing: false,
          alive: true,
        };
        for (let t = 0; t < 20; t += DT) bf.step(DT, heli);
        shots += bf.stats.shotsAtHeli;
        hits += bf.stats.hitsOnHeli;
      }
      return { shots, rate: +(hits / Math.max(1, shots)).toFixed(3) };
    };
    const close = rate(150, 0);
    const far = rate(400, 0);
    const fast = rate(150, 60);
    assert.ok(close.shots > 40, 'soldiers fire bursts');
    assert.ok(close.rate > far.rate && close.rate > fast.rate, 'harder to hit far or fast helicopters');
    assert.ok(close.rate < 0.35);
  }),
);

test(
  'trucks drive the valley road and turn back at its ends',
  seeded(6, () => {
    const bf = battlefield().generate(9, { camps: 0, soldiersPerCamp: 0, vehicles: 4 });
    const v = bf.vehicles[0];
    const z0 = v.z;
    for (let t = 0; t < 10; t += DT) bf.step(DT, heliAt(V(0, 500, 0)));
    assert.ok(Math.abs(v.z - z0) > 80, 'vehicle moves');
    assert.ok(Math.abs(v.position.x - W.roadX(v.z)) < 3, 'on the road');
    v.z = 2195;
    v.dir = 1;
    for (let t = 0; t < 2; t += DT) bf.step(DT, heliAt(V(0, 500, 0)));
    assert.equal(v.dir, -1, 'turns back at the end of the road');
    assert.equal(bf.damageVehicle(v, v.maxHealth), true);
    assert.equal(bf.stats.vehiclesDestroyed, 1);
  }),
);
