'use strict';
// Loads the game's runtime modules in Node the way the page shares them (CommonJS exports of each script), from
// src/ or LB_SRC, with three.js's deprecation banner silenced.
const path = require('node:path');
const { SRC } = require('./paths');

function load(name) {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return require(path.join(SRC, name));
  } finally {
    console.warn = warn;
  }
}

// Every module app.js expects on window, keyed by its global name.
function modules() {
  const T = load('vendor/three.min.js');
  return {
    T,
    P: load('physics.js'),
    W: load('world.js'),
    M: load('missiles.js'),
    A: load('audio.js'),
    G: load('ground.js'),
    B: load('bot.js'),
    S: load('settings.js'),
    F: load('forest.js'),
    Models: load('models.js'),
    buildScenery: load('scenery.js'),
  };
}

module.exports = { SRC, load, modules };
