'use strict';
// G5 engine parity (docs/FIDELITE.md): the golden parity script replayed by the JavaScript engine that runs the game.
// program(P, input) is self-contained (no closure over this module) so that its source text can be evaluated inside
// the page (the packaged app's self-test, a browser spec) as well as in Node (tests/desktop/parity.test.js). It drives
// the page's own flight module P = window.HeliPhysics through the input path exactly as tools/golden/suites/flight.cjs
// runFrames() does, and hashes every step exactly as tools/golden/canon.cjs Hasher does (type tag per value, IEEE-754
// doubles little-endian, running SHA-256, a 16-hex checkpoint every 60 steps), with its own SHA-256 because the page
// has no synchronous digest; it also returns the state every 600 steps (5 s) as the golden's samples do.
// References:
//  - EXPECTED: the golden, recorded in Node 24.19 (V8 13.6); equal to tests/fixtures/golden/parity.json and to the
//    samples of the flight golden's run synthetic/rate-alt (a test checks both).
//  - CHROMIUM: the same script in Chromium's V8 (measured on 30/09/2026: Electron 44.4.5 and 44.5.1 / Chromium
//    152.0.7977.130 / V8 15.2, in the packaged self-test on a GPU and with WARP, and Chrome 154, bit for bit identical).
//    Chromium's V8 computes Math.sin, cos, tan, exp, log, atan2 and the other
//    transcendental functions with a different last bit than Node 24.19's for some inputs (measured; pow, hypot and
//    sqrt agree), so the two digests differ while the trajectories agree to 1.3e-12 m in position over the 60 s
//    (measured). The game itself was measured on video recordings and the model fitted in Node; the trainer was tuned
//    and flown in Chrome: CHROMIUM is what players' engines compute.
// compare(result) is the G5 verdict: the digest is one of the two references, and every sample is within TOLERANCE of
// the Node golden.

const INPUT = {
  generator: 'session-v1',
  seconds: 60,
  seed: 7,
  config: {
    pitchSens: 50,
    yawSens: 40,
    vehicleMultiplier: 1,
    gain: 0.05,
    invertY: false,
    isolation: 0.25,
    mouseReturn: 2.4,
    mouseLaw: 'rate',
    mouseRateScale: 0.339,
    mouseYawScale: 0.339,
    mouseLag: 0.1,
    mouseFine: 1.2,
    mouseClamp: true,
    pitchRate: 52,
    rollRate: 80,
    yawRate: 36,
    cyclicResponse: 0.3,
    response: 0.4,
    cyclicYaw: 0,
    responseYaw: 0.35,
    mouseYawBoost: 1.8,
    mousePitchBoost: 1.65,
    stability: 0,
    altitudeHold: true,
    collectiveUpRate: 3,
    collectiveDownRate: 1,
    holdGain: 0.098,
    holdDamping: 0.075,
    leverHover: -0.14,
    collectiveAccel: 8,
    collectiveDownAccel: 3.5,
    verticalDamping: 0.3,
    drag: 0,
    quadraticDrag: 0.0003,
    bodyFlowDrag: 0.6,
    lateralDrag: 0.12,
    weathervane: 1,
    hoverAssist: 0,
    fovCockpit: 90,
    fovChase: 90,
    cameraMotion: 0,
    speedFov: 0,
    chaseSpeedView: true,
    bulletSpeed: 800,
    rpm: 1500,
    spinUp: 0.35,
    spread: 0.35,
    gunConvergence: 300,
    impactDamage: 0,
    targetSpeed: 65,
    targetDistance: 220,
    targetSize: 1,
    targetCount: 4,
    targetAltitude: 70,
    trajectory: 'evasive',
    scenario: 'air',
    volume: 0.22,
    showMarkers: true,
    duration: 120,
    dpi: 1000,
    airHealth: 120,
    groundHealth: 180,
    indestructible: false,
    baseHealth: 60,
  },
};

