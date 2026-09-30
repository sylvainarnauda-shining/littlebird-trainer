# Comment la fidélité est mesurée

L'entraîneur ne contient ni le code ni les données du jeu. Il reproduit ce que l'on **voit** et **entend** dans le jeu,
mesuré sur deux enregistrements de parties, et ce que des sources publiques décrivent (`SOURCES.md`). Ce document dit
comment ces mesures ont été faites sans publier les enregistrements, et comment le dépôt garantit qu'elles restent
respectées.

## Les enregistrements de référence

- Deux enregistrements d'un AH-6M à miniguns, faits en septembre 2026 sur la version du jeu du moment :
  **enregistrement 1** (environ 394 s) et **enregistrement 2** (environ 159 s), en 1920 × 1080 à 60 images par
  seconde, soit 33 163 images.
- On y voit la vue pilote et la vue poursuite, le HUD complet, les tirs et les dégâts, un ravitaillement, et un
  affichage des commandes incrusté à l'image (touches du clavier et clics).
- Le modèle reproduit le vol tel qu'il a été enregistré, avec les aides au pilotage du jeu telles qu'elles étaient
  actives ce jour-là.
- **Ils ne sont pas publiés** : ni image, ni son, ni nom de fichier, ni réglage personnel. Les analyses de `analyse/`
  les désignent par « enregistrement 1 » et « enregistrement 2 ».

## Ce qui a été lu, image par image

| Grandeur                                          | Méthode                                                                                                 | Contrôle                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Vitesse, altitude sol (AGL) et altitude mer (ASL) | chiffres du HUD reconnus par gabarits                                                                   | 18 lectures sur 18 exactes sur des images relues à l'œil                |
| Cap                                               | réseau de graduations de la bande de cap (7,61 px par degré)                                            | cohérent avec le cadre central sur 5 images sur 5                       |
| Inclinaison, assiette, levier du collectif        | repères de roulis, triangles d'assiette (0,40° par pixel), arcs du collectif de l'indicateur d'attitude | échelle étalonnée par flux optique en vue pilote                        |
| Champ de vision                                   | décalage de l'image de la vue pilote en fonction du cap                                                 | focale 972 px : 58° verticaux, environ 89° horizontaux                  |
| Touches pressées                                  | affichage des commandes incrusté                                                                        | touches visibles seulement ; les mouvements de la souris ne le sont pas |
| Cadence et lancement des miniguns                 | compteur de munitions                                                                                   | deux longues rafales                                                    |
| Dégâts                                            | chiffres de dégâts, impact par impact                                                                   | la somme des 42 impacts redonne les totaux affichés                     |
| Carburant                                         | jauge sous l'indicateur d'attitude, toutes les 2 s                                                      | une graduation vaut 1,6 %                                               |
| Hauteur des arbres et des toits                   | chutes de l'AGL à ASL constant                                                                          | 160 objets survolés                                                     |
| Son                                               | spectres par octave, rythme et enveloppe                                                                | rafales et vol sans tir séparés                                         |
| Apparence de l'hélicoptère                        | 12 vues recalées sur la caméra du jeu, et des images de vol                                             | réglage sur une partie des vues, contrôle sur les autres                |

La souris n'est pas visible à l'image : sa loi a été mesurée par la réponse de l'hélicoptère, sur 43 passages rapides
du point de visée pendant lesquels la touche de tangage n'était pas pressée (`analyse/souris.md`).

## Ce qui est publié

Seules des **séries de nombres** tirées des enregistrements sont publiées, comme données de test, pour que les
contrôles de fidélité tournent chez tout le monde (`tests/fixtures/recordings/`, empreintes dans
`tests/fixtures/MANIFEST.json`) :

- `bench_v1.csv.gz` et `bench_v2.csv.gz` : relevés à 60 Hz (temps, vue, touches visibles, vitesse, vitesse verticale,
  levier, inclinaison, assiette, cap) ;
- `replay_v1.json` et `replay_v2.json` : les mêmes relevés préparés pour le rejeu du vol ;
- `cross-curve.json` : la courbe moyenne de réponse aux 43 passages de la souris ;
- `tests/fixtures/expected/harness-metrics.json` : les chiffres adoptés par l'analyse.

