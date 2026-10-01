'use strict';
// Fake Gamepad API pads for the joystick tests, never the machine's: ids as Chromium on Windows writes them (public
// product identifiers: the vJoy virtual device, the T.16000M stick, an XInput pad), axes and buttons set by the test, and
// a timestamp that moves only when the test says the device sent a report.
const VJOY_ID = 'vJoy Device (Vendor: 1234 Product: bead)';
const T16000M_ID = 'T.16000M (Vendor: 044f Product: b10a)';
const XINPUT_ID = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)';
const OTHER_ID = 'Manette test (Vendor: 1234 Product: 5678)';
// A hat switch at rest: Chromium keeps the HID null state above 1 (8 -> 9/7, 15 -> 23/7).
const HAT_CENTRED = 9 / 7;
const HAT_CENTRED_15 = 23 / 7;
// Hat direction k (0 = up, clockwise) as Chromium reports it.
const hatValue = (k) => (2 * k) / 7 - 1;

function pad({ index = 0, id = VJOY_ID, axes = 10, buttons = 32, mapping = '', timestamp = 1, hat = null } = {}) {
  const p = {
    index,
    id,
    mapping,
    connected: true,
    timestamp,
    axes: Array(axes).fill(0),
    buttons: Array.from({ length: buttons }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  if (hat !== null) p.axes[9] = hat;
  return p;
}

// The device sent a report: its axes and buttons change as given, its timestamp moves on.
function report(p, { axes = {}, press = [], release = [] } = {}) {
  for (const [i, v] of Object.entries(axes)) p.axes[Number(i)] = v;
  for (const i of press) p.buttons[i] = { pressed: true, touched: true, value: 1 };
  for (const i of release) p.buttons[i] = { pressed: false, touched: false, value: 0 };
  p.timestamp += 4;
  return p;
}

// A scripted navigator: getGamepads() answers four slots (null where empty), as Chromium 152 does, and counts its calls.
function fakeNavigator(pads = []) {
  const nav = {
    calls: 0,
    pads,
    getGamepads() {
      nav.calls++;
      const slots = [null, null, null, null];
      for (const p of nav.pads) slots[p.index] = p;
      return slots;
    },
  };
  return nav;
}

module.exports = {
  VJOY_ID,
  T16000M_ID,
  XINPUT_ID,
  OTHER_ID,
  HAT_CENTRED,
  HAT_CENTRED_15,
  hatValue,
  pad,
  report,
  fakeNavigator,
};