const EXPECTED = {
  frames: 6000,
  framesSha256: 'cbe9036f1b32b801d8f20e1735218ebb57c09cbced6944aecd251577ed75a0af',
  final: 'a8197a5b84a8f295d8e0cb823e2eb0c46061c56aaabac34e89071658a310a6fb',
  // The 16-hex running digest every 60 steps (0.5 s), one after another.
  checkpointHex: [
    '47e57dc1897a8932d6acbe408b8a5534f1b5cb026566390cc1cf292885498ea78ce50c43fbac34c253cfad57274b616a',
    'd090ba01f9ffa25a21c852151a6e0b49719ef59be45c4f98cf91799bad9e1044758706ca039df9f4e33f873682a1ec12',
    '7eb8c50979800f28156e9c6891f0591ef80d348e83b87ea2f9221bf72e6f7da8ca35fa90a4ca3d9bc83daa7f9b0af225',
    '35d9ed9d60e606d76a8bed8e8744fe361530975822b31820d7a5ae437ae7e0513d2d22d52ede94872dfc25e654250b48',
    '134733e6eeaa301fd401db57c7cbf31fe7e171d904c2eddb863c02241f90f0d288e280921d14091192659005306b3253',
    '3ee8ce813012a6bb92e942697fc49d9ae79f6007687f8eb6bc6b6668e360f8f0f856d25bf55879f577028108ae906ba2',
    '295a7f4a5213efd132f1d147321d4753dc9e5492c3f409e29e66d530e6d3625b6121ec25a55c10f0dc2d5e697ea1bb3a',
    '5f8f4e02eb149a320231a6704c15b986bd18fe6b1238f6f3c3fb7990c17d428b4246711f6fef854465840195e5ecf86b',
    '1c8efe7452a2ef4e8c562366fdda996a85c180a207e9594d0b21867d6e4080cc9c87e4249d9c28874f0e2bdf8a8fc296',
    '707010a7839e05b7f2c711223ced21f5b2aad8c9bf0c373e435e5d9645adf95a579a804e286d2d4b1ebf4c82a1e78291',
    'e58298507c283d6f03538412d21775c677085ad6f0e4f65de613dcdf4b04e0dbf6139991e9759d9190d15f51d29d442b',
    'd3b59fc337ad3635a12f12fe0e50952cdc4bd906080f26681579f05a7db71446e5c5d7b9ba4ba443bc71e46eb5d372f7',
    '406fa37424595f821df713ef299c5de197989eaf80b815e3adafa885cce6a01543f13982f911ab4e9be52cb9bd866ead',
    '2ebb3bca543862dc59942fadd04a8bbca59c54c67d3513c2aa49124fe4711d6647deda6a787abf1ff56cc0f1aac7c3f1',
    'a95f8f85fcfddada554db7105ec7bc18d98bdf546b7b810b4554375e36ac4f8dd9b454072f82a7324d7fe2a3b738e522',
    'b29e413feec3fc31ceac09a2107f3d7e046b8c95ced4a43691584deecd3202f03e7d8ada267853e43af078c712ebcb34',
    'e5b6e3003df8a181144e1fdddf6a401b4d669a011791fed854048d814fd6b54839fd24050d31165c758bd15cd2012e7c',
    'bcf2aedb2e2078711949f0ffe4c48c0782792f42c77c21616bca3155a00901681c362c94ed2cca2bd3b3f10a53ff6ef7',
    '129640ab1ecc0956a208f5c19fb89c1fe34b0c2369230f190cf499a63af2744176305023bef47985d08a35dc61eb8fca',
    '090308b3e0e4e230f56638e4ca70dd23ee8a909e92d6c8416022503dbfbba5a7dfdf79259e62b13da8197a5b84a8f295',
  ].join(''),
  // State every 600 steps (big-endian IEEE-754 hex): position, velocity, attitude quaternion, collective.
  samples: [
    {
      step: 600,
      p: ['4044a3e2229a0c71', '40767a30709aef1c', '403a829eb36783eb'],
      v: ['4032a39c4c2388f5', 'c02eb74a8499881b', 'c0481483569a4aaf'],
      q: ['3fabbcdc504cbe37', '3fe75393d1ba0913', 'bfe0be1fdfee7677', '3fdc0a1b2d3a2333'],
      collective: '3ff0000000000000',
    },
    {
      step: 1200,
      p: ['4058444f5d021707', '40718d312e7f2580', 'c065bf9b651fa35c'],
      v: ['c0002de2b2797bb9', 'c01317b60383cac7', 'c027afe95f8c099b'],
      q: ['bfdb0b57c695a5d5', 'bfd86b406a22445f', '3f9dbfdc48ef27d9', 'bfea4a7dd4e8da57'],
      collective: 'bff0000000000000',
    },
    {
      step: 1800,
      p: ['40597fafc2e36ede', '406cd011dba88d8d', 'c06bb1db3fa26984'],
      v: ['401586c00f5d9887', 'c0400ed97b4e646b', 'c03b1c71fa4980b5'],
      q: ['3fe2ff72ed0f7a1d', '3fc293b52c311375', '3fe3489e2517affe', 'bfe06bce62087e8b'],
      collective: '3ff0000000000000',
    },
    {
      step: 2400,
      p: ['406cafba7c02d22a', '406220aeab5d6151', 'c07b4332493db88c'],
      v: ['4034c0a909dbc6e1', 'c01a881689249315', 'c04d5f7388129a6e'],
      q: ['3fd460cb3b4dbe79', '3fae72bcabf5ab18', '3fe05df7e36db902', 'bfe9781e9c9f727d'],
      collective: '3ff0000000000000',
    },
    ...[3000, 3600, 4200, 4800, 5400, 6000, 6600, 7200].map((step) => ({
      // Landed at about 25 s: the same state from here on.
      step,
      p: ['407210a1db996860', '3ff4000000000000', 'c08321f08a0c6404'],
      v: ['3fec85ea2ee04cfa', '0000000000000000', 'c04503f6ed8fb89a'],
      q: ['bfe723d133296df0', 'bfd8cd91e368438b', '3fbfb1f8b9822d20', '3fe1dcab2d5143ce'],
      collective: '3ff0000000000000',
    })),
  ],
};

