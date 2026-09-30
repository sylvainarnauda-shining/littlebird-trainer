'use strict';
// Recording Web Audio for the golden recorder: the app's SoundEngine builds its graph and schedules its sounds as in
// a browser (so it draws from the game's random stream as it does there), but nothing is rendered. Every node
// creation, connection, property write, parameter automation and start/stop goes into a hash log; buffers are hashed
// when first attached to a source. currentTime follows the harness clock from the context's creation, in 128-frame
// render quanta at 48 kHz (a browser's audio clock advances by quanta; its phase against the frames is assumed).
const { Hasher } = require('./canon.cjs');
const PARAMS = new Set(['gain', 'frequency', 'Q', 'detune', 'playbackRate', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release', 'delayTime', 'offset']);

function createAudioClass(page) {
  return class AudioContext {
    constructor() {
      const log = page.audioLog; this.sampleRate = 48000; this.state = 'running'; this._t0 = page.clock(); this._n = 0; this._buffers = 0; this.baseLatency = 0.01; this.outputLatency = 0.02;
      const ctx = this, rec = (...a) => { page.audioOps++; const h = page.audioLog; if (!h) return; h.str(a[0]); for (let i = 1; i < a.length; i++) h.val(a[i]); };
      this._rec = rec; rec('context', this.sampleRate); void log;
      const node = kind => {
        const id = ctx._n++, props = {}, params = {};
        rec('create', kind, id);
        const self = {
          __id: id, __kind: kind, context: ctx, numberOfInputs: 1, numberOfOutputs: 1,
          connect(dst, o = 0, i = 0) { rec('connect', id, dst && dst.__id !== undefined ? dst.__id : dst && dst.__param ? dst.__param : 'destination', o, i); return dst; },
          disconnect(dst) { rec('disconnect', id, dst && dst.__id !== undefined ? dst.__id : dst === undefined ? 'all' : 'other'); },
          start(when = 0, offset, duration) { rec('start', id, when, offset === undefined ? null : offset, duration === undefined ? null : duration); },
          stop(when = 0) { rec('stop', id, when); },
          addEventListener() {}, removeEventListener() {}
        };
        const param = name => {
          if (params[name]) return params[name]; let value = 0; const tag = id + '.' + name;
          const p = { __param: tag, get value() { return value; }, set value(v) { value = +v; rec('set', tag, value); }, defaultValue: 0, minValue: -3.4028234663852886e38, maxValue: 3.4028234663852886e38 };
          for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime', 'setValueCurveAtTime'])
            p[m] = (...a) => { rec(m, tag, ...a.map(x => ArrayBuffer.isView(x) ? Array.from(x) : x)); return p; };
          return (params[name] = p);
        };
        return new Proxy(self, {
          get(t, k) { if (k in t) return t[k]; if (typeof k === 'string' && PARAMS.has(k)) return param(k); return props[k]; },
          set(t, k, v) {
            if (k === 'buffer' && v && v.__buffer !== undefined) { if (!v.__hashed) { v.__hashed = true; const h = new Hasher(); for (let c = 0; c < v.numberOfChannels; c++) h.bytes(new Uint8Array(v.getChannelData(c).buffer)); v.__digest = h.digest(); } rec('buffer', id, v.__buffer, v.__digest); }
            else rec('prop', id, String(k), typeof v === 'object' && v !== null ? '#object' : v);
            props[k] = v; return true;
          }
        });
      };
      this._node = node; this.destination = node('destination'); this.listener = node('listener');
    }
    get currentTime() { const q = 128 / this.sampleRate, t = (this._clock() - this._t0) / 1000; return Math.floor(t / q + 1e-9) * q; }
    _clock() { return page.clock(); }
    createGain() { return this._node('gain'); } createBiquadFilter() { return this._node('biquad'); } createDynamicsCompressor() { return this._node('compressor'); }
    createConvolver() { return this._node('convolver'); } createBufferSource() { return this._node('bufferSource'); } createOscillator() { return this._node('oscillator'); }
    createStereoPanner() { return this._node('stereoPanner'); } createDelay() { return this._node('delay'); } createAnalyser() { return this._node('analyser'); }
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length)), id = this._buffers++;
      this._rec('createBuffer', id, channels, length, sampleRate);
      return { __buffer: id, numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: c => data[c], copyToChannel(src, c, o = 0) { data[c].set(src, o); }, copyFromChannel(dst, c, o = 0) { dst.set(data[c].subarray(o, o + dst.length)); } };
    }
    resume() { this.state = 'running'; this._rec('resume'); return Promise.resolve(); }
    suspend() { this.state = 'suspended'; this._rec('suspend'); return Promise.resolve(); }
    close() { this.state = 'closed'; this._rec('close'); return Promise.resolve(); }
    addEventListener() {} removeEventListener() {}
  };
}
module.exports = { createAudioClass };
