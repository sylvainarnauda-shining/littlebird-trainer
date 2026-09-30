'use strict';
// A real 2D canvas in Node (@napi-rs/canvas, pinned dev dependency): the scenery and model textures draw into it, and
// the mocked-DOM tests read HUD pixels back from it.
const { createCanvas } = require('@napi-rs/canvas');

const canvas = (w, h) => createCanvas(w, h);

module.exports = { createCanvas, canvas };