// Chromium's V8 (measured, see the header). An Electron upgrade that changes it fails G5 until it is measured again.
// Provenance: first measured with Electron 44.4.5; measured again after the bump to 44.5.1 (same Chromium and V8
// version strings, with backported V8 fixes) with the packaged self-test's G5 step, identical digest and checkpoints.
const CHROMIUM = {
  measuredWith: {
    electron: '44.5.1',
    chrome: '152.0.7977.130',
    v8: '15.2.124.28-electron.0',
    alsoElectron: '44.4.5',
    alsoChrome: '154.0.8037.58',
  },
  final: '7dd69a12993716bbe8e0812ff55b25a99b071bc64d2fa6a6fbaa2acd5da0caed',
  checkpointHex: [
    'dcd3833d3085d3d5831e396bf3513df1a366ac90ccefebafc5c89465e758f432736f4ee0acc07afbe802869805a96c84',
    '60958868a025258abf52b3e6192086fe43f4f56842606b0cb930b0fff08f9ca0fb216ccf9e2a505f6f92d93d6e357a29',
    '46e9e87736dee87409d7361703dea9154038fdc4ab4c90a1f474333c4a97165183af25cb01d660e672072a3df150730f',
    '027e9f2cc6a1687ff3b85f25b89c2c1abf4e6ba8c21ecbc0c3cbb00881d97748104aff95eb05272800ad30823d7fa3b7',
    '3cccd5cc272b888b9fee730da20cbcec7cd56117a108d4200254414607cdd4aeb9199ac3b342ea564016574d3c3e51b5',
    'f0cf9b9385b407fe53776ff9f99872f114fedf390015ef441d9204b068b05b5b6e39d6d40b97a7da2d2c8a90d6a763aa',
    'e4728c542636df06804914d51475bafb7928a30393ee431be9c42d3e369bff47d419627faad0a08898d6aac957683f64',
    '61b19d2ba0ef81be63adc73839bc2e23bf2d457b8d4e59b9a5deb988a6267c065c9115ca1df850a702773aa95e4f1bbb',
    'dbb019a4eba8434b0de225f6f40111693016dace49f83aa3d1d89080074b4fb0e1bc9e5145f731d2d15be7886d52bfd1',
    'e7c3892a179fc38abc469058ad506a4e02063cc4516a07b74db0d2e2d5fa28a8494e34f3a343fe6da1b7f01ca795a882',
    '1afd3f90c1307c9871ac87f5f256bbd240283370f56d6f5a2dc2bb80f7453eaf43089bd09f14801f5866e981b091cf7f',
    '0155855bf088b723061f68541e1c45bd432a267a2d3871dab18f86f8724cebb860c915c3141ce511fe2c72bc13d678b1',
    'b5a4fc580d25ff4084890fa8988f1fbee73dfdf4611aa9ed3984c277cb874ae8ddadeb71d55d2397fd36be1973723c2e',
    'fb2aaa49c15edafaea3d24a7b6b51203cbf4bb4d8f90f4c30772a7ee2520708a7e1b1f7097919c755add0c9c8c040b86',
    '924ae469cf08c4d42b282862fbc7a6c025ad5be93eb1aaa8c8c0cdf66cf498c403629646d178a9c2e58212dd534416bd',
    '3f58c980e146cbd7f92fd89dc5ee326578ee357492cdafdcc8c9733569b9d3275502a28f9d96111394a25ac49a06ec37',
    'ffd6ad28c01a30e0583754437a8ff0f64239b283c6d15658e4b84fd8d8d5f84f52580eb8fd73175d1227ad19b65a1469',
    'adf64bb49f1ad75b91c9f012167f55136950f05d1f2f41af4fedf0e8a51248c3a62046beec39e077acc1ff920f2500ab',
    '2544a4adc1c3dc279066bd510957325854ef1f0a85e732066db02b785bd5a07f89bd776d78eac4bf579550d197cd9144',
    '55650429c38ceea198ec5ab44ba5d90c1dc3c343563e07686644fd68ad2bcbf6581423eb87745a747dd69a12993716bb',
  ].join(''),
};

