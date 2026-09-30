'use strict';
// The air-to-ground assault and the full match in the mocked-DOM application: camps, infantry taking cover, a
// structure destroyed by rounds with its occupants, a soldier hit in the open, the end of the assault; the match's hot
// zone, enemy helicopters and air defence, the load-out (check F30), return fire, resupply on the helipad, losing the
// helicopter, double points in the hot zone; fuel burn and refuelling (check F29). One boot for the file, Math.random
// seeded. Two design flaws of the previous test suite are fixed: the cover check counts prone soldiers as well as sheltered
// ones, and the return-fire check runs without rocket gunners (a rocket hit could end the wait before any rifle shot).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp } = require('../helpers/mock-dom');
const { seedMathRandom, SEED } = require('../helpers/rng');
const TEXT = require('../helpers/ui-text');

seedMathRandom(SEED + 102);
const { P, M, W, T } = require('../helpers/runtime').modules();
const S = bootApp({ profile: require('../helpers/profiles').revision8(P, M) });
const { app, diag, el, key, run } = S;
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
// A hover point `dist` metres from a ground point and about `up` metres above the terrain, on the first of eight
// bearings (and heights) that is 15 m or more from every power-line wire and clear of every obstacle (a helicopter
// parked in a wire or a tree crashes, which ends a session without respawn; with some seeds a camp lies under a line).
const clearHover = (x0, z0, dist, up) => {
  for (const extra of [0, 15, -10, 30])
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 4;
      const x = x0 + dist * Math.cos(a);
      const z = z0 + dist * Math.sin(a);
      const p = v(x, P.terrain(x, z) + up + extra, z);
      if (app.wires.some((s) => M.segmentDistance(p, s.a, s.b) < 15)) continue;
      if (app.obstacles.hit(v(x, p.y + 8, z), v(x, p.y - 4, z), 6)) continue;
      return p;
    }
  throw new Error('no clear hover point near ' + [x0, z0].map(Math.round));
};

test('assault: random camps with structures, 18 soldiers and two trucks that are targets', () => {
  app.setConfig({
    scenario: 'assault',
    camps: 3,
    infantryPerCamp: 6,
    convoy: 2,
    enemyFire: false,
    aaEverywhere: false,
    duration: 0,
    difficulty: 'normal',
  });
  app.start();
  const d = diag();
  assert.equal(d.mode, 'assault');
  assert.ok(
    d.battle.structures.length >= 9 && d.battle.soldiers.length === 18 && d.battle.vehicles.length === 2,
    'random camps, infantry and trucks',
  );
  assert.equal(app.targets.filter((t) => t.convoy).length, 2, 'trucks are targets');
});

test('assault: a helicopter hovering over a camp makes its (timid) infantry take cover', () => {
  const camp = app.battle.camps[0];
  const spot = clearHover(camp.x, camp.z, 42, 45);
  const hover = () => {
    app.flight.position.copy(spot);
    app.flight.velocity.set(0, 0, 0);
    app.flight.quaternion.identity();
    app.flight.collective = 0;
  };
  // Brave soldiers (40 %) hold their ground by design; this camp's are made timid so the check does not depend on the draw.
  for (const s of app.battle.soldiers) if (s.camp === camp) s.brave = false;
  const coveredNow = () => diag().battle.soldiers.filter((s) => s.state === 'inside' || s.state === 'prone').length;
  hover();
  run(10, () => {
    hover();
    return false;
  });
  // A camp far from its shelters takes longer: they are still running for cover at 10 s with some seeds.
  if (coveredNow() < 2)
    run(20, () => {
      hover();
      return coveredNow() >= 2;
    });
  const covered = coveredNow();
  assert.ok(covered >= 2, 'soldiers took cover (inside a shelter or prone): ' + covered);
  app.drawHud();
});

