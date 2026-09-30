'use strict';
// Runtime identifiers that carry a game-invented word, read by the tests only through this table, so the naming step
// renames them here and nowhere else in the tests. Real-world designations (AH-6M, AH-6R, 9K333 Verba,
// M249, RPG-7, MAAWS, CIWS) are not listed: they stay.
module.exports = {
  // The crewed surface-to-air missile emplacement (launcher kind 'sam'): hook-object members and unit tag.
  samSites: 'samSites',
  addSamSite: 'addSamSite',
  samSiteOfTarget: 'samSite',
  samUnitTag: 'sam',
  // The two opposing factions of the camps, in the order the match assigns them, and the default faction.
  factions: ['black', 'olive'],
  defaultFaction: 'black',
  // Light presets (ids stored in profiles and shared links): the eight ids in menu order.
  lightPresets: [
    'aube-clair',
    'matin-clair',
    'matin-brouillard',
    'midi-clair',
    'apres-midi-clair',
    'apres-midi-gris',
    'apres-midi-brouillard',
    'soir-clair',
  ],
  foggyMorning: 'matin-brouillard',
  referenceAfternoon: 'apres-midi-clair',
  eveningClear: 'soir-clair',
};
