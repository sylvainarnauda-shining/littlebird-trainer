'use strict';
// Air defence in the mocked-DOM application with the values published by community databases (check F33): Verba
// gunners firing from their shouldered tube, the crewed surface-to-air emplacement (3 000 HP at -80 % = 416 reference
// hits, one missile in the tube reloaded in 3 s from a stock of 8), the manned 20 mm CIWS (5 000 HP = 694 reference
// hits, 224 m/s shells, 30 rounds/s, 15 % a hit, a blind cone overhead), two missiles to bring the helicopter down,
// RPG-7 rockets (direct hit 27.5 %, ground blast less). One boot for the file, Math.random seeded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp } = require('../helpers/mock-dom');
const { seedMathRandom, SEED } = require('../helpers/rng');
const NAMES = require('../helpers/names');
const TEXT = require('../helpers/ui-text');

seedMathRandom(SEED + 104);
const { P, M, G, W, T } = require('../helpers/runtime').modules();
const S = bootApp({ profile: require('../helpers/profiles').revision8(P, M) });
const { app, diag, el, run } = S;
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const samSites = () => app[NAMES.samSites];
const addSamSite = (...a) => app[NAMES.addSamSite](...a);
const hold = (x = 0, y = 70, z = 80) => {
  app.flight.position.set(x, y, z);
  app.flight.velocity.set(0, 0, 0);
  app.flight.quaternion.identity();
  app.flight.collective = 0;
  app.flight.onGround = false;
};

test('missile drill: every launcher is a Verba gunner or a crewed emplacement', () => {
  app.setConfig({
    scenario: 'missiles',
    aaLaunchers: 3,
    aaObjective: 'survive',
    duration: 0,
    difficulty: 'normal',
    flareUnlimited: true,
    aaRespawn: true,
  });
  app.start();
  const d = diag();
  assert.equal(d.air.launchers.length, 3);
  assert.ok(
    d.air.launchers.every((l) => l.unit === 'verba' || l.unit === NAMES.samUnitTag),
    'launchers are gunners or emplacements',
  );
  assert.ok(app.battle.soldiers.filter((s) => s.role === 'verba').length + samSites().length === 3);
});

let gunner = null;
test('a Verba gunner 500 m ahead fires from his shouldered tube; shot while reloading, his launcher dies with him (+150)', () => {
  app.resetAir();
  app.defense.grace = 0;
  const l = app.addVerba(0, -420, null, { home: true, ammo: 2 });
  const s = l.unit.soldier;
  s.brave = true;
  const h = () => hold(0, 70, 80);
  h();
  let m = null;
  let atLaunch = null;
  run(15, () => {
    h();
    if (app.defense.missiles.length) {
      m = app.defense.missiles[0];
      atLaunch = { pose: s.pose, weapon: s.weapon, muzzle: l.unit.muzzle.clone() };
      return true;
    }
    return false;
  });
  assert.ok(m, 'the gunner fired');
  assert.equal(atLaunch.pose, 'aim');
  assert.equal(atLaunch.weapon, 'tube');
  assert.ok(m.origin.distanceTo(atLaunch.muzzle) < 0.3, "missile out of the gunner's tube");
  assert.ok(
    m.origin.distanceTo(s.position) < 2.5 && m.origin.y - s.position.y > 1.3,
    'tube mouth 1.1 m ahead of his shoulder',
  );
  m.alive = false;
  app.step(1 / 120);
  const score0 = app.score;
  const chest = s.position.clone().add(v(0, 0.9, 0));
  const from = chest.clone().add(v(0, 18, 40));
  const dir = chest.clone().sub(from).normalize();
  app.pushRound(from, dir.multiplyScalar(900));
  for (let i = 0; i < 30 && s.alive; i++) app.step(1 / 120);
  app.step(1 / 120);
  assert.equal(s.alive, false, 'gunner hit');
  assert.ok(l.dead, 'launcher gone with him');
  assert.equal(app.score - score0, 150, 'Verba gunner +150');
  gunner = s;
});