Aucune image, aucun son, aucun fichier de réglages n'en fait partie ; le scanner de confidentialité le vérifie.

## Règle d'adoption d'un réglage

1. Les commandes relevées sur les enregistrements sont **rejouées** dans le modèle de l'entraîneur ; on compare
   ensuite l'attitude, le cap, l'altitude et la vitesse, image par image.
2. Un réglage n'est adopté que s'il améliore les passages **qui n'ont pas servi à le régler** : validation croisée en
   18 blocs, réglage sur un enregistrement et contrôle sur l'autre, gain supérieur à deux erreurs types. Sinon, la
   valeur précédente est gardée et le point reste « à mesurer ».
3. L'entraîneur livré reproduit **pas à pas** le modèle retenu par ce banc : les mesures valent pour ce que l'on
   pilote.

Chaque constante indique dans le code si elle est **measured** (mesurée), **read** (lue), **assumed** (supposée) ou
**chosen** (choisie).

## Ce que le dépôt vérifie

- **Contrôles de fidélité F01 à F37** (`tests/fidelity/`, index `tests/fidelity/INDEX.json`) : chacun relie
  l'entraîneur à une mesure des enregistrements, à l'interface du jeu, à une base communautaire ou à un chiffre adopté
  par l'analyse, avec sa tolérance. Les tolérances ne sont jamais élargies pour faire passer un changement.
- **Goldens** (`tests/fixtures/golden/`) : enregistrements bit à bit du vol et du chemin d'entrée, de sessions
  complètes de chaque mode, des cartes, des sons, du HUD, de l'import des réglages (10 000 profils générés), des
  modèles 3D, de l'interface et des modules. Toute différence fait échouer les tests.
- **Changements déclarés** : un changement de comportement est un commit à lui seul, décrit dans `CHANGELOG.md`, avec
  la preuve que les goldens ne changent que là où il le dit.
- **Identité des arbres syntaxiques** (`scripts/ast-identity.mjs`) : un changement de commentaires ou de textes ne
  change pas le code.
- **Même calcul dans le moteur des joueurs (porte G5)** : les goldens sont enregistrés avec Node.js. Un script de vol
  de 60 s (`desktop/parity.cjs`) est rejoué par la page elle-même dans le moteur qui la fait tourner : dans
  l'application Windows empaquetée (son auto-test), dans Chrome (`tests/browser/parity.spec.mjs`) et dans Node.
  Mesure du 30/09/2026 : le moteur JavaScript de Chromium (Electron 44.4.5 et Chrome 154, identiques bit pour bit)
  arrondit certaines fonctions mathématiques (sinus, cosinus, exponentielle, logarithme…) autrement que celui de
  Node.js 24 au dernier chiffre binaire. Les deux calculs du vol ne sont donc pas identiques bit pour bit, mais ils
  restent à **1,3 × 10⁻¹² m** l'un de l'autre sur les 60 s (un millième de milliardième de mètre). La porte exige que
  l'empreinte du calcul soit l'une des deux références (Node.js ou Chromium) et que chaque état relevé toutes les 5 s
  reste à moins de 10⁻⁹ m (tolérance choisie) du golden. Le jeu a été mesuré sur des enregistrements vidéo, et les
  ajustements du modèle comme les contrôles de fidélité tournent dans Node.js ; l'entraîneur, lui, a été réglé et
  piloté dans Chrome, et l'application Windows calcule exactement comme Chrome.

## Ce qui n'est pas mesuré

Les enregistrements ne contiennent ni verrouillage de missile, ni tir de CIWS, ni duel, ni atterrissage brutal, ni
regard libre en vol. Ces comportements viennent de sources publiques ou de choix d'entraînement, et le disent. Restent
aussi à mesurer : le gain de la souris en lacet (supposé égal au tangage), le retard propre de la souris, la descente
au collectif, les virages lâchés à vitesse, l'avant et les flancs de l'hélicoptère (toutes les vues sont prises de
l'arrière), et la vitesse, les limites et le retour du regard libre.
