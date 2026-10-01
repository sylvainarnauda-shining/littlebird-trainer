'use strict';
// The helicopter's exterior against the key points measured on the reference recordings (check F37: bundle adjustment
// on game frames; the frames themselves stay private): hub, stabiliser, boom, skids, grips, cowl recess, boom top and
// end cap, the rotor band by speed; then the measured appearance features, the helicopter-only light terms and the own
// paint colour measured on the recordings (CIELAB).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');
const { source } = require('../helpers/app-source');

const T = load('vendor/three.min.js');
const Models = load('models.js').create(T);
const v = (x, y, z) => new T.Vector3(x, y, z);

test('F37 measured key points: hub 1.768, stabiliser 1.721 / x 0.836, rotor on the hub, skids at -1.25', () => {
  const h = Models.helicopter('#97897a');
  const p = h.group.userData.points;
  h.group.updateMatrixWorld(true);
  assert.ok(
    Math.abs(p.hub[1] - 1.768) < 1e-9 && Math.abs(p.stabL[1] - 1.721) < 1e-9 && Math.abs(p.stabR[0] - 0.836) < 1e-9,
    'measured tail and hub',
  );
  assert.ok(
    Math.abs(new T.Vector3().setFromMatrixPosition(h.rotor.matrixWorld).y - p.hub[1]) < 1e-9,
    'rotor on the hub key point',
  );
  const bb = new T.Box3().setFromObject(h.group);
  assert.ok(Math.abs(bb.min.y + 1.25) < 0.03, 'skids still at -1.25');
});

test('F37 no always-lit lights; rotor band full at 60 km/h, half at 37.5, none in a 22 km/h hover (band 25-50 km/h)', () => {
  const h = Models.helicopter('#97897a');
  let lights = 0;
  h.group.traverse((o) => {
    if (o.isMesh && o.material.isMeshBasicMaterial && o.material.userData.part !== 'disc') lights++;
  });
  assert.equal(lights, 0, 'no always-lit nav lights or beacon');
  assert.ok(h.beacon && h.beacon.isObject3D, 'beacon placeholder for app.js');
  const blade = h.materials.blade;
  h.spin(1, 60 / 3.6);
  assert.equal(blade.visible, false);
  assert.equal(h.disc.visible, true);
  assert.ok(Math.abs(h.disc.material.opacity - 0.35) < 1e-9, 'band full at 60 km/h');
  h.spin(1, 22 / 3.6);
  assert.equal(blade.visible, false);
  assert.equal(h.disc.visible, false, 'hovering at 22 km/h: stubs only, no band');
  h.spin(1, 37.5 / 3.6);
  assert.ok(Math.abs(h.disc.material.opacity - 0.175) < 1e-9, 'band half at 37.5 km/h');
  h.spin(0, 60 / 3.6);
  assert.equal(blade.visible, true);
  assert.equal(h.disc.visible, false, 'running rotor: stubs only + edge-on band from 25-50 km/h');
});

test('F37 closed nose, tail rotor disc in its plane, rocket pods on the AH-6R variant', () => {
  const h = Models.helicopter('#97897a');
  h.group.updateMatrixWorld(true);
  const rc = new T.Raycaster();
  const objs = [];
  h.group.traverse((o) => {
    if (o.isMesh && o.visible) objs.push(o);
  });
  let inside = 0;
  let n = 0;
  for (let x = -0.3; x <= 0.301; x += 0.05) {
    for (let y = -0.1; y <= 0.701; y += 0.05) {
      rc.set(v(x, y, -3), v(0, 0, 1));
      const hit = rc.intersectObjects(objs, false)[0];
      n++;
      if (hit && !['paint', 'glass'].includes(hit.object.material.userData.part)) inside++;
    }
  }
  assert.equal(inside, 0, 'nose rays entering the cabin: ' + inside + ' of ' + n);
  const tip = () => {
    const m = h.tail.children.find((o) => o.material === h.materials.tail);
    m.updateMatrixWorld(true);
    const a = m.geometry.attributes.position;
    const q = new T.Vector3();
    const xs = [];
    for (let i = 0; i < a.count; i += 7) xs.push(q.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld).x);
    return xs;
  };
  const x0 = tip();
  h.tail.rotation.y += 1.1;
  h.group.updateMatrixWorld(true);
  const x1 = tip();
  assert.ok(
    x0.every((x, i) => Math.abs(x - x1[i]) < 1e-6),
    'tail rotor disc stays in its plane',
  );
  const r = Models.helicopter('#c09072', { weapons: 'rockets' });
  let pods = 0;
  r.group.traverse((o) => {
    if (
      o.isMesh &&
      o.geometry.type === 'BufferGeometry' &&
      o.material.color &&
      o.material.color.getHexString() === '4d5246'
    )
      pods++;
  });
  assert.ok(pods >= 1, 'AH-6R pods');
  let meshes = 0;
  r.group.traverse((o) => {
    if (o.isMesh) meshes++;
  });
  assert.ok(meshes <= 24, 'rocket variant draw calls: ' + meshes);
});