// Largest difference from the Node golden accepted in any sample (chosen: a thousand times the measured 1.3e-12 m
// difference of Chromium, and still a billionth of a metre).
const TOLERANCE = { position: 1e-9, velocity: 1e-9, quaternion: 1e-12, collective: 1e-12 };

// The G5 verdict of a program() result.
function compare(r) {
  const dv = new DataView(new ArrayBuffer(8));
  const num = (h) => {
    dv.setBigUint64(0, BigInt('0x' + h));
    return dv.getFloat64(0);
  };
  const maxDelta = { position: 0, velocity: 0, quaternion: 0, collective: 0 };
  const samples = Array.isArray(r && r.samples) ? r.samples : [];
  const complete = samples.length === EXPECTED.samples.length;
  EXPECTED.samples.forEach((want, i) => {
    const got = samples[i];
    if (!got || got.step !== want.step) return;
    const d = (a, b) => Math.max(...a.map((h, j) => Math.abs(num(h) - num(b[j]))));
    maxDelta.position = Math.max(maxDelta.position, d(want.p, got.p));
    maxDelta.velocity = Math.max(maxDelta.velocity, d(want.v, got.v));
    maxDelta.quaternion = Math.max(maxDelta.quaternion, d(want.q, got.q));
    maxDelta.collective = Math.max(maxDelta.collective, Math.abs(num(want.collective) - num(got.collective)));
  });
  const within = complete && Object.keys(TOLERANCE).every((k) => maxDelta[k] <= TOLERANCE[k]);
  const same = (ref) => !!r && r.final === ref.final && r.checkpointHex === ref.checkpointHex;
  const engine = same(EXPECTED) ? 'node' : same(CHROMIUM) ? 'chromium' : 'unknown';
  const script = !!r && r.frames === EXPECTED.frames && r.framesSha256 === EXPECTED.framesSha256 && r.steps === 7200;
  return { ok: script && within && engine !== 'unknown', engine, script, within, maxDelta };
}