test('F33 the crewed emplacement: seated crew, 416 reference hits (3 000 HP at -80 %), destroyed by rounds (+250), the wreck stays', () => {
  assert.ok(gunner, 'previous step ran');
  const h = () => hold(0, 70, 80);
  const tl = addSamSite(40, -420, null, 0);
  const u = samSites()[samSites().length - 1];
  const t = app.targets.find((q) => q[NAMES.samSiteOfTarget] === u);
  for (let i = 0; i < 120; i++) {
    h();
    app.step(1 / 120);
  }
  assert.equal(u.emp.crew.pose, 'sit');
  assert.ok(u.emp.crew.position.distanceTo(u.emp.seat) < 1, 'crew on the seat');
  assert.equal(Math.round(t.maxHealth), 416, '3 000 HP at -80 % = 416 reference hits');
  // One thin tube on a cradle 0.45 m above the turret plate: aim at the plate (0.6 m wide).
  const turretAim = u.view.turret.getWorldPosition(v()).add(v(0, 0.03, 0));
  const score1 = app.score;
  let n = 0;
  while (t.active && n++ < 700) {
    h();
    const to = turretAim.clone().sub(app.flight.position).normalize();
    app.pushRound(turretAim.clone().addScaledVector(to, -30), to.multiplyScalar(900));
    app.step(1 / 120);
  }
  app.step(1 / 120);
  assert.equal(t.active, false, 'emplacement destroyed by rounds');
  assert.equal(u.emp.alive, false);
  assert.ok(tl.dead, 'its launcher is gone');
  assert.ok(app.scene.children.includes(u.view.group), 'the wreck stays');
  assert.ok(app.score - score1 >= 250, 'emplacement +250');
});

test('a second emplacement: its crew shot from behind; in the drill nobody takes the seat back', () => {
  const h = () => hold(0, 70, 80);
  const tl2 = addSamSite(-40, -420, null, 0);
  const u2 = samSites()[samSites().length - 1];
  for (let i = 0; i < 120; i++) {
    h();
    app.step(1 / 120);
  }
  const crew = u2.emp.crew;
  const back = crew.position.clone().add(v(0, 1.3, 0));
  let n = 0;
  while (crew.alive && n++ < 60) {
    h();
    const f2 = u2.view.turret.getWorldQuaternion(new T.Quaternion());
    const behind = v(0, 0.4, 1).applyQuaternion(f2).multiplyScalar(30);
    app.pushRound(back.clone().add(behind), behind.clone().normalize().multiplyScalar(-900));
    app.step(1 / 120);
  }
  app.step(1 / 120);
  assert.equal(crew.alive, false, 'crew hit');
  assert.ok(tl2.dead, 'emplacement neutralised with its crew (drill)');
});

test('F33 near miss: fragments at 3.2 m damage the helicopter by the database blast (43 %) without downing it', () => {
  app.health = 100;
  app.defense.events.push({
    type: 'graze',
    missile: { position: app.flight.position.clone().add(v(3.2, 0, 0)) },
    distance: 3.2,
  });
  app.step(1 / 120);
  assert.ok(
    app.heliAlive && Math.abs(app.health - (100 - M.missileDamage(3.2))) < 1e-9,
    'fragments at 3.2 m: -' + M.missileDamage(3.2).toFixed(1) + ' %',
  );
});

test('full match: Verba gunners belong to camps and a crewed emplacement stands by a camp', () => {
  app.setConfig({
    scenario: 'match',
    camps: 4,
    infantryPerCamp: 6,
    convoy: 3,
    aaLaunchers: 3,
    duration: 0,
    difficulty: 'normal',
  });
  app.start();
  const d = diag();
  assert.equal(d.air.launchers.filter((l) => l.unit === NAMES.samUnitTag).length, 1);
  assert.equal(d.air.launchers.filter((l) => l.unit === 'verba').length, 2);
  assert.ok(app.battle.soldiers.filter((s) => s.role === 'verba' && s.camp).length === 2, 'gunners belong to camps');
  assert.ok(samSites()[0].emp.camp && samSites()[0].emp.crew.alive, 'emplacement manned at a camp');
});

