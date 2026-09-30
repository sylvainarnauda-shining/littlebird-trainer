'use strict';
// Scene and model digests (G2g): the object tree in child order with names, types, visibility, transforms, render
// flags, geometry buffers (bytes), material parameters, colours, shader sources, textures (canvas draw logs or data
// bytes) and instance buffers. Object UUIDs and ids are never read (three.js draws UUIDs from its own stream; ids count
// every object ever created), so a digest only moves when what would be drawn moves.
const { Hasher } = require('./canon.cjs');

const MAT_KEYS = ['type', 'name', 'side', 'transparent', 'opacity', 'depthWrite', 'depthTest', 'blending', 'vertexColors', 'flatShading', 'alphaTest', 'visible', 'toneMapped', 'fog',
  'roughness', 'metalness', 'envMapIntensity', 'emissiveIntensity', 'wireframe', 'sizeAttenuation', 'size', 'linewidth', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits',
  'colorWrite', 'premultipliedAlpha', 'dithering', 'shininess', 'reflectivity', 'clearcoat', 'aoMapIntensity', 'lightMapIntensity', 'bumpScale', 'normalMapType'];
const COLOR_KEYS = ['color', 'emissive', 'specular', 'sheenColor'];
const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'envMap', 'lightMap', 'displacementMap', 'specularMap', 'gradientMap'];

