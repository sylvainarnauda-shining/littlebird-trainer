'use strict';
// Synthetic stored profiles for the mocked-DOM application (no player's own settings: neutral test values).
//  - revision8(P, M): an old (revision 8) profile with its own pitch sensitivity, the old 1 500 m lock-range default,
//    a fixed hit damage of 78.01 (above two reference hits of 36.02, so one round downs a soldier) and the fire key on V
//    (the flare action added later must not steal it). The session tests of the previous test suite ran with it.
function revision8(P, M) {
  return {
    version: 1,
    tuningRevision: 8,
    settings: { ...P.defaults, ...M.defaults, aaLockRange: 1500, pitchSens: 23, impactDamage: 78.01, scenario: 'air' },
    bindings: { fire: 'KeyV' },
  };
}

// A revision-13 profile as the v12 release saved it (the whole cfg, without the v13 keys), with values of its own (not
// the defaults): mouse sensitivities, a stick gain and return, the volume, medium graphics and the fire key on F. The
// fields of view are the 85 deg the chase-camera measurements were made with. The sensitivities and the multiplier give
// a fixed test gain product (sensitivity x multiplier), the one the previous test suite's bands were set with, bit for
// bit in both mouse laws.
const V13_KEYS = [
  'mouseLaw',
  'mouseRateScale',
  'mouseYawScale',
  'mouseLag',
  'mouseFine',
  'mouseClamp',
  'cyclicYaw',
  'responseYaw',
  'leverHover',
  'chaseSpeedView',
];
function revision13Settings(P, M) {
  const s = {
    ...P.defaults,
    ...M.defaults,
    scenario: 'free',
    pitchSens: 40,
    yawSens: 20,
    vehicleMultiplier: 0.25,
    invertY: true,
    fovCockpit: 85,
    fovChase: 85,
    gain: 0.06,
    mouseReturn: 3,
    volume: 0.3,
    graphics: 'medium',
  };
  for (const k of V13_KEYS) delete s[k];
  return s;
}
// The mouse-pilot key layout (collective W / Shift, pitch S / ArrowUp, yaw A / D, roll on the mouse buttons, view E),
// the trainer's default before the game's defaults were adopted (R5.5); the golden recorder flies the same layout
// (tools/golden/scenarios.cjs GOLDEN_BINDINGS). A v12-era profile saved every binding.
const MOUSE_PILOT = Object.freeze({
  collectiveUp: 'KeyW',
  collectiveDown: 'ShiftLeft',
  pitchUp: 'KeyS',
  pitchDown: 'ArrowUp',
  yawLeft: 'KeyA',
  yawRight: 'KeyD',
  rollLeft: 'Mouse0',
  rollRight: 'Mouse2',
  fire: 'Space',
  flares: 'KeyV',
  freeLook: 'AltLeft',
  shop: 'KeyB',
  view: 'KeyE',
  reset: 'KeyR',
  neutral: 'KeyX',
});
function revision13(P, M) {
  return {
    version: 1,
    tuningRevision: 13,
    settings: revision13Settings(P, M),
    bindings: { ...MOUSE_PILOT, fire: 'KeyF' },
  };
}
// A current profile holding only the mouse-pilot layout (every setting at its default).
function mousePilot() {
  return { version: 1, tuningRevision: 16, settings: {}, bindings: { ...MOUSE_PILOT } };
}

module.exports = { revision8, revision13, revision13Settings, mousePilot, MOUSE_PILOT };