test('F33 CIWS: manned 20 mm gun, 694 reference hits (5 000 HP), silent beyond its reach, 224 m/s shells, 15 % a hit, 500-round magazine', () => {
  app.setConfig({
    scenario: 'missiles',
    aaLaunchers: 1,
    ciwsCount: 1,
    aaObjective: 'survive',
    duration: 0,
    difficulty: 'normal',
    aaRespawn: true,
    flareUnlimited: true,
  });
  app.start();
  assert.equal(app.ciws.length, 1, 'one CIWS in the drill');
  assert.ok(app.ciws[0].emp.crew && app.ciws[0].emp.crew.alive, 'gunner at the console');
  const p0 = app.ciws[0].view.group.position;
  assert.ok(
    !app.obstacles.hit(v(p0.x, p0.y + 0.6, p0.z), v(p0.x, p0.y + 4, p0.z), 3),
    'placed clear of trees and structures',
  );
  app.resetAir();
  app.defense.grace = 1e9;
  const u = app.addCiws(0, -500, null, 0);
  const t = app.targets.find((q) => q.ciws === u);
  assert.equal(Math.round(t.maxHealth), 694, '5 000 HP at -80 % = 694 reference hits');
  const h = (z = 130, y = 80) => hold(0, y, z);
  h(-2100, 140);
  run(8, () => {
    h(-2100, 140);
    return false;
  });
  assert.equal(app.ciwsStats.shots, 0, 'silent beyond its reach');
  h();
  app.health = 100;
  let speed = 0;
  run(25, () => {
    h();
    if (!speed && app.enemyRounds.length) speed = app.enemyRounds[0].v.length();
    return app.ciwsStats.hits > 0 || !app.heliAlive;
  });
  assert.ok(app.ciwsStats.shots > 0 && Math.abs(speed - 224) < 1, 'fires 224 m/s shells: ' + speed);
  assert.ok(app.ciwsStats.hits > 0, 'hits the helicopter');
  assert.ok(
    !app.heliAlive || Math.abs((100 - app.health) / 15 - Math.round((100 - app.health) / 15)) < 1e-9,
    '15 % a hit',
  );
  if (!app.heliAlive) run(4);
  app.health = 100;
  u.ammo = 0;
  u.reloadTimer = 0;
  const reserve = u.reserve;
  h();
  app.step(1 / 120);
  assert.ok(u.reloadTimer > 4.9, 'reload started');
  for (let i = 0; i < 5.1 * 120; i++) {
    h();
    app.step(1 / 120);
  }
  assert.equal(u.ammo >= 450, true, 'magazine refilled');
  assert.equal(u.reserve, reserve - 500);
  // Its gunner shot: +80, the gun stays silent (no camp to send another).
  const crew = u.emp.crew;
  const score0 = app.score;
  let n = 0;
  while (crew.alive && n++ < 120) {
    h();
    const chest = crew.position.clone().add(v(0, 1.1, 0));
    const from = chest.clone().add(v(25, 6, 0));
    app.pushRound(from, chest.clone().sub(from).normalize().multiplyScalar(900));
    app.step(1 / 120);
  }
  app.step(1 / 120);
  assert.equal(crew.alive, false, 'gunner hit');
  assert.equal(app.score - score0, 80, 'CIWS gunner +80');
  const shots = app.ciwsStats.shots;
  run(8, () => {
    h();
    return false;
  });
  assert.equal(app.ciwsStats.shots, shots, 'silent without its gunner');
  // The gun itself: rounds into the turret destroy it (+300), the wreck stays.
  t.health = 3;
  const turret = u.view.turret.getWorldPosition(v()).add(v(0, 1, 0));
  const score1 = app.score;
  n = 0;
  while (t.active && n++ < 200) {
    h();
    const from = turret.clone().add(v(0, 10, 30));
    app.pushRound(from, turret.clone().sub(from).normalize().multiplyScalar(900));
    app.step(1 / 120);
  }
  assert.equal(t.active, false, 'CIWS destroyed');
  assert.ok(u.dead);
  assert.equal(app.score - score1, 300, 'CIWS +300');
  assert.ok(app.scene.children.includes(u.view.group), 'the wreck stays');
  app.finish('Session terminée');
  assert.match(el('resultDetail').textContent, TEXT.resultCiws);
});

test('full match: the CIWS stands beside a camp and is manned by it', () => {
  app.setConfig({
    scenario: 'match',
    camps: 4,
    infantryPerCamp: 4,
    convoy: 0,
    aaLaunchers: 3,
    ciwsCount: 1,
    duration: 0,
    difficulty: 'normal',
  });
  app.start();
  assert.equal(app.ciws.length, 1);
  const u = app.ciws[0];
  assert.ok(u.camp, 'belongs to a camp');
  assert.ok(Math.hypot(u.view.group.position.x - u.camp.x, u.view.group.position.z - u.camp.z) < 50, 'beside the camp');
  assert.ok(u.emp.crew.alive);
});

test('F33 database missiles: a direct hit takes 200 of the 400 hull points, a second one brings the helicopter down; the one-hit option', () => {
  app.setConfig({
    scenario: 'missiles',
    aaLaunchers: 1,
    aaObjective: 'survive',
    duration: 0,
    difficulty: 'normal',
    aaRespawn: true,
    flareUnlimited: true,
    aaHitsToKill: 0,
  });
  app.start();
  app.defense.grace = 1e9;
  hold();
  const hitNow = (dist) => {
    app.defense.events.push({ type: 'hit', missile: { position: app.flight.position.clone() }, distance: dist });
    app.step(1 / 120);
  };
  app.health = 100;
  hitNow(0);
  assert.ok(app.heliAlive && Math.abs(app.health - 50) < 1e-9, 'direct hit: -50 %');
  hitNow(1.5);
  assert.equal(app.heliAlive, false, 'second missile: shot down');
  run(4);
  assert.ok(app.heliAlive, 'respawned');
  app.setConfig({ aaHitsToKill: 1 });
  hold();
  app.health = 100;
  hitNow(0);
  assert.equal(app.heliAlive, false, 'one-hit option: one missile is enough');
  run(4);
  app.setConfig({ aaHitsToKill: 0 });
});

