'use strict';
// Closing the page during a session (declared behaviour): in a browser tab, Ctrl+W closes the tab and no page can
// cancel it, while the game's default keys put collective down on Left Ctrl and pitch down on W. While a session is in
// progress (flying or paused, not over) the page's beforeunload handler asks the browser to confirm; in the menu before
// any session and on the results screen it does not. One boot, Math.random seeded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp } = require('../helpers/mock-dom');
const { seedMathRandom, SEED } = require('../helpers/rng');

seedMathRandom(SEED + 111);
const S = bootApp();
const { app, diag, windowCallbacks } = S;
// A beforeunload event as the browser dispatches it; true when the page asks to confirm leaving.
const asksToConfirm = () => {
  const e = {
    type: 'beforeunload',
    defaultPrevented: false,
    returnValue: undefined,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  windowCallbacks.beforeunload(e);
  return e.defaultPrevented;
};

test('the page listens to beforeunload', () => {
  assert.equal(typeof windowCallbacks.beforeunload, 'function');
});

test('no confirmation in the menu before any session', () => {
  assert.equal(diag().running, false);
  assert.equal(asksToConfirm(), false);
});

test('a confirmation while a session flies and while it is paused', () => {
  app.setConfig({ scenario: 'free', duration: 0 });
  app.start();
  assert.equal(diag().running, true);
  assert.equal(asksToConfirm(), true, 'flying');
  app.pause();
  assert.equal(diag().running, false);
  assert.equal(asksToConfirm(), true, 'paused');
  app.resume();
  assert.equal(asksToConfirm(), true, 'resumed');
});

test('no confirmation once the session is over (results screen)', () => {
  app.finish('Session terminée');
  assert.equal(asksToConfirm(), false);
});
