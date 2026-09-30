'use strict';
// Enemy helicopters in the mocked-DOM application (check F33 for the damage values): the duel against bots flying the
// same measured model (approach, fire, rounds of 1/60 of the integrity, shot down and respawned, sudden death, the
// 'behind' start, real level without markers), the bots of the full match patrolling the hot zone and engaging, the
// AH-6R rocket bots (salvos, pod reload, 25 % a direct hit), minigun bots rearming at a base, wingmen, and the v12 match
// (AH-6M + AH-6R, rocket gunners, the two factions, armed vehicles: Humvee 1.8 %, M249 0.8 % a round). One boot for the
// file, Math.random seeded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp } = require('../helpers/mock-dom');
const { seedMathRandom, SEED } = require('../helpers/rng');
const NAMES = require('../helpers/names');
const TEXT = require('../helpers/ui-text');

seedMathRandom(SEED + 105);
const { P, M, W, T } = require('../helpers/runtime').modules();
const S = bootApp({ profile: require('../helpers/profiles').revision8(P, M) });
const { app, diag, el, run } = S;
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const holdFront = () => {
  app.flight.position.set(0, 60, 130);
  app.flight.velocity.set(0, 0, 0);
  app.flight.quaternion.identity();
  app.flight.collective = 0;
};
// An enemy round fired 10 m ahead of the helicopter, straight at it.
const shootPlayer = (owner) => {
  const p0 = app.flight.position.clone().add(v(0, 0, -10));
  app.enemyRounds.push({ p: p0, v: v(0, 0, 800), age: 0, previous: p0.clone(), owner, cracked: false });
  for (let i = 0; i < 6 && app.enemyRounds.length; i++) app.step(1 / 120);
};

test('duel: two bots 1.3 km up the valley, same measured flight model and miniguns; no air defence, no ground battle', () => {
  app.setConfig({
    scenario: 'duel',
    duelBots: 2,
    duelStart: 'front',
    duelRespawn: true,
    duelHealth: 60,
    difficulty: 'normal',
    duration: 0,
    impactDamage: 0,
  });
  app.start();
  const d = diag();
  assert.equal(d.mode, 'duel');
  assert.equal(d.bots.length, 2);
  assert.ok(
    d.bots.every((b) => b.active && b.distance > 1100 && b.distance < 1500),
    'bots 1.3 km away: ' + d.bots.map((b) => Math.round(b.distance)),
  );
  assert.equal(d.air.active, false, 'no air defence in the duel');
  assert.equal(d.battle.soldiers.length, 0, 'no ground battle');
  assert.equal(app.bots[0].bot.flight.cfg.pitchRate, 52, 'bots fly the measured model');
  assert.equal(app.bots[0].bot.flight.cfg.pitchSens, P.defaults.pitchSens, "not the player's profile");
  assert.equal(app.bots[0].bot.pilot.skillName, 'normal');
  assert.equal(app.bots[0].maxHealth, 60);
});

test('duel: hovering in front of the helipad, the bots come, fire, and their rounds hit; they stay clear of the ground', () => {
  let firstShot = null;
  run(60, (s) => {
    holdFront();
    if (firstShot === null && app.duel.enemyShots > 0) firstShot = s;
    return app.duel.hitsTaken >= 5 || !app.heliAlive;
  });
  const d = diag();
  assert.ok(firstShot !== null && firstShot < 45, 'the bots open fire: ' + firstShot);
  assert.ok(app.duel.hitsTaken > 0, 'enemy rounds hit the helicopter');
  assert.ok(
    d.bots.every((b) => !b.active || b.position[1] - W.height(b.position[0], b.position[2]) > 10),
    'bots clear of the ground',
  );
});

test('F33 one enemy round of 36.01 takes 1/60 of the integrity (60 reference hits of 36.02)', () => {
  for (const t of app.bots) app.placeBot(t, v(W.valleyX(-2300), 0, -2300), v(0, 0, -3000));
  app.enemyRounds.length = 0;
  if (!app.heliAlive) run(4);
  app.setConfig({ impactDamage: 36.01 });
  holdFront();
  app.health = 100;
  shootPlayer(app.bots[0]);
  assert.ok(
    Math.abs(100 - app.health - (100 * (36.01 / 36.02)) / 60) < 1e-6,
    'one round: 1/60 of the integrity (' + (100 - app.health).toFixed(3) + ' %)',
  );
});

