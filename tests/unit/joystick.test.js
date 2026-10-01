'use strict';
// Joystick input path (J1, src/physics.js `joystick`): pure functions only, with fake pads (tests/helpers/gamepads.js),
// never the machine's. Ids as Chromium writes them for the vJoy virtual device and for two identical T.16000M sticks;
// processing of one axis (baseline B0, SUPPOSED laws); hat decoding; freshness (zero-initialised sticks, stale values
// after the page was hidden, a hat Chromium keeps at 0); roles of two identical sticks (identification, proposal,
// confirmation, swap, elimination, three sticks); devices (vJoy first, the model an imported file names, merge rules);
// one frame (signs, held controls, actions, latches); the mix with the keys (untouched without a stick, -0 included);
// the collective lever of Flight.step; the profile block (validation of hostile input); the game's joystick section
// (a synthetic file, section scoping, parser limits) and its import.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../helpers/runtime');
const { FIXTURES } = require('../helpers/paths');
const G = require('../helpers/gamepads');

const P = load('physics.js');
const J = P.joystick;
const snap = (...pads) => J.snapshotPads(pads);
const bind = (o = {}) => ({ device: 'main', axis: 0, invert: false, sensitivity: 1, deadZone: 0.05, ...o });
const profileWith = (edit) => {
  const p = J.defaultProfile();
  edit(p);
  return J.validateProfile(p);
};
const ini = fs.readFileSync(path.join(FIXTURES, 'synthetic', 'joystick-settings.sample.txt'), 'utf8');

test('Gamepad ids: vJoy, two identical T.16000M, an XInput pad, Firefox, hostile and empty ids', () => {
  assert.deepEqual(J.parseGamepadId(G.VJOY_ID), {
    name: 'vJoy Device',
    vendor: '1234',
    product: 'bead',
    format: 'chromium',
  });
  assert.deepEqual(J.parseGamepadId(G.T16000M_ID), {
    name: 'T.16000M',
    vendor: '044f',
    product: 'b10a',
    format: 'chromium',
  });
  assert.deepEqual(J.parseGamepadId('Pad (STANDARD GAMEPAD Vendor: 045e Product: 028e)'), {
    name: 'Pad',
    vendor: '045e',
    product: '028e',
    format: 'chromium',
  });
  assert.equal(J.parseGamepadId(G.XINPUT_ID).vendor, null);
  assert.deepEqual(J.parseGamepadId('44f-b10a-T.16000M'), {
    name: 'T.16000M',
    vendor: '044f',
    product: 'b10a',
    format: 'firefox',
  });
  assert.equal(J.parseGamepadId('Stick (left) (Vendor: 1 Product: 2)').name, 'Stick (left)');
  assert.equal(J.parseGamepadId('Stick (left) (Vendor: 1 Product: 2)').vendor, '0001');
  const nul = String.fromCharCode(0);
  const rlo = String.fromCharCode(0x202e);
  const hostile = J.parseGamepadId('<img src=x onerror=alert(1)>' + nul + rlo + 'x'.repeat(500));
  assert.equal(hostile.format, 'unknown');
  assert.ok(hostile.name.length <= 64 && !hostile.name.includes(nul) && !hostile.name.includes(rlo));
  for (const id of [null, undefined, 42, {}]) assert.equal(J.parseGamepadId(id).vendor, null);
  // The game's DeviceIdentifier: VVVV:PPPP:Name; "" = no device.
  assert.deepEqual(J.parseGameIdentifier('1234:BEAD:vJoy Device'), {
    vendor: '1234',
    product: 'bead',
    name: 'vJoy Device',
  });
  assert.equal(J.parseGameIdentifier(''), null);
  assert.equal(J.gameIdentifier({ vendor: '044f', product: 'b10a', name: 'T.16000M' }), '044F:B10A:T.16000M');
});

test('snapshotPads: plain copies, empty slots and disconnected pads skipped, junk values read 0, bounded sizes', () => {
  const live = G.pad({ index: 1, axes: 20, buttons: 140 });
  live.axes[0] = 0.5;
  live.axes[1] = NaN;
  live.axes[2] = Infinity;
  live.buttons[3] = { pressed: true };
  live.buttons[4] = true;
  const gone = { ...G.pad({ index: 2 }), connected: false };
  const out = J.snapshotPads([null, live, gone, undefined]);
  assert.equal(out.length, 1);
  const p = out[0];
  assert.equal(p.index, 1);
  assert.equal(p.vendor, '1234');
  assert.equal(p.axes.length, 16);
  assert.equal(p.buttons.length, 128);
  assert.deepEqual(p.axes.slice(0, 3), [0.5, 0, 0]);
  assert.equal(p.buttons[3], true);
  assert.equal(p.buttons[4], true);
  live.axes[0] = -1;
  assert.equal(p.axes[0], 0.5, 'a copy, not the live object');
  assert.equal(J.snapshotPads(Array.from({ length: 12 }, (_, i) => G.pad({ index: i }))).length, 8);
  for (const junk of [null, undefined, 5, 'x', {}]) assert.deepEqual(J.snapshotPads(junk), []);
});

