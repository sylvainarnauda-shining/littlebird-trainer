'use strict';
// Canonical hashing for the golden recorder. Every number is hashed as its IEEE-754 double bytes (little-endian,
// written explicitly, so the platform's byte order does not matter), every value with a one-byte type tag, so equal
// digests mean bit-identical values. Samples kept for diagnosis are written as the big-endian hex of the same bytes.
const crypto = require('node:crypto');

const T_NUM = 1, T_STR = 2, T_TRUE = 3, T_FALSE = 4, T_NULL = 5, T_UNDEF = 6, T_ARR = 7, T_OBJ = 8, T_END = 9, T_BIG = 10;
const scratch = new DataView(new ArrayBuffer(8));
function hex(x) { scratch.setFloat64(0, x, false); return scratch.getBigUint64(0).toString(16).padStart(16, '0'); }
function fromHex(h) { scratch.setBigUint64(0, BigInt('0x' + h)); return scratch.getFloat64(0, false); }

class Hasher {
  constructor() { this.h = crypto.createHash('sha256'); this.buf = Buffer.allocUnsafe(8192); this.n = 0; }
  room(k) { if (this.n + k > this.buf.length) this.flush(); }
  flush() { if (this.n) { this.h.update(this.buf.subarray(0, this.n)); this.n = 0; } }
  num(x) { this.room(9); this.buf[this.n++] = T_NUM; this.buf.writeDoubleLE(+x, this.n); this.n += 8; return this; }
  nums(list) { for (let i = 0; i < list.length; i++) this.num(list[i]); return this; }
  str(s) {
    s = String(s); const b = Buffer.from(s, 'utf8'); this.room(5); this.buf[this.n++] = T_STR; this.buf.writeUInt32LE(b.length, this.n); this.n += 4;
    if (b.length > 4096) { this.flush(); this.h.update(b); } else { this.room(b.length); b.copy(this.buf, this.n); this.n += b.length; }
    return this;
  }
  tag(t) { this.room(1); this.buf[this.n++] = t; return this; }
  bool(v) { return this.tag(v ? T_TRUE : T_FALSE); }
  bytes(u8) { this.str('#bytes'); this.num(u8.length); this.flush(); this.h.update(Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)); return this; }
  // Generic value: arrays in order, plain objects with sorted keys (key order of an object is not part of a golden),
  // typed arrays through their elements as doubles.
  val(v) {
    if (v === null) return this.tag(T_NULL);
    switch (typeof v) {
      case 'number': return this.num(v);
      case 'string': return this.str(v);
      case 'boolean': return this.bool(v);
      case 'undefined': return this.tag(T_UNDEF);
      case 'bigint': return this.tag(T_BIG).str(v.toString());
      case 'function': return this.str('#function');
    }
    if (ArrayBuffer.isView(v)) { this.tag(T_ARR); for (let i = 0; i < v.length; i++) this.num(v[i]); return this.tag(T_END); }
    if (Array.isArray(v)) { this.tag(T_ARR); for (const x of v) this.val(x); return this.tag(T_END); }
    if (typeof v.toArray === 'function' && (v.isVector3 || v.isQuaternion || v.isVector2 || v.isEuler || v.isColor)) return this.val(v.toArray());
    this.tag(T_OBJ); for (const k of Object.keys(v).sort()) { this.str(k); this.val(v[k]); } return this.tag(T_END);
  }
  digest() { this.flush(); return this.h.digest('hex'); }
  peek() { this.flush(); return this.h.copy().digest('hex'); }
}
const hashOf = v => new Hasher().val(v).digest();
// Stable JSON for fixture files: sorted keys only where asked (fixtures build their objects in a fixed order).
function stableStringify(v) { return JSON.stringify(v, null, 1) + '\n'; }
// A diagnostic sample: {field: hex} (numbers), strings and booleans kept as they are.
function sample(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') out[k] = hex(v);
    else if (Array.isArray(v) || ArrayBuffer.isView(v)) out[k] = Array.from(v, x => typeof x === 'number' ? hex(x) : x);
    else out[k] = v;
  }
  return out;
}
module.exports = { Hasher, hashOf, hex, fromHex, stableStringify, sample };