test('F37 measured features: cowl aft face at z 1.215 with a dark recess, boom top 0.93 at z 2.4, open exhaust, dark boom end cap at z 4.985, 0.81 m grips, door openings', () => {
  const h = Models.helicopter();
  const g = h.group;
  g.updateMatrixWorld(true);
  const rc = new T.Raycaster();
  const objs = [];
  g.traverse((o) => {
    if (o.isMesh && o.visible && o.material.visible !== false && !(o.material.transparent && o.material.opacity < 0.5))
      objs.push(o);
  });
  const first = (o, d) => {
    rc.set(o, d);
    return rc.intersectObjects(objs, false)[0];
  };
  let hit = first(v(0, 1.12, 3), v(0, 0, -1));
  assert.ok(
    hit && hit.object.material.userData.recess && Math.abs(hit.point.z - 1.215) < 0.02,
    'dark recess of the cowl aft face',
  );
  hit = first(v(0, 1.33, 3), v(0, 0, -1));
  assert.ok(
    hit && hit.object.material.userData.part === 'paint' && Math.abs(hit.point.z - 1.2) < 0.02,
    'painted upper aft face',
  );
  for (const x of [-0.2, 0.2]) {
    hit = first(v(x, 1.12, 3), v(0, 0, -1));
    assert.ok(
      hit && hit.object.material.userData.part === 'paint' && Math.abs(hit.point.z - 1.2) < 0.03,
      'recess 0.30 m wide, paint beside it',
    );
  }
  hit = first(v(0, 3, 2.4), v(0, -1, 0));
  assert.ok(
    hit && hit.object.material.userData.part === 'paint' && Math.abs(hit.point.y - 0.93) < 0.03,
    'boom top at z 2.4',
  );
  hit = first(v(0, -0.07, 3), v(0, 0, -1));
  assert.ok(
    hit && hit.object.material.userData.part === 'interior' && hit.point.z > 1.1 && hit.point.z < 1.2,
    'exhaust interior dark',
  );
  hit = first(v(-0.03, 0.575, 6.5), v(0, 0, -1));
  assert.ok(hit && hit.object.material.userData.part === 'gun' && Math.abs(hit.point.z - 4.985) < 0.02, 'boom end cap');
  let grip = null;
  h.rotor.traverse((o) => {
    if (o.isMesh && o.material.userData.part === 'grip') grip = o;
  });
  assert.ok(grip, 'grip material');
  const p = grip.geometry.attributes.position;
  const q = new T.Vector3();
  let rmax = 0;
  grip.updateMatrixWorld(true);
  const inv = new T.Matrix4().copy(h.rotor.matrixWorld).invert();
  for (let i = 0; i < p.count; i++) {
    q.fromBufferAttribute(p, i).applyMatrix4(grip.matrixWorld).applyMatrix4(inv);
    rmax = Math.max(rmax, Math.hypot(q.x, q.z));
  }
  assert.ok(Math.abs(rmax - 0.81) < 0.03, 'grip reach: ' + rmax.toFixed(3));
  hit = first(v(0.2, 1.66, 3), v(0, 0, -1));
  assert.ok(hit && hit.object.material.userData.part === 'hub', 'solid block under the grips from behind');
  for (const s of [-1, 1]) {
    const a = (45 * Math.PI) / 180;
    hit = first(v(s * Math.sin(a) * 2, 0.308 + Math.cos(a) * 2, -0.9), v(-s * Math.sin(a), -Math.cos(a), 0));
    assert.ok(hit && hit.object.material.userData.part !== 'paint', 'upper door opening at 45 deg');
  }
});