test('axisValue (B0): exact +0 inside the dead zone, exact +-1 at the stops, monotonic, invert, gain then clamp, junk', () => {
  const b = bind();
  for (const u of [0, -0, 0.01, -0.01, 0.05, -0.05]) assert.ok(Object.is(J.axisValue(u, b), 0), 'exact +0 at ' + u);
  assert.equal(J.axisValue(1, b), 1);
  assert.equal(J.axisValue(-1, b), -1);
  // Rescaled over the half axis: (|u| - dz) / (1 - dz).
  assert.equal(J.axisValue(0.525, b), (0.525 - 0.05) / 0.95);
  let last = -Infinity;
  for (let i = -100; i <= 100; i++) {
    const u = i / 100;
    const v = J.axisValue(u, b);
    assert.ok(v >= last, 'monotonic at ' + u);
    last = v;
  }
  assert.equal(J.axisValue(0.6, bind({ invert: true })), -J.axisValue(0.6, b));
  // Sensitivity as a gain, clamped at full deflection (2: full output from about half travel).
  assert.equal(J.axisValue(0.6, bind({ sensitivity: 2 })), 1);
  assert.equal(J.axisValue(0.3, bind({ sensitivity: 0.5 })), (0.5 * (0.3 - 0.05)) / 0.95);
  // A hat's null state (above 1) and junk are not axis positions.
  for (const junk of [G.HAT_CENTRED, G.HAT_CENTRED_15, -1.5, NaN, undefined, null, '0.5', {}])
    assert.ok(Object.is(J.axisValue(junk, b), 0));
  assert.equal(J.axisValue(1 + 1e-12, b), 1, 'a rounding past the stop is the stop');
  assert.equal(J.axisValue(0.5, bind({ deadZone: 'x', sensitivity: -3 })), 0.5, 'junk settings: no dead zone, gain 1');
});

test('decodeHat: centred (9/7 and 23/7), not reported (exactly 0), eight directions, tolerance', () => {
  for (const v of [G.HAT_CENTRED, G.HAT_CENTRED_15, 0, NaN, undefined, 2, -2]) assert.equal(J.decodeHat(v), null);
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7].map((k) => J.decodeHat(G.hatValue(k))),
    J.HAT_DIRS,
  );
  assert.equal(J.decodeHat(G.hatValue(2) + 0.03), 'right');
  assert.equal(J.decodeHat(G.hatValue(2) + 0.1), null);
  assert.ok(J.hatHas('upRight', 'up') && J.hatHas('upRight', 'right') && !J.hatHas('upRight', 'left'));
  assert.equal(J.hatHas('up', 'constructor'), false);
});

test('freshness: a zero-initialised T.16000M is held until its hat reports; vJoy until its timestamp moves', () => {
  const f = J.createFreshness();
  const stick = G.pad({ index: 0, id: G.T16000M_ID, axes: 10, buttons: 16 });
  const vjoy = G.pad({ index: 1, id: G.VJOY_ID });
  assert.deepEqual([...J.freshStep(f, snap(stick, vjoy))], []);
  G.report(stick, { axes: { 9: G.HAT_CENTRED, 6: 0.4 } });
  assert.deepEqual([...J.freshStep(f, snap(stick, vjoy))], [0]);
  G.report(vjoy, { axes: { 1: 0.2 } });
  assert.deepEqual([...J.freshStep(f, snap(stick, vjoy))].sort(), [0, 1]);
  // Page hidden then shown: stale; the first read after it is the baseline, a later report clears it.
  J.markStale(f);
  assert.deepEqual([...J.freshStep(f, snap(stick, vjoy))], []);
  assert.deepEqual([...J.freshStep(f, snap(stick, vjoy))], []);
  G.report(stick);
  assert.deepEqual([...J.freshStep(f, snap(stick, vjoy))], [0]);
  // A disconnect forgets the pad; another device in its slot starts afresh.
  J.freshStep(f, snap(vjoy));
  const other = G.pad({ index: 0, id: G.OTHER_ID });
  assert.equal(J.freshStep(f, snap(other, vjoy)).has(0), false);
});

test('freshness fallback: a hat Chromium keeps at exactly 0 goes to the timestamp rule after 8 reports ("chapeau muet")', () => {
  const f = J.createFreshness();
  const stick = G.pad({ id: G.T16000M_ID, axes: 10, buttons: 16 });
  J.freshStep(f, snap(stick));
  for (let i = 0; i < 7; i++) {
    G.report(stick, { axes: { 0: 0.1 * i } });
    assert.equal(J.freshStep(f, snap(stick)).size, 0, 'held at report ' + (i + 1));
  }
  G.report(stick);
  assert.equal(J.freshStep(f, snap(stick)).has(0), true);
  assert.equal(J.hatMute(f, 0), true);
});

// Two identical T.16000M in slots 0 and 1 (same id, no serial number).
const twins = () => [
  G.pad({ index: 0, id: G.T16000M_ID, buttons: 16 }),
  G.pad({ index: 1, id: G.T16000M_ID, buttons: 16 }),
];

test('roles: one trigger press identifies two identical sticks; the press is consumed', () => {
  const r = J.createRoles();
  const devices = { main: null, left: null, right: null };
  const [a, b] = twins();
  J.startIdentify(r);
  assert.equal(J.rolesStep(r, devices, snap(a, b)).prompt, 'press-left');
  G.report(b, { press: [0] });
  const out = J.rolesStep(r, devices, snap(a, b));
  assert.deepEqual([out.phase, out.left, out.right, out.consumed, out.changed], ['ready', 1, 0, 1, true]);
  assert.equal(devices.left.slotHint, 1);
  assert.equal(devices.right.slotHint, 0);
  assert.ok(J.sameModel(devices.left, devices.right));
  // Held trigger: no new edge, nothing consumed.
  assert.equal(J.rolesStep(r, devices, snap(a, b)).consumed, null);
});