test('a bot shot down by the player: the wreck falls burning and explodes on the ground, +200, respawn 1-1.6 km away', () => {
  const b0 = app.bots[0];
  const score0 = app.score;
  app.placeBot(b0, v(W.valleyX(-300), 0, -300), v(0, 0, 130));
  let n = 0;
  while (b0.active && n++ < 600) {
    holdFront();
    const at = b0.group.position.clone();
    const from = at.clone().add(v(3, 2, 14));
    app.pushRound(from, at.clone().sub(from).normalize().multiplyScalar(900));
    app.step(1 / 120);
  }
  assert.equal(b0.active, false, 'bot shot down by rounds');
  assert.ok(b0.bot.falling, 'the wreck falls');
  assert.equal(app.score - score0, 200, 'enemy helicopter +200');
  assert.equal(app.duel.kills, 1);
  const y0 = b0.group.position.y;
  run(30, () => !b0.bot.falling);
  assert.ok(!b0.bot.falling && b0.group.visible === false, 'wreck exploded on the ground');
  assert.ok(y0 - b0.bot.flight.position.y > 5, 'it fell');
  run(14, () => b0.active);
  assert.ok(b0.active, 'respawned');
  const back = b0.bot.flight.position.distanceTo(app.flight.position);
  assert.ok(back > 900 && back < 1800, 'respawned away from the player: ' + Math.round(back) + ' m');
});

test('shot down by the bots: -100, respawn above the helipad with full integrity, enemy rounds cleared; the debrief', () => {
  const score1 = app.score;
  app.health = 0.5;
  shootPlayer(app.bots[1]);
  assert.equal(app.heliAlive, false, 'shot down by an enemy helicopter');
  run(3);
  assert.ok(app.heliAlive);
  assert.equal(app.health, 100);
  assert.equal(app.score, Math.max(0, score1 - 100));
  assert.ok(app.enemyRounds.length === 0, 'enemy rounds cleared at respawn');
  app.finish('Session terminée');
  assert.match(el('resultStats').innerHTML, TEXT.resultDuelRecord);
  assert.match(el('resultDetail').textContent, TEXT.resultLevelNormal);
});

test('sudden death: shot down = the end; every enemy down = victory', () => {
  app.setConfig({ scenario: 'duel', duelBots: 1, duelRespawn: false, duration: 0, impactDamage: 36.01 });
  app.start();
  app.health = 1;
  shootPlayer(app.bots[0]);
  run(4);
  assert.equal(diag().running, false);
  assert.equal(el('resultTitle').textContent, TEXT.shotDownByBot);
  app.start();
  const b = app.bots[0];
  app.placeBot(b, v(W.valleyX(-200), 0, -200), v(0, 0, 130));
  let n = 0;
  while (b.active && n++ < 900) {
    const at = b.group.position.clone();
    const from = at.clone().add(v(3, 2, 14));
    app.pushRound(from, at.clone().sub(from).normalize().multiplyScalar(900));
    app.step(1 / 120);
  }
  run(30);
  assert.equal(diag().running, false);
  assert.match(el('resultTitle').textContent, TEXT.victory);
});

test("the skill follows the difficulty; the 'behind' start puts three real-level bots 750 m south; no markers at that level", () => {
  app.setConfig({
    scenario: 'duel',
    duelBots: 3,
    duelStart: 'behind',
    duelRespawn: true,
    difficulty: 'real',
    duration: 0,
  });
  app.start();
  const d = diag();
  assert.equal(d.bots.length, 3);
  assert.ok(
    d.bots.every((b) => b.skill === 'real' && b.position[2] > app.flight.position.z + 600),
    'three real-level bots behind',
  );
  assert.equal(app.run.showMarkers, false, 'real level: no markers');
  run(20);
  assert.ok(diag().bots.every((b) => !b.active || b.position[1] - W.height(b.position[0], b.position[2]) > 10));
});

