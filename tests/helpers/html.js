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

module.exports = { scriptBodies, styleBodies };