test('F37 cabin plan measured from above-behind: fuller ahead of the widest section, unchanged behind it', () => {
  // The lower shell 0.5 m below the cabin axis (y 0.308; under the door openings, above the weapon plank), from both
  // sides: the half-widths of models.js FWD (widest 1.46 m at z -0.9 on the axis, 1.40 m at the A-post). v13's egg at
  // this height: 0.512 / 0.600 / 0.616 / 0.583 m at z -1.45 / -0.9 / -0.4 / 0.15.
  const g = Models.helicopter().group;
  g.updateMatrixWorld(true);
  const objs = [];
  g.traverse((o) => {
    if (o.isMesh && o.visible && o.material.visible !== false && !(o.material.transparent && o.material.opacity < 0.5))
      objs.push(o);
  });
  const rc = new T.Raycaster();
  const half = (z) =>
    [1, -1].map((s) => {
      rc.set(v(3 * s, 0.308 - 0.5, z), v(-s, 0, 0));
      const hit = rc.intersectObjects(objs, false)[0];
      assert.ok(hit && hit.object.material.userData.part === 'paint', 'cabin shell at z ' + z);
      return Math.abs(hit.point.x);
    });
  for (const [z, want] of [
    [-1.45, 0.569],
    [-0.9, 0.627],
    [-0.4, 0.616],
    [0.15, 0.583],
  ]) {
    const [r, l] = half(z);
    assert.ok(
      Math.abs(r - want) < 0.003 && Math.abs(l - want) < 0.003,
      `half-width at z ${z}: ${r.toFixed(4)} / ${l.toFixed(4)}`,
    );
  }
});

test('helicopter-only light terms: occlusion baked per vertex on the patched parts, shader terms on them only; cost within budget', () => {
  const h = Models.helicopter();
  const g = h.group;
  g.updateMatrixWorld(true);
  const patched = new Set(['paint', 'gun', 'hub', 'pylon', 'cowlPanel', 'grip']);
  let paintAo = null;
  g.traverse((o) => {
    if (!o.isMesh) return;
    const part = o.material.userData.part;
    if (patched.has(part) || o.material.userData.recess) {
      const a = o.geometry.attributes.aoV;
      assert.ok(a && a.count === o.geometry.attributes.position.count, 'aoV on ' + part);
      assert.ok(
        a.array.every((x) => x >= 0 && x <= 1),
        'aoV in 0..1',
      );
      assert.ok(String(o.material.customProgramCacheKey()).startsWith('lbLook'), 'light terms on ' + part);
      if (part === 'paint' && o.parent === g && (!paintAo || a.count > paintAo.length))
        paintAo = Array.from(a.array).sort((x, y) => x - y);
    } else if (part)
      assert.ok(!String(o.material.customProgramCacheKey()).startsWith('lbLook'), 'no light terms on ' + part);
  });
  const q = (f) => paintAo[Math.floor(f * (paintAo.length - 1))];
  assert.ok(q(0.5) > 0.6 && q(0.1) < 0.45, 'paint occlusion: open surfaces with dark creases');
  let tris = 0;
  let meshes = 0;
  g.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      const gg = o.geometry;
      tris += (gg.index ? gg.index.count : gg.attributes.position.count) / 3;
    }
  });
  assert.ok(meshes <= 22 && tris <= 8724 * 1.3, 'meshes ' + meshes + ', triangles ' + tris);
  const top = [];
  g.traverse((o) => {
    if (!o.isMesh || o.material.userData.part !== 'paint' || !o.geometry.attributes.aoV) return;
    const pos = o.geometry.attributes.position;
    const nor = o.geometry.attributes.normal;
    const ao = o.geometry.attributes.aoV.array;
    const a = new T.Vector3();
    const m = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      a.fromBufferAttribute(pos, i);
      m.fromBufferAttribute(nor, i);
      if (a.z > 5.45 && a.y > 1.65 && a.y < 1.8 && Math.abs(a.x) < 0.7 && m.y > 0.9) top.push(ao[i]);
    }
  });
  top.sort((x, y) => x - y);
  assert.ok(top.length > 100 && top[Math.floor(top.length / 2)] > 0.9, 'stabiliser top open to the sky');
  const own = Models.helicopter('#9f9081').materials.paint;
  const bot = Models.helicopter('#ddb07d', { weapons: 'rockets', livery: true }).materials.paint;
  const c0 = new T.Color('#9f9081');
  const c1 = new T.Color('#ddb07d');
  assert.ok(
    Math.abs(own.color.r / c0.r - bot.color.r / c1.r) < 1e-6 &&
      Math.abs(own.color.b / c0.b - bot.color.b / c1.b) < 1e-6,
    'same paint factor for every livery',
  );
  assert.notEqual(
    own.customProgramCacheKey(),
    bot.customProgramCacheKey(),
    'livery sky-light mode differs from the measured paint',
  );
});

