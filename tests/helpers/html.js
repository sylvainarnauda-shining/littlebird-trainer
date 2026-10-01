'use strict';
// The inline <script> and <style> blocks of a page, as the tests read them: the tests' own copy of the expressions of
// scripts/page-policy.mjs, kept here so that a test does not read the page through the module it checks. A start tag
// in any letter case, with or without attributes, and the body up to the first end tag, which HTML recognises as
// "</script" or "</style" in any letter case followed by whitespace, "/" or ">". A block the build wrote in another
// form than <script>…</script> is thus counted and compared by the tests, never skipped. Being a copy, it would share
// a mistake of those expressions: the ground truth is the explicit expected values of tests/build/csp.test.js.
const SCRIPT_BLOCK = /<script(?=[\t\n\f\r />])[^>]*>([\s\S]*?)<\/script(?=[\t\n\f\r />])[^>]*>/gi;
const STYLE_BLOCK = /<style(?=[\t\n\f\r />])[^>]*>([\s\S]*?)<\/style(?=[\t\n\f\r />])[^>]*>/gi;

const scriptBodies = (html) => [...html.matchAll(SCRIPT_BLOCK)].map((m) => m[1]);
const styleBodies = (html) => [...html.matchAll(STYLE_BLOCK)].map((m) => m[1]);
// The files named by the external <script src="…"></script> tags of the page template, in order: the scripts that the
// build inlines (the template's one inline script, the error handler, has no file).
const templateScriptFiles = (template) => [...template.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);

// The scripts of the menus, loaded between the game's modules and app.js (the menus 1.0 add them one phase after the
// other). The recorder reads a template with or without each of them: its tests start from the runtime that predates
// them, whichever of them the template names by now.
const MENUS_SCRIPTS = ['settings-data.js', 'settings.js', 'menus.js'];
const scriptTag = (file) => `<script src="${file}"></script>`;
// The template with exactly the given scripts of the menus (none by default) named before app.js.
const templateWithMenus = (template, files = []) =>
  MENUS_SCRIPTS.reduce((text, f) => text.replace(scriptTag(f), ''), template).replace(
    scriptTag('app.js'),
    files.map(scriptTag).join('') + scriptTag('app.js'),
  );

module.exports = { scriptBodies, styleBodies, templateScriptFiles, MENUS_SCRIPTS, scriptTag, templateWithMenus };