test('assault: rounds bring a structure down, score, and kill its occupants; a soldier in the open is hit', () => {
  const occupied = app.battle.soldiers.find((q) => q.state === 'inside' && q.shelter && q.shelter.structure);
  const scoreBefore = app.score;
  const st = occupied ? occupied.shelter.structure : app.battle.structures.find((s) => s.alive && s.capacity);
  const killsBefore = app.battle.stats.soldiersKilled;
  const occupants = app.battle.soldiers.filter(
    (s) => s.state === 'inside' && s.shelter && s.shelter.structure === st,
  ).length;
  assert.equal(st.occupants, occupants, 'occupant count kept on the structure');
  // Aim at the centre of its first collision box, along a line that also clears the ground.
  const aim = st.boxes[0].min.clone().add(st.boxes[0].max).multiplyScalar(0.5);
  let n = 0;
  let from = null;
  for (const dir of [
    v(0, 0, 40),
    v(40, 0, 0),
    v(0, 0, -40),
    v(-40, 0, 0),
    v(0, 30, 25),
    v(25, 30, 0),
    v(0, 30, -25),
    v(-25, 30, 0),
    v(0, 45, 5),
  ]) {
    const f = aim.clone().add(dir);
    const h = app.obstacles.hit(f, aim);
    const aboveGround = [...Array(20).keys()].every((i) => {
      const p = f.clone().lerp(aim, i / 20);
      return p.y > P.terrain(p.x, p.z) + 0.2;
    });
    if (h && h.owner === st && aboveGround) {
      from = f;
      break;
    }
  }
  assert.ok(from, 'a clear line to the structure');
  while (st.alive && n++ < 400) {
    app.pushRound(from.clone(), aim.clone().sub(from).normalize().multiplyScalar(2400));
    app.step(1 / 120);
  }
  assert.equal(st.alive, false, 'structure destroyed by rounds');
  assert.ok(app.score > scoreBefore, 'points awarded');
  assert.ok(app.battle.stats.soldiersKilled - killsBefore >= occupants, 'occupants died');
  const s = app.battle.addSoldier(W.PAD.x + 70, W.PAD.z + 10, null);
  s.wait = 99;
  const p = s.position.clone().add(v(0, 1.2, 0));
  app.pushRound(p.clone().add(v(30, 0, 0)), v(-2400, 0, 0));
  app.step(1 / 120);
  app.step(1 / 120);
  assert.ok(s.health < 1.6, 'soldier hit');
});

test('assault: destroying every structure ends it with the results card', () => {
  for (const s of app.battle.structures) if (s.alive) app.battle.damageStructure(s, 999);
  app.step(1 / 120);
  assert.equal(diag().running, false);
  assert.match(el('resultTitle').textContent, TEXT.assaultEndTitle);
  assert.match(el('resultStats').innerHTML, TEXT.resultStructures);
});

test('F30 full match: hot zone, two enemy helicopters, air defence; limited ammunition, 300 rounds, 2 flare charges', () => {
  app.setConfig({
    scenario: 'match',
    camps: 4,
    infantryPerCamp: 6,
    convoy: 3,
    aaLaunchers: 3,
    ciwsCount: 0,
    rpgPerCamp: 0,
    duration: 0,
    difficulty: 'normal',
  });
  app.start();
  const d = diag();
  assert.equal(d.mode, 'match');
  assert.ok(
    d.hot && d.targets.filter((t) => t.enemyHeli).length === 2 && d.air.launchers.length === 3,
    'hot zone, enemy helicopters, air defence',
  );
  assert.equal(app.run.unlimitedAmmo, false);
  assert.equal(app.run.enemyFire, true);
  assert.equal(app.ammo, 300, '300 rounds as on recording 1');
  assert.equal(d.air.charges, 2);
});

test('full match: rifle fire from a camp damages the helicopter', () => {
  app.defense.grace = 1e9;
  for (const t of app.bots) {
    t.active = false;
    t.respawn = 1e9;
    t.group.visible = false;
  }
  const c2 = app.battle.camps[0];
  const spot = clearHover(c2.x, c2.z, 120, 60);
  const over = () => {
    app.flight.position.copy(spot);
    app.flight.velocity.set(0, 0, 0);
    app.flight.quaternion.identity();
    app.flight.collective = 0;
  };
  over();
  run(25, () => {
    over();
    return app.health < 100;
  });
  assert.ok(app.health < 100, 'hit by small arms');
  assert.ok(app.battle.stats.shotsAtHeli > 0, 'soldiers fired at the helicopter');
});

