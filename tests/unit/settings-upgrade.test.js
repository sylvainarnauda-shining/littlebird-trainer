'use strict';
// HeliSettings.upgrade: a stored profile document brought to the current tuning revision, step by step (revisions 2 to
// 16), purely: the result is { doc, notices, migratedFrom }, the document's settings are upgraded but not validated, and
// the notices say what changed for the player. Values the player set are kept; only the old defaults move.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');
const TEXT = require('../helpers/ui-text');

const S = load('settings.js');
const { defaults } = S;
const upgrade = (tuningRevision, settings = {}, extra = {}) =>
  S.upgrade({ version: 1, tuningRevision, settings, ...extra });

test('a profile of the current revision comes back unchanged and silent', () => {
  const saved = {
    version: 1,
    tuningRevision: S.REVISION,
    settings: { pitchSens: 30, mouseFine: 1.25 },
    bindings: { fire: 'KeyF' },
  };
  const before = JSON.stringify(saved);
  const up = S.upgrade(saved);
  assert.equal(S.REVISION, 16);
  assert.deepEqual(up.doc, saved);
  assert.deepEqual(up.notices, []);
  assert.equal(up.migratedFrom, 16);
  assert.equal(JSON.stringify(saved), before, 'the stored document is not changed');
  assert.notEqual(up.doc.settings, saved.settings, 'the upgraded settings are a copy');
});

test('the document leaves at the current revision with its other blocks untouched', () => {
  const bindings = { fire: 'KeyF' };
  const up = upgrade(9, { pitchSens: 30 }, { bindings, joystick: { schema: 1 } });
  assert.equal(up.doc.tuningRevision, 16);
  assert.equal(up.migratedFrom, 9);
  assert.equal(up.doc.bindings, bindings);
  assert.deepEqual(up.doc.joystick, { schema: 1 });
  assert.equal(up.doc.version, 1);
});

test('a document without a revision, or with a settings block that is not an object, upgrades from revision 0', () => {
  for (const saved of [{}, { settings: [1, 2] }, { settings: 'text' }, 5, true, 'text']) {
    const up = S.upgrade(saved);
    assert.equal(up.migratedFrom, 0);
    assert.equal(up.doc.tuningRevision, 16);
    assert.equal(typeof up.doc.settings, 'object');
    assert.match(up.notices.join(' '), TEXT.migratedToRateLaw);
  }
});

test('revisions 1-2: an 80 deg vertical field becomes the 58 default (then goes), the "cross" trajectory its default', () => {
  const up = upgrade(1, { fov: 80, trajectory: 'cross' });
  assert.equal(up.doc.settings.fov, undefined);
  assert.equal(up.doc.settings.fovCockpit, undefined, '58 is the old default: nothing to carry over');
  assert.equal(up.doc.settings.trajectory, defaults.trajectory);
  assert.equal(upgrade(2, { trajectory: 'cross' }).doc.settings.trajectory, 'cross', 'only before revision 2');
});

test('revision 3: the old 6 000 rpm default moves to the default, another value is kept', () => {
  assert.equal(upgrade(2, { rpm: 6000 }).doc.settings.rpm, defaults.rpm);
  assert.equal(upgrade(2, { rpm: 4000 }).doc.settings.rpm, 4000);
  assert.equal(upgrade(3, { rpm: 6000 }).doc.settings.rpm, 6000);
});

test('revision 7: the flight-model keys go (the new model has other values), personal choices stay, 36.02 damage resets', () => {
  const kept = { pitchSens: 23, scenario: 'duel', aaLaunchers: 5, volume: 0.3 };
  const gone = {
    pitchRate: 99,
    collectiveSpring: 1,
    aeroCoupling: 1,
    maxLift: 1,
    liftResponse: 1,
    collectiveRate: 1,
    altitudeHold: false,
  };
  const up = upgrade(6, { ...kept, ...gone, impactDamage: 36.02 });
  assert.deepEqual(up.doc.settings, { ...kept, impactDamage: 0 });
  assert.equal(upgrade(6, { impactDamage: 78.01 }).doc.settings.impactDamage, 78.01);
  assert.equal(upgrade(7, { pitchRate: 99 }).doc.settings.pitchRate, 99, 'only before revision 7');
});

test('revision 10: the old 1 500 m lock range default goes, a chosen range stays', () => {
  assert.equal('aaLockRange' in upgrade(9, { aaLockRange: 1500 }).doc.settings, false);
  assert.equal(upgrade(9, { aaLockRange: 1200 }).doc.settings.aaLockRange, 1200);
});

test('revision 12: a custom vertical field becomes its 16:9 horizontal equivalent for both views, 58 is dropped', () => {
  const up = upgrade(11, { fov: 70, cameraMotion: 0.35, speedFov: 5 });
  assert.deepEqual(up.doc.settings, { fovCockpit: 102, fovChase: 102 });
  assert.deepEqual(upgrade(11, { fov: 58, cameraMotion: 0.5 }).doc.settings, { cameraMotion: 0.5 });
  assert.equal(upgrade(11, { fov: 'wide' }).doc.settings.fov, undefined);
});