test('roles: next launch, the saved slots are a proposal; the first press confirms or swaps it', () => {
  const devices = { main: null, left: J.modelOf({ ...snap(twins()[1])[0] }), right: J.modelOf(snap(twins()[0])[0]) };
  for (const [pressed, left] of [
    [1, 1],
    [0, 0],
  ]) {
    const r = J.createRoles();
    const [a, b] = twins();
    const first = J.rolesStep(r, devices, snap(a, b));
    assert.deepEqual([first.phase, first.prompt, first.left, first.right], ['provisional', 'confirm-left', 1, 0]);
    G.report(pressed ? b : a, { press: [0] });
    const out = J.rolesStep(r, devices, snap(a, b));
    assert.deepEqual([out.phase, out.left, out.consumed], ['ready', left, pressed]);
    assert.equal(out.events.includes(left === 1 ? 'confirmed' : 'swapped'), true);
    devices.left.slotHint = 1;
    devices.right.slotHint = 0;
  }
  // Without the confirmation option the proposal is used as it is.
  const r = J.createRoles();
  assert.equal(J.rolesStep(r, devices, snap(...twins()), false).phase, 'ready');
});

test('roles: two identical sticks fly nothing before the confirming press (confirm each launch, plan JD2)', () => {
  // Saved proposal: left = slot 0, right = slot 1; the stick in slot 1 is really the left one.
  const profile = profileWith((p) => {
    p.devices.left = { vendor: '044f', product: 'b10a', name: 'T.16000M', slotHint: 0, hatAxis: 9 };
    p.devices.right = { vendor: '044f', product: 'b10a', name: 'T.16000M', slotHint: 1, hatAxis: 9 };
    Object.assign(p.axes.Pitch, { device: 'right', axis: 1 });
    Object.assign(p.axes.Throttle, { device: 'left', axis: 6 });
    p.actions.fire = [
      { device: 'right', button: 0 },
      { device: 'left', button: 0 },
    ];
    p.actions.flares = [{ device: 'left', button: 2 }];
  });
  const roles = J.createRoles();
  const fresh = J.createFreshness();
  const state = J.createJoyState();
  const [a, b] = twins();
  const step = (confirm = true) => {
    const s = snap(a, b);
    const info = J.rolesStep(roles, profile.devices, s, confirm);
    if (info.consumed !== null) J.latchButtons(state);
    const live = J.freshStep(fresh, s);
    const res = J.resolveDevices(profile, s, roles);
    const flying = J.rolesLive(live, info, profile, res);
    return { info, live, flying, f: J.joyFrame(state, profile, s, res, flying) };
  };
  // Both sticks report, fully deflected, flares held on the proposed left one: nothing flies, the lever holds.
  for (let i = 0; i < 3; i++) {
    G.report(a, { axes: { 6: 0.8, 9: G.HAT_CENTRED }, press: [2] });
    G.report(b, { axes: { 1: -1, 9: G.HAT_CENTRED } });
    const { info, live, flying, f } = step();
    assert.deepEqual([info.phase, info.prompt, info.left, info.right], ['provisional', 'confirm-left', 0, 1]);
    assert.deepEqual([[...live].sort(), [...flying]], [[0, 1], []], 'reported, but held');
    assert.deepEqual(
      [f.cmd.pitch, f.cmd.lever, f.axes.Pitch.status, f.axes.Throttle.status],
      [0, null, 'stale', 'stale'],
    );
    assert.deepEqual([[...f.held], f.pressed], [[], []]);
  }
  // The trigger of the stick in slot 1 swaps the proposal; that press is consumed (never fires), then the sticks fly.
  G.report(b, { press: [0] });
  let out = step();
  assert.deepEqual([out.info.phase, out.info.left, out.info.right, out.info.consumed], ['ready', 1, 0, 1]);
  assert.equal(out.flying, out.live, 'confirmed: the live set as it is');
  assert.deepEqual([out.f.cmd.pitch, out.f.cmd.lever], [0, J.axisValue(0, profile.axes.Throttle)], 'swapped roles');
  assert.deepEqual([...out.f.held], [], 'the confirming press is latched: it never fires');
  G.report(a, { axes: { 1: -1 }, release: [2] });
  G.report(b, { axes: { 6: 0.8 }, release: [0] });
  out = step();
  assert.deepEqual(
    [out.f.cmd.pitch, out.f.cmd.lever],
    [J.axisValue(-1, profile.axes.Pitch), J.axisValue(0.8, profile.axes.Throttle)],
  );
  G.report(a, { press: [0] });
  assert.deepEqual([...step().f.held], ['fire']);
  // Without « confirm each launch », or once confirmed, the live set is used as it is.
  const info = { phase: 'provisional', confirmed: false };
  const res = { main: [0], left: [0], right: [1] };
  const live = new Set([0, 1]);
  assert.equal(J.rolesLive(live, info, { ...profile, confirmRoles: false }, res), live);
  assert.equal(J.rolesLive(live, { ...info, confirmed: true }, profile, res), live);
  assert.equal(J.rolesLive(live, null, profile, res), live, 'roles not in use');
  // Two different models are told apart by their ids: nothing to confirm.
  const mixed = { ...profile, devices: { ...profile.devices, right: { ...profile.devices.right, product: '5678' } } };
  assert.equal(J.rolesLive(live, info, mixed, res), live);
});

