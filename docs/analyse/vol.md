# Modèle de vol (v6) : mesures et modèle identifié

Le modèle de vol de l'entraîneur (`src/physics.js`) est un modèle réduit identifié sur les deux enregistrements de
référence (méthode générale : `../FIDELITE.md`). Il ne prétend pas reproduire le code du jeu : il décrit ce que
montrent les images et le modèle qui s'en approche le plus, avec ses écarts. Les réglages v13 de la souris, du lacet,
du collectif en stationnaire et de la vue poursuite sont dans `souris.md` et `sensations.md`.

## En bref

1. **Le collectif est assisté.** Le levier, affiché par les arcs autour de l'indicateur d'attitude, monte à environ
   3 par seconde et descend à environ 1 par seconde (échelle de −1 à +1). Relâché, il se règle seul pour annuler la
   vitesse verticale : l'altitude reste tenue en virage et en accélération sans action du pilote.
2. **Roulis : 80 °/s** aux clics, avec deux retards de 0,27 s et 0,44 s, sans retour automatique à plat. Un clic de
   0,1 s donne 6 à 8° d'inclinaison, et le mouvement se poursuit après le relâchement.
3. **Lacet à la touche : 36 °/s**, atteints en environ 1,2 s ; il retombe en environ 1 s après le relâchement.
   L'autorité reste de 24 à 29 °/s vers 220 km/h.
4. **Tangage à la touche : environ 52 °/s** ; l'échelle d'assiette du HUD vaut 0,40° par pixel (±30° affichés).
5. **Vitesse maximale : 289 km/h**, nez bas d'environ 12°.
6. **À grande vitesse, la trajectoire suit le nez.** Cabrer fait monter en chandelle en perdant de la vitesse ; piquer
   fort fait s'enfoncer, même collectif à fond. Sous 100 km/h, incliner fait glisser sans tourner ; au-dessus de
   150 km/h, le nez suit le virage.
7. **Tir : 24,8 à 24,9 coups/s** sur deux longues rafales, avec un **temps de lancement de 0,35 à 0,37 s** avant le
   premier coup.
8. **Dégâts : 42 impacts lus un à un**, moyenne 58,23 ; valeurs 18,01 · 30,01 · 36,01 · 54,02 · 74,12 · 78,01 ·
   85,81 · 150,02. Leur somme redonne exactement les totaux affichés. Aucune destruction n'est observée : la santé des
   cibles reste inconnue.

## Méthode

Pour chaque image, on lit :

- l'affichage des commandes incrusté (touches du clavier et clics) ;
- la vitesse et les altitudes, par gabarits de chiffres construits sur les enregistrements ;
- le cap, en ajustant le réseau de graduations de la bande (7,61 px par degré) ;
- l'indicateur d'attitude du HUD : les deux **repères de roulis** (leur angle est l'inclinaison ; le sens a été
  vérifié en vue extérieure), les deux **triangles** d'assiette (exactement au centre posé, ils montent quand on cabre)
  et les deux **arcs** du collectif, allumés de 0 à ±45°, qui affichent le levier de −1 à +1.

**Échelle d'assiette.** Elle est étalonnée sans hypothèse physique, par corrélation de phase sur le pare-brise en vue
pilote. Le décalage horizontal de l'image en fonction du cap donne la focale : 972 px, soit 89° horizontaux et 58°
verticaux. La part du flux vertical due aux triangles donne 0,40 à 0,42° par pixel.

**Ce qui n'est pas mesurable.** L'affichage des commandes ne montre pas les mouvements de la souris : les commandes à
la souris ne se déduisent que de la réponse de l'hélicoptère (voir `souris.md`).

## Paramètres retenus

| Grandeur                              | Valeur                                                                                  | Méthode                                                      | Confiance               |
| ------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------- |
| Vitesse max. de roulis (clics)        | 80 °/s                                                                                  | ajustement sur 467 fenêtres (deux enregistrements)           | élevée                  |
| Retards de rotation                   | 0,30 s + 0,40 s                                                                         | roulis 0,27 / 0,44 s ; lacet 0,40 / 0,30 s                   | élevée                  |
| Rappel à plat                         | 0                                                                                       | essais de rappel de 0 à 2                                    | élevée                  |
| Lacet max. (touche)                   | 36 °/s                                                                                  | appuis de 1,5 s et 4,4 s, erreur 3 °/s                       | élevée                  |
| Tangage max. (touche)                 | environ 52 °/s                                                                          | déplacement total par appui × 0,40°/px                       | moyenne                 |
| Levier du collectif : montée / baisse | +3 /s / −1 /s                                                                           | montées et baisses de l'arc                                  | moyenne / élevée        |
| Maintien automatique au relâchement   | levier' = −0,098·Vz − 0,075·Az                                                          | régression sur 14 719 images sans touche                     | moyenne (R² 0,41)       |
| Autorité verticale                    | +8 m/s² au-dessus du stationnaire, −3,5 m/s² au-dessous                                 | ajustement sur 56 fenêtres de 4 s                            | moyenne                 |
| Amortissements                        | vertical 0,3 /s ; écoulement selon l'axe rotor 0,6 /s ; quadratique 0,0003 ; linéaire 0 | même ajustement ; sans le terme d'axe rotor, l'erreur double | moyenne à élevée        |
| Vitesse max.                          | 289 km/h, nez environ 12° bas                                                           | vitesse lue, 99,9ᵉ centile                                   | élevée                  |
| Suivi du nez à vitesse                | constante de temps 1,1 s à 200 km/h, en 1/V²                                            | rapport cap / virage coordonné                               | faible à moyenne        |
| Champ de vision de la vue pilote      | 58° verticaux                                                                           | flux optique                                                 | élevée                  |
| Cadence, lancement                    | 1 500 coups/min, 0,35 s                                                                 | compteur de munitions                                        | élevée                  |
| Dégâts par impact                     | 42 valeurs, moyenne 58,23                                                               | lecture impact par impact                                    | élevée pour les valeurs |

