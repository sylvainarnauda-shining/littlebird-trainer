'use strict';
// The text of src/app.js, and slices of it between two markers, for the tests of code that still lives inside app.js
// (the mouse handler, the pointer-lock fallback). The refactor that extracts them into modules replaces these
// slices with plain imports; until then a missing marker fails loudly instead of testing the wrong code.
const fs = require('node:fs');
const path = require('node:path');
const { SRC } = require('./paths');

const source = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');

function slice(startMarker, endMarker) {
  const a = source.indexOf(startMarker);
  const b = source.indexOf(endMarker);
  if (a < 0) throw Error('app.js marker not found: ' + startMarker.trim());
  if (b < 0) throw Error('app.js marker not found: ' + endMarker.trim());
  if (b <= a) throw Error('app.js markers out of order: ' + startMarker.trim() + ' / ' + endMarker.trim());
  return source.slice(a, b);
}

module.exports = { source, slice };
