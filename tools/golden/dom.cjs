'use strict';
// Minimal DOM for the golden recorder: the page template parsed into an element tree (ids, classes, data-*, hidden,
// disabled, form values with the browser's select semantics), simple selectors, events with several listeners per
// type, canvases whose 2D context records every call into a hash sink instead of drawing (font rasterisation differs
// by platform; measureText uses a synthetic metric, stated below). No layout, no CSS, no network, no real input.
const { Hasher } = require('./canon.cjs');

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);

// The DOM classes are made by a factory so that a page may own a private set of them: the pointer-lock shim boot
// (hookapi suite) exposes Element and Document to the page, whose automation shim patches their prototypes; with
// classes of its own that patch cannot reach the other pages of the recording.
function makeDom() {
class Text { constructor(data) { this.nodeType = 3; this.data = data; this.parentNode = null; } get textContent() { return this.data; } set textContent(v) { this.data = String(v); } remove() { if (this.parentNode) this.parentNode._removeChild(this); } }

class Element {
  constructor(doc, tag, attrs = []) {
    this.ownerDocument = doc; this.nodeType = 1; this.localName = tag.toLowerCase(); this.tagName = this.localName.toUpperCase();
    this._attrs = new Map(attrs); this.childNodes = []; this.parentNode = null; this._listeners = new Map(); this.style = {};
    this.dataset = {}; for (const [k, v] of this._attrs) if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = v;
    this._value = null; this._checked = this._attrs.has('checked'); this._innerHTML = null; this.serial = doc._serial++;
    if (this.localName === 'canvas') { this._width = +(this._attrs.get('width') || 300); this._height = +(this._attrs.get('height') || 150); this._ctx = null; this.canvasId = doc._canvasSerial++; doc.canvases.push(this); }
  }
  // attributes
  getAttribute(n) { return this._attrs.has(n) ? this._attrs.get(n) : null; }
  setAttribute(n, v) { v = String(v); this._attrs.set(n, v); if (n === 'id') this.ownerDocument._ids.set(v, this); if (n.startsWith('data-')) this.dataset[n.slice(5).replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = v; }
  removeAttribute(n) { this._attrs.delete(n); }
  hasAttribute(n) { return this._attrs.has(n); }
  get id() { return this._attrs.get('id') || ''; } set id(v) { this.setAttribute('id', v); }
  get className() { return this._attrs.get('class') || ''; } set className(v) { this._attrs.set('class', String(v)); }
  get classList() {
    const el = this, list = () => el.className.split(/\s+/).filter(Boolean), write = a => el._attrs.set('class', a.join(' '));
    return { add: (...c) => { const a = list(); for (const x of c) if (!a.includes(x)) a.push(x); write(a); }, remove: (...c) => write(list().filter(x => !c.includes(x))),
      contains: c => list().includes(c), toggle: (c, force) => { const has = list().includes(c), on = force === undefined ? !has : !!force; if (on && !has) write([...list(), c]); if (!on && has) write(list().filter(x => x !== c)); return on; },
      get length() { return list().length; }, get value() { return el.className; } };
  }
  get hidden() { return this._attrs.has('hidden'); } set hidden(v) { if (v) this._attrs.set('hidden', ''); else this._attrs.delete('hidden'); }
  get disabled() { return this._attrs.has('disabled'); } set disabled(v) { if (v) this._attrs.set('disabled', ''); else this._attrs.delete('disabled'); }
  get type() { return this.localName === 'input' ? (this._attrs.get('type') || 'text') : this.localName === 'button' ? (this._attrs.get('type') || 'submit') : this.localName === 'select' ? 'select-one' : ''; }
  get min() { return this._attrs.get('min') ?? ''; } get max() { return this._attrs.get('max') ?? ''; } get step() { return this._attrs.get('step') ?? ''; }
  get name() { return this._attrs.get('name') ?? ''; }
  // form values (strings, as in a browser). Range inputs keep the assigned string: clamping and step snapping of a
  // browser are not modelled (every value the app or a script writes is in range and on the step grid: assumed).
  get options() { return this.localName === 'select' ? this.querySelectorAll('option') : undefined; }
  get value() {
    if (this.localName === 'select') { const o = this.options, i = this.selectedIndex; return i >= 0 ? o[i].value : ''; }
    if (this.localName === 'option') return this._attrs.has('value') ? this._attrs.get('value') : this.textContent.trim();
    if (this._value !== null) return this._value;
    if (this.localName === 'input' && this.type === 'range') { const a = +(this.min || 0), b = +(this.max || 100); return String(b < a ? a : a + (b - a) / 2); }
    if (this.localName === 'input' && this.type === 'checkbox') return this._attrs.get('value') ?? 'on';
    return this._attrs.get('value') ?? '';
  }
  set value(v) {
    v = v === null || v === undefined ? '' : String(v);
    if (this.localName === 'select') { const o = this.options; this._selected = o.findIndex(x => x.value === v); return; }
    if (this.localName === 'option') { this._attrs.set('value', v); return; }
    this._value = v;
  }
  get selectedIndex() {
    if (this.localName !== 'select') return undefined; const o = this.options;
    if (this._selected !== undefined && this._selected < o.length) return this._selected;
    const s = o.findIndex(x => x._attrs.has('selected')); return s >= 0 ? s : o.length ? 0 : -1;
  }
  set selectedIndex(i) { this._selected = i; }
  get checked() { return this._checked; } set checked(v) { this._checked = !!v; }
  // tree
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; } get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get firstElementChild() { return this.children[0] || null; } get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  _adopt(n) { if (typeof n === 'string') n = new Text(n); if (n.parentNode) n.parentNode._removeChild(n); n.parentNode = this; return n; }
  _removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; }
  appendChild(n) { this.childNodes.push(this._adopt(n)); return n; }
  append(...ns) { for (const n of ns) this.childNodes.push(this._adopt(n)); }
  prepend(...ns) { this.childNodes.unshift(...ns.map(n => this._adopt(n))); }
  insertBefore(n, ref) { const i = ref ? this.childNodes.indexOf(ref) : -1; n = this._adopt(n); if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); return n; }
  removeChild(n) { this._removeChild(n); return n; }
  replaceChildren(...ns) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; this.append(...ns); this._innerHTML = null; }
  remove() { if (this.parentNode) this.parentNode._removeChild(this); }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  set textContent(v) { this.replaceChildren(); if (v !== '' && v !== null && v !== undefined) this.childNodes.push(this._adopt(String(v))); }
  get innerText() { return this.textContent; } set innerText(v) { this.textContent = v; }
  // innerHTML is kept as the string written (not parsed): the app writes result cards with it and reads nothing back.
  get innerHTML() { return this._innerHTML ?? this.textContent; } set innerHTML(v) { this.replaceChildren(); this._innerHTML = String(v); }
  querySelectorAll(sel) { return select(this, sel, false); }
  querySelector(sel) { return select(this, sel, true)[0] || null; }
  closest(sel) { const m = compile(sel); for (let x = this; x && x.nodeType === 1; x = x.parentNode) if (m.some(c => matches(x, c))) return x; return null; }
  matches(sel) { return compile(sel).some(c => matches(this, c)); }
  // events
  addEventListener(type, fn) { if (!fn) return; if (!this._listeners.has(type)) this._listeners.set(type, []); const l = this._listeners.get(type); if (!l.includes(fn)) l.push(fn); }
  removeEventListener(type, fn) { const l = this._listeners.get(type); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
  dispatchEvent(ev) { return dispatch(this, ev); }
  click() { if (this.disabled) return; dispatch(this, makeEvent('click', { target: this })); }
  focus() { this.ownerDocument.activeElement = this; } blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  getBoundingClientRect() { return { left: 0, top: 0, right: this.ownerDocument.defaultView.innerWidth, bottom: this.ownerDocument.defaultView.innerHeight, width: this.ownerDocument.defaultView.innerWidth, height: this.ownerDocument.defaultView.innerHeight, x: 0, y: 0 }; }
  scrollIntoView() {}
  // canvas
  get width() { return this.localName === 'canvas' ? this._width : +(this._attrs.get('width') || 0); } set width(v) { if (this.localName === 'canvas') { this._width = Math.max(0, Math.floor(+v || 0)); if (this._ctx) this._ctx.__reset(); } else this._attrs.set('width', String(v)); }
  get height() { return this.localName === 'canvas' ? this._height : +(this._attrs.get('height') || 0); } set height(v) { if (this.localName === 'canvas') { this._height = Math.max(0, Math.floor(+v || 0)); if (this._ctx) this._ctx.__reset(); } else this._attrs.set('height', String(v)); }
  getContext(kind) { if (this.localName !== 'canvas' || kind !== '2d') return null; if (!this._ctx) this._ctx = makeContext2D(this); return this._ctx; }
  toDataURL() { return 'data:,'; }
}
// ---- HTML parser (the page template: explicit tags, attributes in quotes or bare) ----
function parse(doc, html) {
  const root = doc.documentElement = new Element(doc, 'html'); let stack = [root], i = 0;
  const top = () => stack[stack.length - 1];
  while (i < html.length) {
    if (html.startsWith('<!--', i)) { const e = html.indexOf('-->', i + 4); i = e < 0 ? html.length : e + 3; continue; }
    if (html.startsWith('<!', i)) { const e = html.indexOf('>', i); i = e < 0 ? html.length : e + 1; continue; }
    if (html[i] === '<' && html[i + 1] === '/') { const e = html.indexOf('>', i), name = html.slice(i + 2, e).trim().toLowerCase(); i = e + 1;
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].localName === name) { stack = stack.slice(0, k); break; } continue; }
    if (html[i] === '<' && /[a-zA-Z]/.test(html[i + 1] || '')) {
      const m = /^<([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/.exec(html.slice(i));
      if (!m) { top().appendChild(new Text('<')); i++; continue; }
      const name = m[1].toLowerCase(), attrs = [];
      for (const a of m[2].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs.push([a[1].toLowerCase(), decode(a[2] ?? a[3] ?? a[4] ?? '')]);
      i += m[0].length;
      if (name === 'html') { for (const [k, v] of attrs) root._attrs.set(k, v); continue; }
      const el = new Element(doc, name, attrs); top().appendChild(el); if (el.id) doc._ids.set(el.id, el);
      if (name === 'head') doc.head = el; if (name === 'body') doc.body = el;
      if (RAW.has(name)) { const e = html.toLowerCase().indexOf('</' + name, i); const text = html.slice(i, e < 0 ? html.length : e); if (text) el.appendChild(new Text(name === 'title' || name === 'textarea' ? decode(text) : text)); i = e < 0 ? html.length : html.indexOf('>', e) + 1; continue; }
      if (!VOID.has(name) && !m[3]) stack.push(el);
      continue;
    }
    const e = html.indexOf('<', i + (html[i] === '<' ? 1 : 0)), text = html.slice(i, e < 0 ? html.length : e); i = e < 0 ? html.length : e;
    if (text) top().appendChild(new Text(decode(text)));
  }
  if (!doc.body) { doc.body = new Element(doc, 'body'); root.appendChild(doc.body); }
  if (!doc.head) { doc.head = new Element(doc, 'head'); root.prepend(doc.head); }
}

class Document {
  constructor(html, view) {
    this.defaultView = view; this._ids = new Map(); this._serial = 0; this._canvasSerial = 0; this._paintSerial = 0; this.canvases = []; this._listeners = new Map();
    this.nodeType = 9; this.pointerLockElement = null; this.hidden = false; this.visibilityState = 'visible'; this.fullscreenElement = null;
    // Where canvases without their own sink record: a function (canvas) -> Hasher|null (textures: one hasher per canvas).
    this._canvasSink = c => { if (!c.__hash) c.__hash = new Hasher(); return c.__hash; };
    parse(this, html); this.activeElement = this.body;
  }
  getElementById(id) { return this._ids.get(String(id)) || null; }
  querySelectorAll(sel) { return select(this.documentElement, sel, false); }
  querySelector(sel) { return select(this.documentElement, sel, true)[0] || null; }
  createElement(tag) { return new Element(this, String(tag)); }
  createTextNode(t) { return new Text(String(t)); }
  addEventListener(type, fn) { if (!fn) return; if (!this._listeners.has(type)) this._listeners.set(type, []); const l = this._listeners.get(type); if (!l.includes(fn)) l.push(fn); }
  removeEventListener(type, fn) { const l = this._listeners.get(type); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
  dispatchEvent(ev) { return dispatch(this, ev); }
  get _listenersOf() { return this._listeners; }
}
Document.prototype.exitPointerLock = function () { if (this.pointerLockElement) { this.pointerLockElement = null; this.defaultView.setTimeout(() => dispatch(this, makeEvent('pointerlockchange', { target: this })), 0); } };
return { Document, Element, Text };
}
function makeEvent(type, props = {}) {
  const ev = { type, bubbles: true, cancelable: true, defaultPrevented: false, propagationStopped: false, timeStamp: 0, ...props };
  ev.preventDefault = () => { ev.defaultPrevented = true; }; ev.stopPropagation = () => { ev.propagationStopped = true; }; ev.stopImmediatePropagation = () => { ev.propagationStopped = true; };
  return ev;
}
// Listeners of the target in registration order, then its on<type> handler; no bubbling (the app listens on the
// document or on the element itself; the harness dispatches to the one the browser would reach first).
function dispatch(target, ev) {
  if (!ev.target) ev.target = target; ev.currentTarget = target;
  for (const fn of [...(target._listeners.get(ev.type) || [])]) fn.call(target, ev);
  const h = target['on' + ev.type]; if (typeof h === 'function') h.call(target, ev);
  return !ev.defaultPrevented;
}

// ---- selectors: compound (tag, #id, .class, [attr], [attr="v"]) with descendant and child combinators, and lists ----
function compile(sel) {
  return sel.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const parts = []; let comb = ' ';
    for (const tok of s.match(/[^\s>]+(?:\[[^\]]*\])*|>/g)) { if (tok === '>') { comb = '>'; continue; } parts.push({ comb, c: compound(tok) }); comb = ' '; }
    return parts;
  });
}
function compound(tok) {
  const c = { tag: null, id: null, classes: [], attrs: [] }; const re = /([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:([~|^$*]?=)"?([^"\]]*)"?)?\]/g; let m;
  while ((m = re.exec(tok))) { if (m[1]) c.tag = m[1].toLowerCase(); else if (m[2]) c.id = m[2]; else if (m[3]) c.classes.push(m[3]); else c.attrs.push({ n: m[4], op: m[5], v: m[6] }); }
  return c;
}
function one(el, c) {
  if (c.tag && el.localName !== c.tag) return false; if (c.id && el.id !== c.id) return false;
  if (c.classes.length) { const cl = el.className.split(/\s+/); if (!c.classes.every(x => cl.includes(x))) return false; }
  for (const a of c.attrs) { if (!el._attrs.has(a.n)) return false; if (a.op === '=' && el._attrs.get(a.n) !== a.v) return false; if (a.op === '~=' && !el._attrs.get(a.n).split(/\s+/).includes(a.v)) return false; }
  return true;
}
function matches(el, parts) {
  let i = parts.length - 1; if (!one(el, parts[i].c)) return false;
  let cur = el;
  while (i > 0) {
    const comb = parts[i].comb; i--;
    if (comb === '>') { cur = cur.parentElement; if (!cur || !one(cur, parts[i].c)) return false; }
    else { cur = cur.parentElement; while (cur && !one(cur, parts[i].c)) cur = cur.parentElement; if (!cur) return false; }
  }
  return true;
}
function select(root, sel, first) {
  const lists = compile(sel), out = [];
  const walk = n => { for (const c of n.childNodes) { if (c.nodeType !== 1) continue; if (lists.some(p => matches(c, p))) { out.push(c); if (first) return true; } if (walk(c) && first) return true; } return false; };
  walk(root); return out;
}