test('roles: a stick lost in flight frees its role; back alone, it takes the free role by elimination', () => {
  const r = J.createRoles();
  const devices = { main: null, left: null, right: null };
  const [a, b] = twins();
  J.startIdentify(r);
  J.rolesStep(r, devices, snap(a, b));
  G.report(a, { press: [0] });
  J.rolesStep(r, devices, snap(a, b));
  const lost = J.rolesStep(r, devices, snap(a));
  assert.deepEqual([lost.phase, lost.prompt, lost.left, lost.right], ['missing', 'reconnect-right', 0, null]);
  assert.ok(lost.events.includes('lost-right'));
  const back = G.pad({ index: 2, id: G.T16000M_ID, buttons: 16 });
  const out = J.rolesStep(r, devices, snap(a, back));
  assert.deepEqual([out.phase, out.left, out.right, out.confirmed], ['ready', 0, 2, true]);
  // Swap from the menu.
  J.swapRoles(r, devices);
  assert.deepEqual([r.left, r.right, devices.left.slotHint, devices.right.slotHint], [2, 0, 2, 0]);
});

test('roles: three sticks need two presses; XInput pads and other models never take a role', () => {
  const r = J.createRoles();
  const devices = { main: null, left: null, right: null };
  const pads = [
    ...twins(),
    G.pad({ index: 2, id: G.T16000M_ID, buttons: 16 }),
    G.pad({ index: 3, id: G.XINPUT_ID, mapping: 'standard' }),
  ];
  J.startIdentify(r);
  J.rolesStep(r, devices, snap(...pads));
  G.report(pads[3], { press: [0] });
  assert.equal(J.rolesStep(r, devices, snap(...pads)).prompt, 'press-left', 'the XInput pad is ignored');
  G.report(pads[2], { press: [0] });
  const left = J.rolesStep(r, devices, snap(...pads));
  assert.deepEqual([left.phase, left.prompt, left.left, left.consumed], ['identify', 'press-right', 2, 2]);
  G.report(pads[0], { press: [1] });
  const out = J.rolesStep(r, devices, snap(...pads));
  assert.deepEqual([out.phase, out.left, out.right, out.consumed], ['ready', 2, 0, 0]);
  // Two different models: identity by model, no confirmation needed on the next launch.
  const mixed = {
    main: null,
    left: J.modelOf(snap(pads[0])[0]),
    right: J.modelOf(snap(G.pad({ index: 1, id: G.OTHER_ID }))[0]),
  };
  const r2 = J.createRoles();
  const m = J.rolesStep(r2, mixed, snap(G.pad({ index: 3, id: G.OTHER_ID }), G.pad({ index: 0, id: G.T16000M_ID })));
  assert.deepEqual([m.phase, m.left, m.right], ['ready', 0, 3]);
  assert.equal(J.rolesStep(J.createRoles(), { main: null, left: null, right: null }, snap(...pads)).phase, 'none');
});

test('devices: vJoy first when none is named; the model a file names; first / any / roles', () => {
  const [a, b] = twins();
  const v = G.pad({ index: 2, id: G.VJOY_ID });
  const x = G.pad({ index: 3, id: G.XINPUT_ID, mapping: 'standard' });
  const pads = snap(a, b, v, x);
  const p = J.defaultProfile();
  assert.deepEqual(J.resolveDevices(p, pads, J.createRoles()), { main: [2], left: [], right: [] });
  assert.deepEqual(J.resolveDevices(p, snap(b, a, x), J.createRoles()).main, [0], 'no vJoy: the first joystick');
  assert.deepEqual(J.resolveDevices(p, snap(x), J.createRoles()).main, [], 'an XInput pad is not a joystick here');
  p.devices.main = J.modelOf(pads[0]);
  assert.deepEqual(J.resolveDevices(p, pads, J.createRoles()).main, [0]);
  p.deviceMatch = 'any';
  assert.deepEqual(J.resolveDevices(p, pads, J.createRoles()).main, [0, 1]);
  p.devices.left = J.modelOf(pads[0]);
  assert.deepEqual(J.resolveDevices(p, pads, J.createRoles()).left, [0, 1]);
  p.deviceMatch = 'first';
  assert.deepEqual(J.resolveDevices(p, pads, J.createRoles()).left, [0]);
  p.deviceMatch = 'role';
  const r = { ...J.createRoles(), left: 1, right: 0 };
  assert.deepEqual(J.resolveDevices(p, pads, r), { main: [0], left: [1], right: [0] });
  assert.deepEqual(J.resolveDevices(p, snap(a), r).left, [], 'a role whose pad is gone stands for nothing');
});

// The vJoy device with every axis bound, as a remapper feeding the game would present it.
function vjoyProfile() {
  return profileWith((p) => {
    Object.assign(p.axes.Pitch, { device: 'main', axis: 1 });
    Object.assign(p.axes.Throttle, { device: 'main', axis: 2 });
    Object.assign(p.axes.Roll, { device: 'main', axis: 0 });
    Object.assign(p.axes.Yaw, { device: 'main', axis: 5 });
    p.axes.LookYaw.positive = { device: 'main', dir: 'right' };
    p.axes.LookYaw.negative = { device: 'main', dir: 'left' };
    p.actions.fire = [{ device: 'main', button: 3 }];
    p.actions.view = [{ device: 'main', button: 5 }];
  });
}
function frameOf(state, profile, pads, roles = J.createRoles(), fresh = J.createFreshness()) {
  const s = snap(...pads);
  const live = J.freshStep(fresh, s);
  return J.joyFrame(state, profile, s, J.resolveDevices(profile, s, roles), live);
}