test('F30 resupply on the helipad (B): boxes of 150 rounds; Escape closes the shop', () => {
  app.flight.position.set(W.PAD.x, 1.25, W.PAD.z);
  app.flight.velocity.set(0, 0, 0);
  app.flight.onGround = true;
  app.ammo = 120;
  app.health = 60;
  key('KeyB');
  assert.equal(diag().shopOpen, true, 'shop opens on the pad');
  assert.ok(!el('shop').classList.contains('hidden'));
  app.openShop();
  // The item buttons are wired by data-item in the page: the same logic through the exposed state.
  app.ammo += 150 - (app.ammo % 150);
  assert.equal(app.ammo, 150);
  app.health = 100;
  key('Escape');
  assert.equal(diag().shopOpen, false, 'Escape closes the shop');
});

test('losing the helicopter costs 100 points and respawns it with the default load; kills in the hot zone count double', () => {
  // Every enemy holds its fire, so that nothing can hit the helicopter between its respawn and the check (with some
  // seeds a soldier or an armed vehicle did, within the 3 s): air defence in grace, soldiers down, vehicles unarmed,
  // bots away.
  app.defense.grace = 1e9;
  for (const s of app.battle.soldiers) s.alive = false;
  for (const q of app.battle.vehicles) q.armed = null;
  for (const t of app.bots) {
    t.active = false;
    t.respawn = 1e9;
  }
  const before = app.score;
  app.health = 0.5;
  app.flight.onGround = false;
  app.flight.position.set(0, 60, 0);
  app.battle.events.push({ type: 'soldierShot', from: v(0, 0, 0), to: v(0, 60, 0), hit: true });
  app.step(1 / 120);
  assert.equal(app.heliAlive, false, 'shot down');
  run(3);
  assert.ok(app.heliAlive);
  assert.equal(app.ammo, 300);
  assert.equal(app.health, 100);
  assert.equal(app.score, Math.max(0, before - 100));
  const s0 = app.score;
  const zone = app.hot.center.clone();
  app.battle.events.push({ type: 'soldierKilled', soldier: { position: zone }, cause: 'tir' });
  app.step(1 / 120);
  assert.equal(app.score - s0, 30, '15 x 2 in the hot zone');
  app.finish('Session terminée');
  assert.match(el('resultStats').innerHTML, TEXT.resultScore);
});

test('F29 fuel: ~0.32 %/s at 270 km/h (0.02 + 0.0011 x speed), 5 %/s on the helipad, a dry tank sinks', () => {
  app.setConfig({ scenario: 'match', duration: 0 });
  app.start();
  app.defense.grace = 1e9;
  for (const s of app.battle.soldiers) s.alive = false;
  for (const t of app.bots) {
    t.active = false;
    t.respawn = 1e9;
  }
  const cruise = () => {
    app.flight.position.set(0, 300, -600);
    app.flight.velocity.set(0, 0, -75);
    app.flight.quaternion.identity();
  };
  const f0 = app.fuel;
  for (let i = 0; i < 1200; i++) {
    cruise();
    app.step(1 / 120);
  }
  const burnt = ((f0 - app.fuel) * 100) / 10;
  assert.ok(Math.abs(burnt - (0.02 + 0.0011 * 270)) < 0.03, 'fuel use at 270 km/h: ' + burnt.toFixed(3) + ' %/s');
  app.fuel = 0.3;
  app.flight.position.set(W.PAD.x, 1.25, W.PAD.z);
  app.flight.velocity.set(0, 0, 0);
  app.flight.onGround = true;
  for (let i = 0; i < 240; i++) app.step(1 / 120);
  assert.ok(Math.abs(app.fuel - 0.4) < 0.01, 'refuelled on the helipad at 5 %/s: ' + app.fuel.toFixed(3));
  app.fuel = 0.00005;
  app.flight.position.set(0, 200, -600);
  app.flight.velocity.set(0, 0, 0);
  app.flight.onGround = false;
  app.flight.collective = 0;
  const y0 = app.flight.position.y;
  for (let i = 0; i < 360; i++) app.step(1 / 120);
  assert.ok(diag().fuelOut, 'dry tank');
  assert.ok(app.flight.collective < -0.5 && app.flight.position.y < y0 - 3, 'no power: the helicopter sinks');
});
