'use strict';
// The scripts a page template loads, as the recorder reads them: the one place that says which runtime files exist and in
// what order. What needs the list of the runtime's files (the harness, the mutation smoke test, scripts/golden.mjs and
// scripts/ast-identity.mjs) takes it from a template through runtimeScripts, never from a list of its own.
const THREE = 'vendor/three.min.js';
// Runtime scripts every realm of the game loads before the modules (the page loads them right after three.js).
const CORE = ['core/pow.js'];
// The game's modules, which run without a page, in the order the page loads them.
const MODULES = ['world.js', 'physics.js', 'forest.js', 'scenery.js', 'missiles.js', 'audio.js', 'models.js', 'ground.js', 'bot.js'];
// The scripts of the menus, loaded between the modules and app.js. A template may lack any of them (the runtime that the
// goldens name predates them) or hold them, each in its place; no other script may be added without a recorder change.
const OPTIONAL = ['settings-data.js', 'settings.js', 'menus.js'];
const ORDER = [THREE, ...CORE, ...MODULES, ...OPTIONAL, 'app.js'];

// The template's <script> elements, found as HTML finds them (start and end tags in any letter case, with attributes,
// an end tag with whitespace or "/"), then each one required in one of the two forms the build reads: an external
// <script src="file"></script> (the file is inlined there) or an inline <script>code</script>. Any other form stops the
// recording instead of being skipped, so the page never runs a script the recorder does not.
const SCRIPT_ELEMENT = /<script(?=[\t\n\f\r />])([^>]*)>([\s\S]*?)<\/script(?=[\t\n\f\r />])[^>]*>/gi;
function templateScripts(html) {
  const tags = [], inline = [];
  for (const [element, attrs, body] of html.matchAll(SCRIPT_ELEMENT)) {
    const exact = element === '<script' + attrs + '>' + body + '</script>', src = /^ src="([^"]+)"$/.exec(attrs);
    if (exact && attrs === '') inline.push(body);
    else if (exact && src && body === '') tags.push(src[1]);
    else throw Error('the template holds a <script> in a form the recorder does not read: ' + JSON.stringify(element.slice(0, 60)));
  }
  return { tags, inline };
}

// What the page loads: files = the external scripts in the template's order, game = those after three.js and the core
// scripts, inline = the code of the inline scripts. The external ones must be the canonical sequence, each optional
// script present or absent.
function runtimeScripts(html) {
  const { tags, inline } = templateScripts(html), order = ORDER.filter(f => !OPTIONAL.includes(f) || tags.includes(f));
  if (tags.join() !== order.join()) throw Error('the template\'s script tags are not ' + ORDER.join(', ') + ' (' + OPTIONAL.join(', ') + ' optional): ' + tags.join(', '));
  return { files: tags, game: tags.slice(1 + CORE.length), inline };
}
module.exports = { CORE, MODULES, runtimeScripts };