test('full match: the two enemy helicopters patrol the hot zone and engage within 1.3 km', () => {
  app.setConfig({
    scenario: 'match',
    camps: 4,
    infantryPerCamp: 0,
    convoy: 0,
    aaLaunchers: 1,
    duration: 0,
    difficulty: 'normal',
  });
  app.start();
  app.defense.grace = 1e9;
  assert.equal(app.bots.length, 2);
  const home = app.bots[0].bot.pilot.home;
  assert.ok(
    home && Math.hypot(home.x - app.hot.center.x, home.z - app.hot.center.z) < 1,
    'patrol area on the hot zone',
  );
  const far = Math.hypot(app.hot.center.x - app.flight.position.x, app.hot.center.z - app.flight.position.z);
  const park = () => {
    app.flight.position.set(W.PAD.x, 1.25, W.PAD.z);
    app.flight.velocity.set(0, 0, 0);
    app.flight.onGround = true;
  };
  if (far > 1900) {
    park();
    run(20, () => {
      park();
      return false;
    });
    assert.ok(
      diag().bots.every((b) => b.mode === 'patrol'),
      'far away: the bots patrol (' + Math.round(far) + ' m)',
    );
  }
  // The bot checked is one that flies: a bot can be down and waiting to respawn (with some seeds one hit the relief
  // during its patrol).
  if (!app.bots.some((t) => t.active)) {
    park();
    run(30, () => {
      park();
      return app.bots.some((t) => t.active);
    });
  }
  const b = app.bots.find((t) => t.active);
  assert.ok(b, 'an enemy helicopter flies');
  const bp = b.bot.flight.position;
  // The player 500 m from the bot, inside the flying area, on the bearing and at the height that give a clear line of
  // sight over the relief (terrain sampled every 10 m, 5 m of margin, no structure in the way), re-chosen every 0.5 s
  // as the bot moves. The check is about the bots engaging; with a fixed spot, some seeds hid the player behind a
  // ridge and the bot kept patrolling.
  const clearSpot = () => {
    let best = null;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const x = bp.x + 500 * Math.cos(a);
      const z = bp.z + 500 * Math.sin(a);
      // Inside the flying area (the session ends 3 400 m from the helipad).
      if (Math.hypot(x - W.PAD.x, z - W.PAD.z) > 3200) continue;
      // The lowest player height y with bp.y + (y - bp.y) t >= terrain(t) + 5 all along the segment.
      let y = W.height(x, z) + 60;
      for (let i = 1; i <= 50; i++) {
        const t = i / 50;
        const ground = P.terrain(bp.x + (x - bp.x) * t, bp.z + (z - bp.z) * t) + 5;
        y = Math.max(y, bp.y + (ground - bp.y) / t);
      }
      const spot = v(x, y, z);
      if (app.obstacles.hit(bp.clone(), spot.clone(), 0)) continue;
      if (!best || spot.y < best.y) best = spot;
    }
    return best || v(bp.x + 500, bp.y + 300, bp.z);
  };
  let near = clearSpot();
  const put = () => {
    app.flight.position.copy(near);
    app.flight.velocity.set(0, 0, 0);
    app.flight.onGround = false;
    app.flight.quaternion.identity();
    app.flight.collective = 0;
    // The other bot may engage too: the player stays in the air for the check.
    app.health = 100;
  };
  put();
  run(12, (s) => {
    if (Math.round(s * 120) % 60 === 0) near = clearSpot();
    put();
    return ['attack', 'pursuit', 'evade', 'extend'].includes(b.bot.pilot.mode) && b.bot.pilot.visible;
  });
  assert.ok(
    ['attack', 'pursuit', 'evade', 'extend'].includes(b.bot.pilot.mode),
    'engaged within 1.3 km: ' + b.bot.pilot.mode,
  );
});

test('F33 AH-6R rocket bots: pods of 8 fired in salvos (0.17 s apart, 1.2 s or more between), reloaded 6 s after the last rocket, 25 % a direct hit', () => {
  app.setConfig({
    scenario: 'duel',
    duelBots: 1,
    duelEnemy: 'ah6r',
    duelStart: 'front',
    duelRespawn: true,
    duelHealth: 60,
    difficulty: 'normal',
    duration: 0,
    impactDamage: 0,
  });
  app.start();
  let d = diag();
  assert.equal(d.bots[0].weapon, 'rockets');
  assert.equal(d.bots[0].rockets, 8);
  const times = [];
  let lastShots = 0;
  let emptied = null;
  let reloaded = null;
  run(120, (s) => {
    holdFront();
    const b = app.bots[0].bot;
    if (b.shots > lastShots) {
      for (let k = lastShots; k < b.shots; k++) times.push(s);
      lastShots = b.shots;
    }
    // Refill: the pod goes from 0 to 8 and may fire again in the same step (0 -> 7).
    if (b.rockets === 0 && emptied === null) emptied = s;
    if (emptied !== null && reloaded === null && b.rockets > 0) reloaded = s;
    d = diag();
    return reloaded !== null && d.rockets.hits > 0;
  });
  const gaps = times.slice(1).map((t, i) => +(t - times[i]).toFixed(3));
  assert.ok(times.length >= 8, 'the bot fired its rockets');
  assert.ok(
    gaps.every((g) => Math.abs(g - 60 / 350) < 0.02 || g >= 1.19),
    'salvos: 0.17 s apart inside, 1.2 s or more between',
  );
  assert.ok(
    emptied !== null && reloaded !== null && Math.abs(reloaded - emptied - 6) < 0.1,
    'pods reloaded 6 s after the last rocket',
  );
  assert.ok(d.rockets.hits > 0, 'rockets hit the helicopter');
  assert.ok(d.rockets.damage >= 25 * d.rockets.hits - 1e-9, 'a direct hit takes 25 % (100 of 400)');
});