test('F33 RPG-7: a direct hit from 80 m takes 27.5 % (110 of 400); into the ground 6 m below, the blast takes 12-20 %', (t) => {
  app.setConfig({ scenario: 'missiles', aaLaunchers: 1, duration: 0, aaRespawn: true });
  app.start();
  app.resetAir();
  app.defense.grace = 1e9;
  hold();
  app.health = 100;
  // The app reads the battle's events while it has soldiers: one rifleman far away (the rockets below have no shooter).
  app.battle.addSoldier(W.PAD.x + 900, W.PAD.z + 700, null).wait = 1e9;
  const from = app.flight.position.clone().add(v(0, -6, -80));
  const dir = app.flight.position
    .clone()
    .add(v(0, 0.6, 0))
    .sub(from)
    .normalize();
  app.battle.events.push({ type: 'rocketFired', soldier: null, kind: 'rpg7', from, dir, spec: G.ROCKETS.rpg7 });
  let d = null;
  run(3, () => {
    hold();
    d = diag();
    return d.rockets.hits > 0 || !app.heliAlive;
  });
  assert.equal(d.rockets.fired, 1);
  assert.equal(d.rockets.hits, 1, 'direct hit');
  assert.ok(Math.abs(app.health - 72.5) < 1e-9, 'RPG-7: -27.5 % (' + app.health.toFixed(2) + ')');
  const low = () => hold(0, 6, 80);
  low();
  app.health = 100;
  const g0 = v(0, 22, 40);
  const aim = v(0, 0, 80);
  app.battle.events.push({
    type: 'rocketFired',
    soldier: null,
    kind: 'rpg7',
    from: g0,
    dir: aim.clone().sub(g0).normalize(),
    spec: G.ROCKETS.rpg7,
  });
  run(3, () => {
    low();
    return diag().rockets.flying === 0;
  });
  const blast = 100 - app.health;
  t.diagnostic('RPG-7 into the ground 6 m below: -' + blast.toFixed(1) + ' %');
  assert.ok(blast > 12 && blast < 20, 'blast only: ' + blast.toFixed(1) + ' %');
  assert.equal(diag().rockets.hits, 1, 'no direct hit');
});

test('F33 the emplacement: one missile in the tube and a stock of 8; the next missile is in the tube about 3 s after a launch', () => {
  app.setConfig({
    scenario: 'missiles',
    aaLaunchers: 1,
    ciwsCount: 0,
    aaObjective: 'survive',
    duration: 0,
    difficulty: 'normal',
    aaRespawn: true,
    flareUnlimited: true,
  });
  app.start();
  app.resetAir();
  app.defense.grace = 0;
  const l = addSamSite(0, -560, null, 0);
  const u = samSites()[samSites().length - 1];
  assert.deepEqual([...u.loaded], [true]);
  assert.equal(l.ammo, 8);
  hold();
  let launched = null;
  run(25, (s) => {
    hold();
    if (app.defense.missiles.length && launched === null) launched = s;
    return launched !== null;
  });
  assert.ok(launched !== null, 'the emplacement fired');
  for (const m of app.defense.missiles) m.alive = false;
  app.defense.grace = 1e9;
  app.step(1 / 120);
  assert.equal(u.loaded[0], false, 'tube empty after the launch');
  let back = null;
  run(6, (s) => {
    hold();
    if (u.loaded[0] && back === null) back = s;
    return back !== null;
  });
  assert.ok(back !== null && back > 2.4 && back < 3.2, 'next missile in the tube about 3 s later: ' + back);
  assert.equal(l.ammo, 7, 'one missile used from the stock of 8');
});

test('F33 CIWS: 1 800 rounds a minute at 224 m/s; a helicopter right above it is safe, at 45 deg it fires', () => {
  assert.equal(app.CIWS.rate, 30);
  assert.equal(app.CIWS.velocity, 224);
  app.setConfig({
    scenario: 'missiles',
    aaLaunchers: 1,
    ciwsCount: 1,
    duration: 0,
    difficulty: 'normal',
    aaRespawn: true,
  });
  app.start();
  app.resetAir();
  app.defense.grace = 1e9;
  const u = app.addCiws(0, -500, null, 0);
  const p = u.view.group.position.clone();
  const over = () => hold(p.x + 15, p.y + 250, p.z);
  over();
  run(10, () => {
    over();
    return false;
  });
  assert.equal(app.ciwsStats.shots, 0, 'nothing straight up');
  const side = () => hold(p.x, p.y + 250, p.z + 250);
  run(15, () => {
    side();
    return app.ciwsStats.shots > 0;
  });
  assert.ok(app.ciwsStats.shots > 0, 'fires at 45 deg');
});
