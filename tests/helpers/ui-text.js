'use strict';
// French interface texts the tests check, in one table. A wording step (CONTRIBUTING.md) edits this
// table together with its reviewed string list; the tests themselves assert through these entries (or through ids and
// numbers), never through literals of their own. Only short functional labels and numbers are checked here; notices
// written for one person are checked by their numbers, not their wording.
module.exports = {
  // HUD key hints, ordered as in the game (check F27), short functional labels in French.
  keyHints: ['REGARD LIBRE', 'CHANGER DE VUE', 'MONTÉE COLLECTIVE', 'DESCENTE COLLECTIVE', 'LARGUER LES LEURRES'],
  // Map card of the reference valley (counts of its towers, villages and fields).
  valleySummary: /3 tours · 1 village · 5 champs/,
  // Results screen.
  assaultEndTitle: /camps/,
  resultStructures: /Structures détruites/,
  resultScore: /Score/,
  resultDuelRecord: /Victoires \/ défaites/,
  resultLevelNormal: /niveau Normal/,
  resultCiws: /Canons CIWS/,
  shotDownByBot: 'Abattu par un hélicoptère ennemi',
  victory: /Victoire/,
  // Notices (toasts).
  gameSettingsImported: /Réglages du jeu importés/,
  profileImported: 'Profil importé.',
  migratedToRateLaw: /v13 : la souris suit la loi mesurée/,
  stickChosen: /manche virtuel de la v12/,
  yawInertiaNotice: /Inertie du lacet : 0,35 s/,
  measuredModelRestored: /loi et gain de la souris \(0,339\)/,
  // Mouse-gain migration of revision 15 profiles (the old default 0.271 becomes 0.339): checked by its numbers.
  gainChange: /gain 0,339 au lieu de 0,271/,
  gainChangePitchOnly: /gain en tangage 0,339 au lieu de 0,271/,
  gainClaimPercent: /25 %/,
  fineFactorKept: /×1,25/,
  stickUnchanged: /manche virtuel v12/,
};