test('joyFrame: signs bridged to the trainer (roll and yaw +1 = left), collective lever, hat look, actions', () => {
  const profile = vjoyProfile();
  const state = J.createJoyState();
  const fresh = J.createFreshness();
  const v = G.pad({ id: G.VJOY_ID });
  // Not reported yet: every bound control held; the collective lever kept where it is.
  let f = frameOf(state, profile, [v], undefined, fresh);
  assert.equal(f.axes.Pitch.status, 'stale');
  assert.deepEqual([f.cmd.pitch, f.cmd.roll, f.cmd.yaw, f.cmd.lever], [0, 0, 0, null]);
  assert.deepEqual(f.refs, { main: 'present' });
  G.report(v, { axes: { 0: 1, 1: -0.5, 2: 0.3, 5: 1, 9: G.hatValue(2) }, press: [3] });
  f = frameOf(state, profile, [v], undefined, fresh);
  assert.equal(f.cmd.roll, -1, 'stick right -> roll right (trainer -1)');
  assert.equal(f.cmd.yaw, -1, 'twist right -> nose right (trainer -1)');
  assert.equal(f.cmd.pitch, J.axisValue(-0.5, profile.axes.Pitch), 'stick forward (raw -) -> nose down');
  assert.equal(f.cmd.lever, J.axisValue(0.3, profile.axes.Throttle), 'collective + = lever up');
  assert.equal(f.cmd.lookYaw, -1, 'hat right -> look right (trainer -1)');
  assert.equal(f.axes.Roll.raw, 1);
  assert.deepEqual([[...f.held], f.pressed, f.released], [['fire'], ['fire'], []]);
  G.report(v, { release: [3], press: [5] });
  f = frameOf(state, profile, [v], undefined, fresh);
  assert.deepEqual([[...f.held], f.pressed, f.released], [['view'], ['view'], ['fire']]);
  // Latched (after a pause, or a press used to identify the sticks): ignored until released.
  J.latchButtons(state);
  G.report(v, { press: [3] });
  f = frameOf(state, profile, [v], undefined, fresh);
  assert.deepEqual([...f.held], []);
  G.report(v, { release: [3, 5] });
  frameOf(state, profile, [v], undefined, fresh);
  G.report(v, { press: [3] });
  assert.deepEqual([...frameOf(state, profile, [v], undefined, fresh).held], ['fire']);
  // Device gone: the keys take the collective back (lever undefined), the device is reported missing.
  f = frameOf(J.createJoyState(), profile, []);
  assert.deepEqual([f.axes.Throttle.status, f.cmd.lever, f.refs.main], ['missing', undefined, 'missing']);
});

test('joyFrame: a latch also covers a pad that reports only after it (stale after a hidden page, plugged again)', () => {
  const profile = vjoyProfile();
  const state = J.createJoyState();
  const fresh = J.createFreshness();
  const v = G.pad({ id: G.VJOY_ID });
  G.report(v);
  frameOf(state, profile, [v], undefined, fresh);
  assert.deepEqual([...frameOf(state, profile, [v], undefined, fresh).held], [], 'live, nothing held');
  // The page was hidden: the values are stale until the next report. The trigger is held across the resume; the frame
  // of the latch still shows the stale state, the next report shows the trigger: it is latched then, not fired.
  J.markStale(fresh);
  v.buttons[3] = { pressed: true, touched: true, value: 1 };
  J.latchButtons(state);
  let f = frameOf(state, profile, [v], undefined, fresh);
  assert.deepEqual([[...f.held], f.pressed], [[], []]);
  G.report(v);
  f = frameOf(state, profile, [v], undefined, fresh);
  assert.deepEqual([[...f.held], f.pressed], [[], []], 'held through the resume: latched on the first report');
  G.report(v, { release: [3] });
  frameOf(state, profile, [v], undefined, fresh);
  G.report(v, { press: [3] });
  assert.deepEqual([...frameOf(state, profile, [v], undefined, fresh).held], ['fire'], 'pressed again: it fires');
  // Plugged again (a new freshness entry: not live until it reports), trigger held: the same.
  const back = J.createFreshness();
  J.latchButtons(state);
  assert.deepEqual([...frameOf(state, profile, [v], undefined, back).held], []);
  G.report(v);
  assert.deepEqual([...frameOf(state, profile, [v], undefined, back).held], [], 'latched on its first live frame');
  // Two pads of the main device ('any'), one that never reports: the other one's latch ends at its release as usual.
  const two = profileWith((p) => {
    p.deviceMatch = 'any';
    p.devices.main = J.modelOf(snap(G.pad({ id: G.VJOY_ID }))[0]);
    p.actions.fire = [{ device: 'main', button: 3 }];
  });
  const a = G.pad({ index: 0, id: G.VJOY_ID });
  const b = G.pad({ index: 1, id: G.VJOY_ID });
  const st = J.createJoyState();
  const fr = J.createFreshness();
  frameOf(st, two, [a, b], undefined, fr);
  G.report(a);
  frameOf(st, two, [a, b], undefined, fr);
  J.latchButtons(st);
  G.report(a, { press: [3] });
  assert.deepEqual([...frameOf(st, two, [a, b], undefined, fr).held], [], 'latched');
  G.report(a, { release: [3] });
  frameOf(st, two, [a, b], undefined, fr);
  G.report(a, { press: [3] });
  assert.deepEqual([...frameOf(st, two, [a, b], undefined, fr).held], ['fire'], 'the silent pad holds nothing back');
});