test('minigun bots carry 1 050 rounds; empty, they fly to a base away from the player and rearm there for 25 s', () => {
  app.setConfig({
    scenario: 'duel',
    duelBots: 1,
    duelEnemy: 'ah6m',
    duelStart: 'front',
    duelRespawn: true,
    difficulty: 'normal',
    duration: 0,
  });
  app.start();
  const t = app.bots[0];
  const b = t.bot;
  assert.equal(b.ammo, 1050);
  b.ammo = 4;
  run(90, () => {
    holdFront();
    return b.rearming;
  });
  assert.ok(b.rearming, 'out of rounds: off to rearm');
  assert.equal(b.pilot.detectRange, 0, 'ignores the player while rearming');
  const base = b.pilot.home;
  assert.ok(
    base && Math.hypot(base.x - app.flight.position.x, base.z - app.flight.position.z) > 700,
    'base away from the player',
  );
  // Put it over its base (placeBot would reset it, rearming included).
  b.flight.position.set(base.x, W.height(base.x, base.z) + 80, base.z);
  b.flight.velocity.set(0, 0, 0);
  let took = null;
  run(30, (s) => {
    holdFront();
    if (!b.rearming) {
      took = s;
      return true;
    }
    return false;
  });
  assert.equal(b.rearming, false);
  assert.ok(took > 24 && took < 27, '25 s at the base: ' + took);
  assert.equal(b.ammo, 1050, 'rearmed');
  assert.equal(b.pilot.detectRange, Infinity, 'back in the fight');
});

test('wingmen: in a trio the second and third bots swing wide on either side; "mix" alternates the weapons', () => {
  app.setConfig({ scenario: 'duel', duelBots: 3, duelEnemy: 'mix', duelStart: 'front', duration: 0 });
  app.start();
  assert.deepEqual([...app.bots.map((t) => t.bot.pilot.flank)], [0, 1, -1]);
  assert.deepEqual([...app.bots.map((t) => t.bot.weapon)], ['miniguns', 'rockets', 'miniguns']);
});

test('F33 the v12 match: an AH-6M and an AH-6R, rocket gunners, both factions, armed vehicles (Humvee 1.8 %, M249 0.8 % a round, Humvee +120)', () => {
  app.setConfig({
    scenario: 'match',
    camps: 4,
    infantryPerCamp: 6,
    convoy: 6,
    rpgPerCamp: 1,
    aaLaunchers: 3,
    ciwsCount: 0,
    duration: 0,
    difficulty: 'normal',
  });
  app.start();
  const d = diag();
  assert.deepEqual([...d.bots.map((b) => b.weapon)], ['miniguns', 'rockets'], 'the match mixes an AH-6M and an AH-6R');
  assert.ok(d.battle.soldiers.filter((s) => s.role === 'rpg').length >= 4, 'a rocket gunner in each camp');
  for (const f of NAMES.factions) assert.ok(d.factions.includes(f), 'both opposing factions: ' + d.factions);
  for (const q of d.vehicles) assert.equal(q.armed, { humvee: 'minigun', pickup: 'm249', truck: null }[q.kind]);
  app.defense.grace = 1e9;
  for (const s of app.battle.soldiers) s.alive = false;
  for (const q of app.battle.vehicles) q.alive = false;
  for (const t of app.bots) {
    t.active = false;
    t.respawn = 1e9;
  }
  app.flight.position.set(0, 70, 80);
  app.flight.velocity.set(0, 0, 0);
  app.flight.quaternion.identity();
  app.flight.collective = 0;
  app.flight.onGround = false;
  app.health = 100;
  app.battle.events.push({
    type: 'vehicleShot',
    vehicle: null,
    from: v(0, 0, 0),
    to: app.flight.position.clone(),
    hits: 2,
    rounds: 5,
    gun: 'minigun',
  });
  app.step(1 / 120);
  assert.ok(Math.abs(app.health - 96.4) < 1e-9, 'Humvee minigun: 1.8 % a round (' + app.health + ')');
  app.battle.events.push({
    type: 'vehicleShot',
    vehicle: null,
    from: v(0, 0, 0),
    to: app.flight.position.clone(),
    hits: 2,
    rounds: 3,
    gun: 'm249',
  });
  app.step(1 / 120);
  assert.ok(Math.abs(app.health - 94.8) < 1e-9, 'pickup M249: 0.8 % a round');
  const hv = {
    ...app.battle.vehicles[0],
    kind: 'humvee',
    armed: 'minigun',
    points: 120,
    alive: true,
    health: 1,
    maxHealth: 22,
    position: v(W.PAD.x, 0, W.PAD.z),
  };
  const s0 = app.score;
  app.battle.damageVehicle(hv, 99);
  app.step(1 / 120);
  const mult = Math.hypot(hv.position.x - app.hot.center.x, hv.position.z - app.hot.center.z) < app.hot.radius ? 2 : 1;
  assert.equal(app.score - s0, 120 * mult, 'Humvee +120');
});
