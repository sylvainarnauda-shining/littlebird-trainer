'use strict';
// Repository paths for the tests, relative to this file (no absolute path anywhere in the tests).
// LB_SRC may point the Node tests at another runtime folder (for example an extracted older revision).
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.resolve(process.env.LB_SRC || path.join(ROOT, 'src'));

module.exports = {
  ROOT,
  SRC,
  TEMPLATE: path.join(SRC, 'index.template.html'),
  FIXTURES: path.join(ROOT, 'tests', 'fixtures'),
  GOLDEN: path.join(ROOT, 'tests', 'fixtures', 'golden'),
  RECORDER: path.join(ROOT, 'tools', 'golden'),
  DIST: path.join(ROOT, 'dist', 'web', 'index.html'),
};