const SHADER_OF = { MeshStandardMaterial: 'standard', MeshPhysicalMaterial: 'physical', MeshBasicMaterial: 'basic', MeshLambertMaterial: 'lambert', MeshPhongMaterial: 'phong', PointsMaterial: 'points', LineBasicMaterial: 'basic', MeshToonMaterial: 'toon', MeshMatcapMaterial: 'matcap' };
class SceneHasher {
  constructor(T) { this.T = T; this.geo = new Map(); this.mat = new Map(); this.tex = new Map(); this.counts = { objects: 0, meshes: 0, instanced: 0, instances: 0, geometries: 0, materials: 0, textures: 0, vertices: 0 }; }
  bytes(h, arr) { if (!arr) return h.str('#null'); h.str(arr.constructor.name); h.bytes(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)); }
  texture(t) {
    if (!t) return 'null'; if (this.tex.has(t)) return this.tex.get(t);
    const h = new Hasher(); h.str(t.constructor && t.constructor.name || 'Texture');
    for (const k of ['wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'format', 'type', 'colorSpace', 'flipY', 'generateMipmaps', 'premultiplyAlpha', 'unpackAlignment']) h.val(t[k]);
    h.val([t.repeat, t.offset, t.center, t.rotation]);
    const img = t.image;
    if (img && img.localName === 'canvas') { h.str('canvas').num(img.width).num(img.height); h.str(img.__hash ? img.__hash.peek() : '-'); }
    else if (img && img.data) { h.str('data').num(img.width || 0).num(img.height || 0).num(img.depth || 0); this.bytes(h, img.data); }
    else if (Array.isArray(img)) { h.str('array').num(img.length); }
    else h.str(img ? 'image' : 'none');
    const d = h.digest().slice(0, 16); this.tex.set(t, d); this.counts.textures++; return d;
  }
  geometry(g) {
    if (!g) return 'null'; if (this.geo.has(g)) return this.geo.get(g);
    const h = new Hasher(); h.str(g.type || 'BufferGeometry');
    for (const name of Object.keys(g.attributes || {}).sort()) { const a = g.attributes[name]; h.str(name).num(a.itemSize).bool(!!a.normalized).num(a.count); this.bytes(h, a.array); if (a.meshPerAttribute) h.num(a.meshPerAttribute); }
    if (g.index) { h.str('index'); this.bytes(h, g.index.array); }
    h.val((g.groups || []).map(x => [x.start, x.count, x.materialIndex ?? 0])); h.val([g.drawRange.start, g.drawRange.count]);
    if (g.morphAttributes) h.num(Object.keys(g.morphAttributes).length);
    const d = h.digest().slice(0, 16); this.geo.set(g, d); this.counts.geometries++; this.counts.vertices += g.attributes && g.attributes.position ? g.attributes.position.count : 0; return d;
  }
  material(m) {
    if (!m) return 'null'; if (this.mat.has(m)) return this.mat.get(m);
    const h = new Hasher(); for (const k of MAT_KEYS) h.val(m[k]);
    for (const k of COLOR_KEYS) h.val(m[k] && m[k].isColor ? m[k].toArray() : null);
    for (const k of TEX_KEYS) h.str(this.texture(m[k]));
    if (m.vertexShader) h.str(m.vertexShader); if (m.fragmentShader) h.str(m.fragmentShader); if (m.defines) h.val(m.defines);
    if (m.uniforms) for (const k of Object.keys(m.uniforms).sort()) { const v = m.uniforms[k] && m.uniforms[k].value; h.str(k); if (v && v.isTexture) h.str(this.texture(v)); else if (v && (v.isVector2 || v.isVector3 || v.isVector4 || v.isColor || v.isQuaternion || v.isMatrix4 || v.isMatrix3)) h.val(Array.from(v.toArray ? v.toArray() : v.elements)); else if (typeof v === 'object' && v !== null) h.str('#object'); else h.val(v); }
    // A shader patch is code (its text changes with formatting): its output is hashed instead, i.e. the shader sources and
    // uniforms it produces from three.js's own sources for the material's type, as the renderer's compile step would.
    if (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') && typeof m.onBeforeCompile === 'function') {
      const lib = this.T && this.T.ShaderLib && this.T.ShaderLib[SHADER_OF[m.type] || 'standard'], sh = { vertexShader: lib ? lib.vertexShader : '', fragmentShader: lib ? lib.fragmentShader : '', uniforms: {} };
      try { m.onBeforeCompile(sh, null); h.str('patched').str(sh.vertexShader).str(sh.fragmentShader); for (const k of Object.keys(sh.uniforms).sort()) { const v = sh.uniforms[k] && sh.uniforms[k].value; h.str(k); h.val(v && v.toArray ? v.toArray() : typeof v === 'object' && v !== null ? '#object' : v); } }
      catch (e) { h.str('patch-error:' + (e && e.message)); }
    }
    if (Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') && typeof m.customProgramCacheKey === 'function') h.str(String(m.customProgramCacheKey()));
    if (m.defaultAttributeValues) h.val(m.defaultAttributeValues);
    if (m.userData) h.val(Object.fromEntries(Object.entries(m.userData).filter(([, v]) => typeof v !== 'function' && (typeof v !== 'object' || v === null || Array.isArray(v)))));
    const d = h.digest().slice(0, 16); this.mat.set(m, d); this.counts.materials++; return d;
  }
  object(h, o) {
    this.counts.objects++;
    h.str(o.type || 'Object3D').str(o.name || '').bool(!!o.visible).val([o.position, o.quaternion, o.scale]).val([!!o.castShadow, !!o.receiveShadow, o.renderOrder || 0, o.frustumCulled !== false, o.matrixAutoUpdate !== false]);
    if (o.layers) h.num(o.layers.mask);
    // userData: primitives, arrays of primitives, and plain objects of those (model points, hitbox tables); references skipped.
    const prim = v => v === null || ['number', 'string', 'boolean'].includes(typeof v), arr = v => Array.isArray(v) && v.every(prim);
    if (o.userData) for (const k of Object.keys(o.userData).sort()) { const v = o.userData[k];
      if (prim(v) || arr(v)) h.str('ud.' + k).val(v);
      else if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype || v && typeof v === 'object' && v.constructor && v.constructor.name === 'Object') { const ok = Object.values(v).every(x => prim(x) || arr(x)); if (ok) h.str('ud.' + k).val(v); } }
    if (o.geometry) { h.str(this.geometry(o.geometry)); this.counts.meshes++; }
    if (o.material) { if (Array.isArray(o.material)) for (const m of o.material) h.str(this.material(m)); else h.str(this.material(o.material)); }
    if (o.isInstancedMesh) { this.counts.instanced++; this.counts.instances += o.count; h.num(o.count); const im = o.instanceMatrix; if (im) { h.str('instanceMatrix'); h.bytes(new Uint8Array(im.array.buffer, im.array.byteOffset, Math.min(im.array.byteLength, o.count * 16 * im.array.BYTES_PER_ELEMENT))); }
      if (o.instanceColor) { h.str('instanceColor'); const a = o.instanceColor.array; h.bytes(new Uint8Array(a.buffer, a.byteOffset, Math.min(a.byteLength, o.count * 3 * a.BYTES_PER_ELEMENT))); } }
    if (o.isLight) { h.val([o.color && o.color.toArray(), o.intensity, o.distance, o.decay, o.angle, o.penumbra, o.groundColor && o.groundColor.toArray()]); if (o.shadow) h.val([o.shadow.bias, o.shadow.normalBias, o.shadow.mapSize, o.shadow.radius]); }
    if (o.isCamera) h.val([o.fov, o.near, o.far, o.aspect, o.zoom, o.left, o.right, o.top, o.bottom]);
    if (o.isSprite && o.center) h.val(o.center);
    if (o.isLOD && o.levels) h.val(o.levels.map(l => l.distance));
    h.num(o.children.length); for (const c of o.children) this.object(h, c);
  }
  digest(root, extra) { const h = new Hasher(); this.object(h, root); if (root.isScene) { h.val(root.fog ? [root.fog.color.toArray(), root.fog.density ?? null, root.fog.near ?? null, root.fog.far ?? null] : null); h.str(this.texture(root.background && root.background.isTexture ? root.background : null)); h.val(root.background && root.background.isColor ? root.background.toArray() : null); } if (extra) h.val(extra); return h.digest(); }
}
function sceneDigest(root, T) { const s = new SceneHasher(T); const d = s.digest(root); return { digest: d, counts: s.counts }; }
// Draw logs of every canvas the page created (textures, minimap, previews), by creation order; the HUD is excluded.
// text: the canvas's words (advisory; the strict log keeps only their numbers, dom.cjs).
function canvasDigests(doc) { return doc.canvases.filter(c => c.id !== 'hud').map(c => ({ canvas: c.canvasId, id: c.id || null, w: c.width, h: c.height, ops: c._ctx ? c._ctx.__self.ops : 0, log: c.__hash ? c.__hash.peek().slice(0, 16) : '-', text: c.__text ? c.__text.peek().slice(0, 16) : '-' })); }
module.exports = { SceneHasher, sceneDigest, canvasDigests };