test('revision 12: the 16 / 8 sensitivities of the old defaults reset with a notice, any other pair is kept', () => {
  const up = upgrade(11, { pitchSens: 16, yawSens: 8 });
  assert.equal('pitchSens' in up.doc.settings || 'yawSens' in up.doc.settings, false);
  assert.ok(up.notices.some((n) => /^Sensibilités de la souris remises aux valeurs par défaut/.test(n)));
  const kept = upgrade(11, { pitchSens: 16, yawSens: 9 });
  assert.deepEqual([kept.doc.settings.pitchSens, kept.doc.settings.yawSens], [16, 9]);
  assert.ok(!kept.notices.some((n) => /^Sensibilités/.test(n)));
});

test('revision 13: the 450 m/s and two-hit missile defaults replace the earlier ones', () => {
  const up = upgrade(12, { aaHitsToKill: 1, aaMissileSpeed: 300 });
  assert.deepEqual(up.doc.settings, {});
  assert.deepEqual(upgrade(12, { aaHitsToKill: 2, aaMissileSpeed: 320 }).doc.settings, {
    aaHitsToKill: 2,
    aaMissileSpeed: 320,
  });
});

test('revision 14: the measured mouse law replaces the v12 stick: its keys go, the notice says so, the rest stays', () => {
  const up = upgrade(13, {
    mouseLaw: 'stick',
    mouseRateScale: 0.3,
    mouseLag: 0.2,
    leverHover: 0,
    chaseSpeedView: false,
    gain: 0.06,
    mouseReturn: 3,
  });
  assert.deepEqual(up.doc.settings, { gain: 0.06, mouseReturn: 3 });
  assert.equal(up.notices.length, 1);
  assert.match(up.notices[0], TEXT.migratedToRateLaw);
  assert.deepEqual(upgrade(14, { mouseLaw: 'stick' }).doc.settings, { mouseLaw: 'stick' }, 'only before revision 14');
});

test('revision 15: a yaw inertia of 0.40 (the revision 14 default) moves to 0.35 with a notice; a chosen one stays', () => {
  const up = upgrade(14, { responseYaw: 0.4 });
  assert.deepEqual(up.doc.settings, {});
  assert.equal(up.notices.length, 1);
  assert.match(up.notices[0], TEXT.yawInertiaNotice);
  assert.equal(upgrade(14, { responseYaw: 0.5 }).doc.settings.responseYaw, 0.5);
  assert.equal(upgrade(15, { responseYaw: 0.4 }).doc.settings.responseYaw, 0.4, 'revision 14 only');
});

test('revision 16: the old 0.271 gain default moves to 0.339, per axis, with a notice that tells what really changes', () => {
  const both = upgrade(15, { mouseRateScale: 0.271, mouseYawScale: 0.271 });
  assert.deepEqual(both.doc.settings, {});
  assert.match(both.notices[0], TEXT.gainChange);
  assert.match(both.notices[0], TEXT.gainClaimPercent);
  const pitch = upgrade(15, { mouseRateScale: 0.271, mouseYawScale: 0.3 });
  assert.deepEqual(pitch.doc.settings, { mouseYawScale: 0.3 });
  assert.match(pitch.notices[0], TEXT.gainChangePitchOnly);
  const fine = upgrade(15, { mouseRateScale: 0.271, mouseYawScale: 0.271, mouseFine: 1.25 });
  assert.match(fine.notices[0], TEXT.fineFactorKept);
  assert.equal(fine.doc.settings.mouseFine, 1.25);
  const stick = upgrade(15, { mouseRateScale: 0.271, mouseLaw: 'stick' });
  assert.match(stick.notices[0], TEXT.stickUnchanged);
  assert.doesNotMatch(stick.notices[0], TEXT.gainClaimPercent);
  const chosen = upgrade(15, { mouseRateScale: 0.3, mouseYawScale: 0.25 });
  assert.deepEqual(chosen.doc.settings, { mouseRateScale: 0.3, mouseYawScale: 0.25 });
  assert.deepEqual(chosen.notices, []);
});

test('the notices come in the order of the steps, one per step that changed something for the player', () => {
  const up = upgrade(11, { pitchSens: 16, yawSens: 8 });
  assert.equal(up.notices.length, 2);
  assert.match(up.notices[0], /^Sensibilités/);
  assert.match(up.notices[1], TEXT.migratedToRateLaw);
});

test('the upgrade validates nothing: out-of-range and wrong-type values go through for sanitize to deal with', () => {
  const up = upgrade(16, { pitchSens: 1e9, scenario: 7 });
  assert.deepEqual(up.doc.settings, { pitchSens: 1e9, scenario: 7 });
  assert.equal(S.sanitize(up.doc.settings).pitchSens, 100);
  assert.equal(S.sanitize(up.doc.settings).scenario, defaults.scenario);
});