test('own paint measured on the recordings: CIELAB 53.8 / 14.2 / 77.6; sun response and grazing top cut on every livery, not on the cowl panel', () => {
  assert.equal(Models.OWN_PAINT, '#a58f76', 'own paint colour');
  assert.ok(
    /models\.helicopter\(models\.OWN_PAINT,/.test(source) && !/models\.helicopter\('#9f9081'/.test(source),
    'app.js builds the own helicopter with the measured colour',
  );
  const sc = Models.LOOK.paintScale;
  const c = new T.Color(Models.OWN_PAINT);
  const fin = [c.r * sc[0], c.g * sc[1], c.b * sc[2]];
  const f = (x) => (x > 216 / 24389 ? Math.cbrt(x) : ((24389 / 27) * x + 16) / 116);
  const X = (0.4124564 * fin[0] + 0.3575761 * fin[1] + 0.1804375 * fin[2]) / 0.95047;
  const Y = 0.2126729 * fin[0] + 0.7151522 * fin[1] + 0.072175 * fin[2];
  const Z = (0.0193339 * fin[0] + 0.119192 * fin[1] + 0.9503041 * fin[2]) / 1.08883;
  const L = 116 * f(Y) - 16;
  const a = 500 * (f(X) - f(Y));
  const b = 200 * (f(Y) - f(Z));
  const C = Math.hypot(a, b);
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  assert.ok(
    Math.abs(L - 53.8) < 0.3 && Math.abs(C - 14.2) < 0.3 && Math.abs(hue - 77.6) < 1,
    `own albedo CIELAB L ${L.toFixed(2)} C ${C.toFixed(2)} h ${hue.toFixed(1)}`,
  );
  const mOwn = Models.helicopter().materials;
  const mBot = Models.helicopter('#ddb07d', { weapons: 'rockets', livery: true }).materials;
  assert.equal(
    mOwn.paint.color.getHex(),
    new T.Color(Models.OWN_PAINT).multiply(new T.Color(sc[0], sc[1], sc[2])).getHex(),
    'helicopter() defaults to the own paint',
  );
  const tail = (m) => String(m.customProgramCacheKey()).split('|').slice(-3).join('|');
  assert.equal(Models.LOOK.topSun, undefined, 'no sunlit-top term');
  assert.equal(tail(mOwn.paint), '1|1.1|0.3', 'own paint: sun response and top cut');
  assert.equal(tail(mBot.paint), '1|1.1|0.3', 'bot paint: same paint law');
  assert.equal(tail(mOwn.cowlPanel), '0|1|1', 'cowl panel keeps its own light terms');
  const chunks =
    '#include <common>\n#include <begin_vertex>\n#include <lights_fragment_maps>\n#include <aomap_fragment>\n';
  const sh = { vertexShader: chunks, fragmentShader: chunks };
  mOwn.paint.onBeforeCompile(sh);
  assert.ok(
    sh.fragmentShader.includes('#if NUM_DIR_LIGHTS == 1') &&
      /directDiffuse\*=1\.1000\*pow\(max\(saturate\(dot\(normal,directionalLights\[0\]\.direction\)\),1e-4\),1\.0000\);/.test(
        sh.fragmentShader,
      ),
    'sun response compiled for the single sun',
  );
  assert.ok(
    /indirectSpecular\*=mix\(1\.,0\.3000,smoothstep\(0\.3000,0\.9000,inverseTransformDirection\(normal,viewMatrix\)\.y\)\*lbG\)/.test(
      sh.fragmentShader,
    ),
    'grazing top cut compiled',
  );
  const sh2 = { vertexShader: chunks, fragmentShader: chunks };
  mOwn.cowlPanel.onBeforeCompile(sh2);
  assert.ok(
    !sh2.fragmentShader.includes('NUM_DIR_LIGHTS == 1') && !sh2.fragmentShader.includes('0.3000,smoothstep'),
    'no colour-stage terms on the cowl panel',
  );
});