test('joyFrame: Positive / Negative buttons alone act like the collective keys; any = largest deflection', () => {
  const profile = profileWith((p) => {
    p.axes.Throttle.positive = { device: 'main', button: 0 };
    p.axes.Throttle.negative = { device: 'main', button: 1 };
    Object.assign(p.axes.Pitch, { device: 'main', axis: 1 });
    p.deviceMatch = 'any';
    p.devices.main = J.modelOf(snap(G.pad({ id: G.T16000M_ID }))[0]);
  });
  const [a, b] = twins();
  for (const s of [a, b]) G.report(s, { axes: { 9: G.HAT_CENTRED } });
  G.report(a, { axes: { 1: 0.3 }, press: [1] });
  G.report(b, { axes: { 1: -0.7 } });
  const f = frameOf(J.createJoyState(), profile, [a, b]);
  assert.deepEqual([f.cmd.lever, f.cmd.collective], [undefined, -1]);
  assert.equal(f.cmd.pitch, J.axisValue(-0.7, profile.axes.Pitch), 'the larger deflection of the two sticks');
});

test('joystickMix: a centred stick leaves the input untouched (-0 included); sums clamp; fuel out keeps the keys', () => {
  const zero = { pitch: 0, roll: 0, yaw: 0, collective: 0, lever: undefined, lookYaw: 0, lookPitch: 0 };
  const input = { pitch: -0, yaw: 0.25, roll: -1, collective: 1, mousePitchRate: 3, mouseYawRate: -0 };
  const before = { ...input };
  J.joystickMix(input, zero);
  assert.deepEqual(Object.keys(input), Object.keys(before));
  for (const k of Object.keys(before)) assert.ok(Object.is(input[k], before[k]), k);
  J.joystickMix(input, { ...zero, pitch: 0.5, roll: -0.5, yaw: 1 });
  assert.deepEqual([input.pitch, input.roll, input.yaw], [0.5, -1, 1]);
  const lever = J.joystickMix({ pitch: 0, yaw: 0, roll: 0, collective: 1 }, { ...zero, lever: 0.25 });
  assert.equal(lever.lever, 0.25);
  const hold = J.joystickMix({ pitch: 0, yaw: 0, roll: 0, collective: 0 }, { ...zero, lever: null });
  assert.equal(hold.lever, null);
  const dry = J.joystickMix({ pitch: 0, yaw: 0, roll: 0, collective: -1 }, { ...zero, lever: 1, collective: 1 }, true);
  assert.deepEqual([dry.collective, 'lever' in dry], [-1, false]);
});

test('Flight.step: the lever branch sets or holds the collective; without it the key path is unchanged bit for bit', () => {
  const T = load('vendor/three.min.js');
  const make = () => {
    const f = new P.Flight({ ...P.defaults }, () => 0);
    f.reset(80);
    return f;
  };
  const keys = (i) => ({
    pitch: i % 50 < 20 ? 1 : 0,
    yaw: 0,
    roll: i % 70 < 10 ? -1 : 0,
    collective: i % 90 < 30 ? 1 : i % 90 < 50 ? -1 : 0,
  });
  const a = make();
  const b = make();
  for (let i = 0; i < 600; i++) {
    a.step(1 / 120, keys(i));
    b.step(1 / 120, { ...keys(i), lever: undefined });
  }
  for (const k of ['position', 'velocity', 'quaternion', 'angular', 'cyclic'])
    assert.deepEqual(a[k].toArray(), b[k].toArray(), k);
  assert.ok(Object.is(a.collective, b.collective));
  const c = make();
  c.step(1 / 120, { pitch: 0, yaw: 0, roll: 0, collective: 1, lever: 0.4 });
  assert.equal(c.collective, 0.4, 'the lever position, the keys ignored');
  c.step(1 / 120, { pitch: 0, yaw: 0, roll: 0, collective: -1, lever: null });
  assert.equal(c.collective, 0.4, 'held');
  c.step(1 / 120, { pitch: 0, yaw: 0, roll: 0, collective: 0, lever: 3 });
  assert.equal(c.collective, 1, 'clamped');
  assert.ok(T.Vector3);
});

test('keys and mouse through inputStep are bit-identical with a centred joystick mixed in', () => {
  const cfg = { ...P.defaults };
  const run = (withStick) => {
    const s = P.createInputState();
    const f = new P.Flight(cfg, () => 0);
    f.reset(90);
    const centred = frameOf(J.createJoyState(), vjoyProfile(), [
      G.report(G.pad({ id: G.VJOY_ID }), { axes: { 0: 0.02, 1: -0.03 } }),
    ]).cmd;
    centred.lever = undefined; // the collective axis left unbound in this comparison
    for (let i = 0; i < 480; i++) {
      if (i % 4 === 0) P.mouseMove(s, cfg, (i % 17) - 8, (i % 13) - 6);
      if (i % 2 === 0) P.frameStart(s, cfg, 1 / 60, 2);
      const keys = { pitchUp: i % 60 < 15 ? 1 : 0, yawLeft: i % 80 > 60 ? 1 : 0, collectiveUp: i % 100 < 20 ? 1 : 0 };
      const input = P.inputStep(s, cfg, keys, 1 / 120);
      if (withStick) J.joystickMix(input, centred);
      f.step(1 / 120, input);
    }
    return [f.position.toArray(), f.quaternion.toArray(), f.collective];
  };
  assert.deepEqual(run(true), run(false));
});

test('learnAxis: the axis moved past half its travel since the pad was first seen live; hats are not axes', () => {
  const base = new Map();
  const v = G.report(G.pad({ id: G.VJOY_ID }), { axes: { 9: G.HAT_CENTRED } });
  const live = new Set([0]);
  assert.equal(J.learnAxis(base, snap(v), live), null, 'baseline');
  G.report(v, { axes: { 2: 0.3, 9: G.hatValue(4) } });
  assert.equal(J.learnAxis(base, snap(v), live), null);
  G.report(v, { axes: { 2: -0.8, 5: 0.6 } });
  assert.deepEqual(J.learnAxis(base, snap(v), live), { index: 0, axis: 2, delta: 0.8 });
  assert.equal(J.learnAxis(new Map(), snap(v), new Set()), null, 'a pad that has not reported is not learnt from');
});

