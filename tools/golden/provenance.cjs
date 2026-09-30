'use strict';
// Provenance of the recorder: the sha256 (raw bytes and LF-normalised text) of every file that defines the golden
// inputs and digests: the recorder's own .cjs and .json files and suites/*.cjs, by name relative to the recorder
// folder (no path). record.cjs writes it into meta.json and a check compares it: a recorder change and a runtime
// change must never be confused. A recorder change is accepted only through prove-recorder.cjs (a recording of the
// frozen baseline with the changed recorder reproduces every fixture byte for byte, meta.json apart from this field).
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const lf = b => Buffer.from(b.toString('latin1').replace(/\r\n?/g, '\n'), 'latin1');
function recorderManifest(dir = __dirname) {
  const files = {}, add = rel => { const b = fs.readFileSync(path.join(dir, rel)); files[rel] = { sha256: sha(b), sha256_lf: sha(lf(b)) }; };
  for (const f of fs.readdirSync(dir).sort()) if (/\.(cjs|json)$/.test(f)) add(f);
  for (const f of fs.readdirSync(path.join(dir, 'suites')).sort()) if (f.endsWith('.cjs')) add('suites/' + f);
  return files;
}
module.exports = { recorderManifest };
