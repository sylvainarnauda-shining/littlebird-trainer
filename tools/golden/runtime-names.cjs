'use strict';
// Runtime member names that a naming step may change. The recorder reads them only through this table, under their
// neutral name, so that a renamed runtime records the same fixtures: pick() returns the member under its neutral name,
// or under one of the other names listed here. A new runtime name is added here first (a recorder change that
// prove-recorder.cjs accepts, since the current names keep working); an old one is dropped once no committed runtime
// uses it (proven the same way on the renamed runtime).
const OLD = { samSites: [], addSamSite: [], samSiteOf: ['samSite'], samSiteModel: ['samSite'] };
// The value of a member by its neutral name: the neutral name itself if the runtime has it, else its current name.
function pick(o, neutral) { if (o && neutral in o) return o[neutral]; for (const k of OLD[neutral] || []) if (o && k in o) return o[k]; return undefined; }
// Hook-object member names: runtime name -> neutral name (hookapi fixture).
const NEUTRAL_MEMBERS = Object.fromEntries(['samSites', 'addSamSite'].flatMap(n => OLD[n].map(o => [o, n])));
module.exports = { pick, NEUTRAL_MEMBERS };