// ---- recording 2D context ----
const CTX_METHODS = ['arc', 'arcTo', 'beginPath', 'bezierCurveTo', 'clearRect', 'clip', 'closePath', 'drawFocusIfNeeded', 'drawImage', 'ellipse', 'fill', 'fillRect', 'fillText',
  'lineTo', 'moveTo', 'putImageData', 'quadraticCurveTo', 'rect', 'reset', 'resetTransform', 'restore', 'rotate', 'roundRect', 'save', 'scale', 'setLineDash', 'setTransform', 'stroke',
  'strokeRect', 'strokeText', 'transform', 'translate', 'createConicGradient', 'createImageData', 'createLinearGradient', 'createPattern', 'createRadialGradient', 'getContextAttributes',
  'getImageData', 'getLineDash', 'getTransform', 'isContextLost', 'isPointInPath', 'isPointInStroke', 'measureText'];
const CTX_STATE = { fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, lineDashOffset: 0, font: '10px sans-serif',
  textAlign: 'start', textBaseline: 'alphabetic', direction: 'inherit', letterSpacing: '0px', wordSpacing: '0px', fontKerning: 'auto', globalCompositeOperation: 'source-over', shadowBlur: 0, shadowColor: 'rgba(0, 0, 0, 0)',
  shadowOffsetX: 0, shadowOffsetY: 0, imageSmoothingEnabled: true, imageSmoothingQuality: 'low', filter: 'none' };