function program(P, input) {
  // ---- SHA-256 (FIPS 180-4), streaming, with copy() for the running checkpoints ----
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
    0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
    0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
  ]);
  const W = new Uint32Array(64);
  class Sha256 {
    constructor() {
      this.h = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
      ]);
      this.block = new Uint8Array(64);
      this.fill = 0;
      this.length = 0;
    }
    compress(b) {
      const h = this.h;
      for (let i = 0; i < 16; i++) W[i] = (b[4 * i] << 24) | (b[4 * i + 1] << 16) | (b[4 * i + 2] << 8) | b[4 * i + 3];
      for (let i = 16; i < 64; i++) {
        const x = W[i - 15],
          y = W[i - 2];
        const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let a = h[0],
        bb = h[1],
        c = h[2],
        d = h[3],
        e = h[4],
        f = h[5],
        g = h[6],
        hh = h[7];
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        hh = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = bb;
        bb = a;
        a = (t1 + t2) | 0;
      }
      h[0] += a;
      h[1] += bb;
      h[2] += c;
      h[3] += d;
      h[4] += e;
      h[5] += f;
      h[6] += g;
      h[7] += hh;
    }
    update(bytes, n = bytes.length) {
      this.length += n;
      for (let i = 0; i < n; i++) {
        this.block[this.fill++] = bytes[i];
        if (this.fill === 64) {
          this.compress(this.block);
          this.fill = 0;
        }
      }
    }
    copy() {
      const c = new Sha256();
      c.h.set(this.h);
      c.block.set(this.block);
      c.fill = this.fill;
      c.length = this.length;
      return c;
    }
    hex() {
      const bits = this.length * 8,
        pad = new Uint8Array((this.fill < 56 ? 56 : 120) - this.fill + 8);
      pad[0] = 0x80;
      const hi = Math.floor(bits / 4294967296),
        lo = bits >>> 0;
      const at = pad.length - 8;
      pad[at] = hi >>> 24;
      pad[at + 1] = hi >>> 16;
      pad[at + 2] = hi >>> 8;
      pad[at + 3] = hi;
      pad[at + 4] = lo >>> 24;
      pad[at + 5] = lo >>> 16;
      pad[at + 6] = lo >>> 8;
      pad[at + 7] = lo;
      const saved = this.length;
      this.update(pad);
      this.length = saved;
      let out = '';
      for (const w of this.h) out += (w >>> 0).toString(16).padStart(8, '0');
      return out;
    }
  }
  // ---- the golden Hasher's encoding (tools/golden/canon.cjs) ----
  const T_NUM = 1,
    T_STR = 2,
    T_TRUE = 3,
    T_FALSE = 4,
    T_NULL = 5,
    T_UNDEF = 6,
    T_ARR = 7,
    T_OBJ = 8,
    T_END = 9;
  const utf8 = new TextEncoder();
  class Hasher {
    constructor() {
      this.s = new Sha256();
      this.buf = new Uint8Array(8192);
      this.view = new DataView(this.buf.buffer);
      this.n = 0;
    }
    room(k) {
      if (this.n + k > this.buf.length) this.flush();
    }
    flush() {
      if (this.n) {
        this.s.update(this.buf, this.n);
        this.n = 0;
      }
    }
    tag(t) {
      this.room(1);
      this.buf[this.n++] = t;
    }
    num(x) {
      this.room(9);
      this.buf[this.n++] = T_NUM;
      this.view.setFloat64(this.n, +x, true);
      this.n += 8;
    }
    str(s) {
      const b = utf8.encode(String(s));
      this.room(5);
      this.buf[this.n++] = T_STR;
      this.view.setUint32(this.n, b.length, true);
      this.n += 4;
      this.flush();
      this.s.update(b);
    }
    val(v) {
      if (v === null) return this.tag(T_NULL);
      switch (typeof v) {
        case 'number':
          return this.num(v);
        case 'string':
          return this.str(v);
        case 'boolean':
          return this.tag(v ? T_TRUE : T_FALSE);
        case 'undefined':
          return this.tag(T_UNDEF);
      }
      if (Array.isArray(v)) {
        this.tag(T_ARR);
        for (const x of v) this.val(x);
        return this.tag(T_END);
      }
      if (typeof v.toArray === 'function' && (v.isVector3 || v.isQuaternion || v.isVector2 || v.isEuler))
        return this.val(v.toArray());
      this.tag(T_OBJ);
      for (const k of Object.keys(v).sort()) {
        this.str(k);
        this.val(v[k]);
      }
      return this.tag(T_END);
    }
    peek() {
      this.flush();
      return this.s.copy().hex();
    }
    digest() {
      this.flush();
      return this.s.hex();
    }
  }
  // ---- the parity script: generator 'session-v1' of suites/flight.cjs ----
  const rng = (seed) => {
    let s = seed >>> 0;
    return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  };
  function sessionV1(seconds, seed) {
    const r = rng(seed),
      frames = [];
    let t = 0,
      burst = 0,
      vx = 0,
      vy = 0;
    const keys = {},
      names = [
        'pitchUp',
        'pitchDown',
        'yawLeft',
        'yawRight',
        'rollLeft',
        'rollRight',
        'collectiveUp',
        'collectiveDown',
      ];
    while (t < seconds) {
      const dt = 0.01 * (0.9 + 0.2 * r());
      t += dt;
      if (burst <= 0 && r() < 0.03) {
        burst = Math.floor(5 + r() * 40);
        vx = (r() - 0.5) * 60;
        vy = (r() - 0.5) * 60;
      }
      const ev = [];
      if (burst > 0) {
        burst--;
        const k = 1 + Math.floor(r() * 3);
        for (let j = 0; j < k; j++) ev.push([Math.round(vx * (0.5 + r())), Math.round(vy * (0.5 + r()))]);
      }
      if (r() < 0.02) {
        const n = names[Math.floor(r() * names.length)];
        keys[n] = !keys[n];
      }
      frames.push({ dt, ev, keys: { ...keys } });
    }
    return frames;
  }
  if (input.generator !== 'session-v1') throw new Error('unknown parity generator ' + input.generator);
  const frames = sessionV1(input.seconds, input.seed);
  const fh = new Hasher();
  for (const f of frames) {
    fh.num(f.dt);
    fh.val(f.ev);
    fh.val(f.keys);
  }
  // ---- runFrames(P, cfg, frames, {ground: () => 0}) of suites/flight.cjs, probe fields of probe.cjs ----
  const FLIGHT = [
    'position',
    'velocity',
    'quaternion',
    'angular',
    'cyclic',
    'mouseRate',
    'collective',
    'verticalAccel',
  ];
  FLIGHT.push('lift', 'sideslip', 'onGround', 'crashed', 'time');
  const MOUSE = ['mousePitch', 'mouseYaw', 'accX', 'accY', 'accT', 'ratePitch', 'rateYaw'];
  const DT = 1 / 120,
    cfg = JSON.parse(JSON.stringify(input.config));
  const flight = new P.Flight(cfg, () => 0);
  flight.reset(400);
  const s = P.createInputState(),
    h = new Hasher(),
    checkpoints = [],
    samples = [];
  const bits = new DataView(new ArrayBuffer(8));
  const hex = (x) => {
    bits.setFloat64(0, x);
    return bits.getBigUint64(0).toString(16).padStart(16, '0');
  };
  let steps = 0,
    acc = 0;
  for (const fr of frames) {
    for (const [dx, dy] of fr.ev) P.mouseMove(s, cfg, dx, dy);
    const dt = Math.min(fr.dt, 0.1);
    acc += dt;
    let n = 0;
    for (let a = acc; a >= DT; a -= DT) n++;
    P.frameStart(s, cfg, dt, n);
    while (acc >= DT) {
      flight.step(DT, P.inputStep(s, cfg, fr.keys, DT, false, false));
      acc -= DT;
      for (const k of FLIGHT) h.val(flight[k]);
      for (const k of MOUSE) h.num(s[k]);
      steps++;
      if (steps % 60 === 0) checkpoints.push(h.peek().slice(0, 16));
      if (steps % 600 === 0)
        samples.push({
          step: steps,
          p: Array.from(flight.position.toArray(), hex),
          v: Array.from(flight.velocity.toArray(), hex),
          q: Array.from(flight.quaternion.toArray(), hex),
          collective: hex(flight.collective),
        });
    }
  }
  const result = { frames: frames.length, framesSha256: fh.digest(), steps, final: h.digest() };
  return { ...result, checkpointHex: checkpoints.join(''), samples };
}

// The expression evaluated in a page: the program applied to the page's flight module and the input.
const pageExpression = () => `(${program.toString()})(window.HeliPhysics, ${JSON.stringify(INPUT)})`;

module.exports = { INPUT, EXPECTED, CHROMIUM, TOLERANCE, program, compare, pageExpression };