test('profile block: defaults (game factory values), round trip, hostile input, notices as codes', () => {
  const d = J.defaultProfile();
  assert.equal(d.schema, 1);
  assert.equal(d.useHotas, false);
  assert.deepEqual(d.devices, { main: null, left: null, right: null });
  assert.deepEqual(
    J.AXES.map((n) => [d.axes[n].axis, d.axes[n].device, d.axes[n].sensitivity, d.axes[n].deadZone]),
    [
      [1, null, 1, 0.05],
      [2, null, 1, 0.05],
      [0, null, 1, 0.05],
      [5, null, 1, 0.05],
      [-1, null, 1, 0.05],
      [-1, null, 1, 0.05],
    ],
  );
  assert.ok(J.isDefaultProfile(J.validateProfile(undefined)));
  assert.ok(J.isDefaultProfile(J.validateProfile(JSON.parse(JSON.stringify(d)))));
  const v = vjoyProfile();
  assert.deepEqual(J.validateProfile(JSON.parse(JSON.stringify(v))), v);
  assert.equal(J.isDefaultProfile(v), false);
  for (const [x, code] of [
    [5, 'invalid'],
    [[], 'invalid'],
    ['x', 'invalid'],
    [{ schema: 2 }, 'schema'],
    [{}, 'schema'],
  ]) {
    const codes = [];
    assert.ok(J.isDefaultProfile(J.validateProfile(x, codes)));
    assert.deepEqual(codes, [code]);
  }
  const codes = [];
  const hostile = JSON.parse(
    JSON.stringify({
      schema: 1,
      useHotas: 'yes',
      deviceMatch: 'constructor',
      confirmRoles: 0,
      devices: {
        main: { vendor: '1234', product: 'BEAD' },
        left: { vendor: '044f', product: 'b10a', slotHint: 99, hatAxis: 1.5, name: 'x'.repeat(300) },
        __proto__: { vendor: '0000', product: '0000' },
      },
      axes: {
        Pitch: { device: 'constructor', axis: 99, invert: 'true', sensitivity: 1e308, deadZone: -1 },
        Roll: { device: 'left', axis: -0, sensitivity: -0 },
        toString: { axis: 3 },
      },
      actions: {
        fire: [
          { device: 'main', button: 3 },
          { device: 'main', button: 200 },
          { device: 'main', button: 4 },
        ],
        view: [{ device: 'main', button: 3 }],
        constructor: [{ device: 'main', button: 9 }],
      },
    }).replace('"__proto__x"', '"__proto__"'),
  );
  const out = J.validateProfile(hostile, codes);
  assert.deepEqual([out.useHotas, out.deviceMatch, out.confirmRoles], [false, 'role', true]);
  assert.equal(out.devices.main, null, 'upper-case hex is not a stored model');
  assert.deepEqual([out.devices.left.slotHint, out.devices.left.hatAxis, out.devices.left.name.length], [0, 9, 64]);
  assert.deepEqual(
    [
      out.axes.Pitch.device,
      out.axes.Pitch.axis,
      out.axes.Pitch.invert,
      out.axes.Pitch.sensitivity,
      out.axes.Pitch.deadZone,
    ],
    [null, 1, false, 3, 0],
  );
  assert.deepEqual([out.axes.Roll.device, out.axes.Roll.sensitivity], ['left', 0.1]);
  assert.ok(Object.is(out.axes.Roll.axis, 0) || out.axes.Roll.axis === 0);
  assert.deepEqual(
    out.actions,
    { fire: [{ device: 'main', button: 3 }] },
    'two sources at most, a used button dropped',
  );
  assert.deepEqual(codes, ['duplicate-button']);
  assert.equal(Object.getPrototypeOf(out.devices), Object.prototype);
  assert.ok(!Object.hasOwn(out.axes, 'toString') && !Object.hasOwn(out.actions, 'constructor'));
});