// Text on canvases. The draw log keeps a text's numbers (the values the HUD shows, with their sign) and the call; its
// words go to a separate text log (textSink / the canvas's __text). Both are strict goldens; only a declared wording
// step (record.cjs --wording-step) lets the text log differ while the number log stays strict. Synthetic text metric
// (chosen, not measured, not a browser's): width = font size x (3 + 0.55 x the number of digits), so layouts that
// centre text on its width are reproducible on every platform and do not move when words or punctuation change, only
// when the numbers shown do.
const fontPx = f => { const m = /(\d+(?:\.\d+)?)px/.exec(f); return m ? +m[1] : 10; };
const TEXT_CALLS = new Set(['fillText', 'strokeText', 'measureText']);
// Numbers with their sign ('-', '+' or the typographic minus U+2212) unless the sign follows a digit (a range such as
// '3-4' gives 3 and 4).
const numbersOf = t => String(t).match(/(?<!\d)[-+\u2212]?\d+(?:[.,]\d+)?/g) || [];
const digits = t => (String(t).match(/\d/g) || []).length;
function argOut(h, a) {
  if (a && typeof a === 'object') {
    if (a.__kind === 'gradient' || a.__kind === 'pattern') return h.str(a.__kind + '#' + a.__id);
    if (a.localName === 'canvas') return h.str('canvas#' + a.canvasId).num(a.width).num(a.height);
    if (a.data && ArrayBuffer.isView(a.data)) return h.str('imagedata').num(a.width).num(a.height).bytes(a.data);
    if (a.isTexture || a.image) return h.str('image');
  }
  return h.val(a);
}
function makeContext2D(canvas) {
  const doc = canvas.ownerDocument; let state = { ...CTX_STATE }, stack = [], dash = [];
  // sink: undefined = the document's per-canvas hasher (textures); a Hasher, or null for "count only" (the HUD between
  // recorded frames), when the harness sets it through ctx.__self.
  const self = { canvas, sink: undefined, textSink: undefined, ops: 0, __reset() { state = { ...CTX_STATE }; stack = []; dash = []; this.rec('#reset', [canvas.width, canvas.height]); },
    rec(name, args) {
      this.ops++; const h = this.sink !== undefined ? this.sink : doc._canvasSink(canvas); if (!h) return; h.str(name); h.num(args.length);
      if (TEXT_CALLS.has(name)) { h.str('#text').val(numbersOf(args[0])); const th = this.textSink !== undefined ? this.textSink : (canvas.__text || (canvas.__text = new Hasher())); if (th) th.str(name).str(String(args[0])); for (let i = 1; i < args.length; i++) argOut(h, args[i]); return; }
      for (const a of args) argOut(h, a);
    } };
  const special = {
    save() { stack.push({ ...state, __dash: dash.slice() }); }, restore() { const s = stack.pop(); if (s) { dash = s.__dash; delete s.__dash; state = s; } },
    reset() { state = { ...CTX_STATE }; stack = []; dash = []; },
    setLineDash(a) { dash = Array.from(a || []); }, getLineDash() { return dash.slice(); },
    measureText(t) { const px = fontPx(state.font), w = px * (3 + .55 * digits(t)); return { width: w, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w, actualBoundingBoxAscent: px * .8, actualBoundingBoxDescent: px * .2, fontBoundingBoxAscent: px * .8, fontBoundingBoxDescent: px * .2 }; },
    createImageData(w, h) { if (w && typeof w === 'object') { h = w.height; w = w.width; } return { width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)), colorSpace: 'srgb' }; },
    getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)), colorSpace: 'srgb' }; },
    createLinearGradient() { return gradient(); }, createRadialGradient() { return gradient(); }, createConicGradient() { return gradient(); },
    createPattern() { return { __kind: 'pattern', __id: doc._paintSerial++, setTransform() {} }; },
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, is2D: true, isIdentity: true }; },
    getContextAttributes() { return { alpha: true, desynchronized: false, colorSpace: 'srgb', willReadFrequently: false }; },
    isContextLost() { return false; }, isPointInPath() { return false; }, isPointInStroke() { return false; }
  };
  function gradient() { const g = { __kind: 'gradient', __id: doc._paintSerial++, addColorStop(o, c) { self.rec('addColorStop#' + g.__id, [o, c]); } }; return g; }
  const methods = {};
  for (const m of CTX_METHODS) methods[m] = (...args) => { self.rec(m, args); return special[m] ? special[m](...args) : undefined; };
  return new Proxy(self, {
    get(t, p) { if (p === 'canvas') return canvas; if (p === '__self') return self; if (p === '__reset') return () => self.__reset(); if (typeof p !== 'string') return undefined; if (Object.hasOwn(methods, p)) return methods[p]; if (Object.hasOwn(state, p)) return state[p]; return undefined; },
    set(t, p, v) { self.rec('=' + String(p), [v]); state[p] = v; return true; }
  });
}


// The shared set used by every page that does not ask for classes of its own.
const shared = makeDom();
module.exports = { ...shared, makeDom, makeEvent, dispatch, compile, matches, numbersOf };
