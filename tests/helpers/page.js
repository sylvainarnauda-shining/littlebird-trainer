'use strict';
// The page of the golden recorder, for the tests that need what the mocked DOM of mock-dom.js cannot give: the minimal
// DOM of tools/golden/dom.cjs keeps every listener of an element in registration order, runs them when an event is
// dispatched, and parses the real template (classes, data-* attributes, select options). The clock and the random draws
// are the recorder's, so a boot is reproducible. The helpers of the page are the recorder's (createPage): click(id or
// element), setInput(id, value), el(id), toast(), storage; page.app is the test hook of the page.
const path = require('node:path');
const { RECORDER, SRC, TEMPLATE } = require('./paths');

const { loadRuntime, createPage } = require(path.join(RECORDER, 'harness.cjs'));
const runtime = loadRuntime({ src: SRC, template: TEMPLATE });

const openPage = (options) => createPage(runtime, { audio: false, ...options });

module.exports = { openPage };