Le rapport entre le cap et un virage coordonné vaut 0,05 sous 100 km/h, 0,61 de 100 à 150 km/h, 0,83 de 150 à
200 km/h et 0,86 de 200 à 260 km/h : le nez suit la trajectoire à vitesse, mais l'autorité en lacet ne s'effondre pas.

## Le modèle

- Commande en vitesse de rotation sur les trois axes, avec deux retards, et l'attitude tenue au relâchement.
- Levier du collectif de −1 à +1 : la touche de montée le monte à 3 /s, celle de descente le baisse à 1 /s ; relâché,
  le maintien automatique applique la loi mesurée.
- Poussée compensée en inclinaison (jusqu'à 60°), autorité verticale asymétrique.
- Amortissement de l'écoulement selon l'axe du rotor (ressources et piqués), traînée quadratique faible, suivi du nez
  à vitesse, posé au ralenti.
- Dégâts : par défaut, chaque impact tire une valeur parmi les 42 observées ; des valeurs fixes restent sélectionnables.

## Vérification

- **Comportement** (contrôles F01 à F13) : roulis de 34 °/s après 0,5 s et 62 °/s après 1 s (enregistrements :
  environ 31 et 55) ; clic de 0,1 s : 8° ; lacet 36 °/s ; décollage et stationnaire tenu ; 293 km/h à 13° de piqué ;
  ressource depuis 283 km/h ; suivi du nez 0,84 à 250 km/h (enregistrements 0,86) et 0,12 à 60 km/h (0,05) ; premier
  coup à 0,34 s puis 25 coups/s.
- **Rejeu** : l'attitude relevée pilote le modèle, qui calcule levier, vitesse verticale et vitesse. Erreurs sur des
  fenêtres de 6 s :

  |                                             | Levier | Vitesse verticale | Vitesse   |
  | ------------------------------------------- | ------ | ----------------- | --------- |
  | Enregistrement 1 (24 fenêtres), modèle v6   | ±0,26  | ±2,5 m/s          | ±2,0 m/s  |
  | Enregistrement 1, sans maintien automatique | ±0,52  | —                 | —         |
  | Enregistrement 1, sans le terme d'axe rotor | —      | ±4,7 m/s          | —         |
  | Enregistrement 1, traînée de la v3          | —      | —                 | ±14,5 m/s |
  | Enregistrement 2 (11 fenêtres), modèle v6   | ±0,23  | ±1,5 m/s          | ±5,9 m/s  |

  Dans l'enregistrement 2, trois fenêtres commencent pendant ou juste après un lacet de 125° ou en plein virage
  incliné : la direction de la vitesse y est mal initialisée. Les huit autres restent entre 0,2 et 2,1 m/s.

## Limites connues

- **Ressources très rapides** : sur le seul cas mesurable, la décélération suit le jeu jusqu'à 80 km/h puis devient un
  peu trop forte ; le modèle gagne 29 m contre 52 m dans le jeu. Au-delà de 30° d'assiette, l'échelle affichée ne
  permet plus le rejeu.
- **Descente au collectif** : entre deux appuis, le levier remonte un peu moins vite que dans le jeu.
- **Suivi du nez à vitesse** : estimation brouillée par la souris ; réglage « Nez sur la trajectoire » (0 à 2).
- **Échelle d'assiette** : à ±10 % près ; le gain du tangage à la touche vient du déplacement total par appui.
- **Dégâts** : cibles vues = petits véhicules ; la répartition des valeurs fait penser à des zones touchées, sans
  preuve. Vitesse des balles et dispersion non mesurées.
- **Modèle réduit** : ce n'est pas la physique du jeu, mais un modèle calé sur ce que le HUD laisse mesurer.