test('the game section of a synthetic settings file: named fields, positional indices, section scoping', () => {
  for (const text of [ini, ini.replace(/\n/g, '\r\n'), String.fromCharCode(0xfeff) + ini]) {
    const g = J.parseGameJoystick(text);
    assert.deepEqual([g.found, g.useHotas, g.selfCentering], [true, true, false]);
    const vjoy = { vendor: '1234', product: 'bead', name: 'vJoy Device' };
    assert.deepEqual(g.axes.Pitch, {
      device: vjoy,
      axis: 1,
      invert: false,
      sensitivity: 0.8,
      deadZone: 0.1,
      positive: null,
      negative: null,
    });
    assert.deepEqual([g.axes.Yaw.axis, g.axes.Yaw.invert, g.axes.Yaw.deadZone], [5, true, 0.02]);
    assert.deepEqual(g.axes.LookYaw.device, null);
    assert.deepEqual(g.axes.LookYaw.positive, { device: vjoy, button: -1, hat: 0, dir: 'right' });
    assert.deepEqual(
      g.actions.map((a) => [a.gameAction, a.action, a.button]),
      [
        ['Fire', 'fire', 3],
        ['Flares', 'flares', 4],
        ['ToggleCameraMode', 'view', 5],
        ['Horn', null, 6],
      ],
    );
    assert.deepEqual(g.notes, [{ code: 'positional', name: null }]);
    assert.deepEqual(J.gameDevices(g), [vjoy]);
  }
  // No joystick section: nothing found; a key of the same name in another section is never read.
  const none = J.parseGameJoystick(
    ini
      .split('\n')
      .filter((l) => !/^(Pitch|Throttle|Roll|Yaw|Look|Action|\[\/Script\/WDJoy)/.test(l))
      .join('\n'),
  );
  assert.deepEqual([none.found, Object.keys(none.axes).length], [false, 0]);
});

test('the game section parser: size, line, depth, field and string limits; hostile names stay data', () => {
  assert.throws(() => J.parseGameJoystick('x'.repeat(400001)), /too-large/);
  const head = '[/Script/WDJoystick.WDJoystickSettings]';
  const parse = (...lines) => J.parseGameJoystick([head, ...lines].join('\n'));
  assert.deepEqual(parse('Pitch=(' + 'a=1,'.repeat(6000) + 'b=2)').notes, [{ code: 'line-too-long', name: null }]);
  assert.deepEqual(parse('Pitch=' + '('.repeat(8) + ')'.repeat(8)).notes, [{ code: 'unreadable', name: 'Pitch' }]);
  assert.deepEqual(parse('Pitch=(' + 'a=1,'.repeat(4001) + 'b=2)').notes, [{ code: 'unreadable', name: 'Pitch' }]);
  assert.deepEqual(parse(`Pitch=(DeviceIdentifier="${'x'.repeat(201)}")`).notes, [
    { code: 'unreadable', name: 'Pitch' },
  ]);
  assert.deepEqual(parse('Pitch=(DeviceIdentifier="1234:BEAD:x",_a=1').notes, [{ code: 'unreadable', name: 'Pitch' }]);
  const g = parse(
    'Pitch=(__proto__=(constructor=1),DeviceIdentifier="1234:BEAD:x",_a=7,Sensitivity=1e308,DeadZone=NaN)',
    'ActionBindings=(Action=constructor,Binding=(DeviceIdentifier="1234:BEAD:x",_b=2))',
    'ActionBindings=(Action=__proto__,Binding=(DeviceIdentifier="1234:BEAD:x",_b=3))',
    'Unknown=(DeviceIdentifier="1234:BEAD:x",_a=1)',
  );
  assert.deepEqual([g.axes.Pitch.axis, g.axes.Pitch.sensitivity, g.axes.Pitch.deadZone], [7, 1e308, null]);
  assert.deepEqual(
    g.actions.map((a) => a.action),
    [null, null],
  );
  assert.equal(Object.getPrototypeOf(g.axes), Object.prototype);
  assert.deepEqual(J.parseStruct('(a=(b="c,d)"),e=f)'), [
    ['a', [['b', 'c,d)']]],
    ['e', 'f'],
  ]);
});

test('import: the game file mirrored into the profile; a role per device; clamps; conflicts refused', () => {
  const g = J.parseGameJoystick(ini);
  const r = J.importGameJoystick(g, J.defaultProfile(), () => 'main');
  const p = r.profile;
  assert.equal(p.useHotas, true);
  assert.deepEqual(p.devices.main, { vendor: '1234', product: 'bead', name: 'vJoy Device', slotHint: 0, hatAxis: 9 });
  assert.deepEqual(
    ['Pitch', 'Throttle', 'Roll', 'Yaw'].map((n) => [p.axes[n].device, p.axes[n].axis, p.axes[n].sensitivity]),
    [
      ['main', 1, 0.8],
      ['main', 2, 1],
      ['main', 0, 0.6],
      ['main', 5, 0.4],
    ],
  );
  assert.deepEqual(
    [p.axes.LookYaw.device, p.axes.LookYaw.positive, p.axes.LookYaw.negative],
    [null, { device: 'main', dir: 'right' }, { device: 'main', dir: 'left' }],
  );
  assert.deepEqual(p.actions, {
    fire: [{ device: 'main', button: 3 }],
    flares: [{ device: 'main', button: 4 }],
    view: [{ device: 'main', button: 5 }],
  });
  assert.deepEqual([r.skipped, r.conflict, r.codes], [['Horn'], [], []]);
  // Two identical sticks named the same way by the game: the player says which one; an unknown answer unbinds.
  const twin = J.parseGameJoystick(ini.replaceAll('1234:BEAD:vJoy Device', '044F:B10A:T.16000M'));
  const left = J.importGameJoystick(twin, J.defaultProfile(), () => 'left').profile;
  assert.deepEqual([left.axes.Pitch.device, left.devices.left.product, left.devices.main], ['left', 'b10a', null]);
  assert.equal(J.importGameJoystick(twin, J.defaultProfile(), () => 'nobody').profile.axes.Pitch.device, null);
  // Two devices given the same role: refused.
  const two = J.parseGameJoystick(
    ini.replace(/Roll=\(DeviceIdentifier="1234:BEAD:vJoy Device"/, 'Roll=(DeviceIdentifier="044F:B10A:T.16000M"'),
  );
  assert.equal(J.gameDevices(two).length, 2);
  assert.deepEqual(J.importGameJoystick(two, J.defaultProfile(), () => 'main').conflict, ['main']);
  // Out-of-range values from the file are clamped to the trainer's bounds.
  const wild = J.parseGameJoystick(
    ini.replace('Sensitivity=0.800000,DeadZone=0.100000', 'Sensitivity=1e308,DeadZone=-5'),
  );
  const w = J.importGameJoystick(wild, J.defaultProfile(), () => 'main').profile;
  assert.deepEqual([w.axes.Pitch.sensitivity, w.axes.Pitch.deadZone], [3, 0]);
});
