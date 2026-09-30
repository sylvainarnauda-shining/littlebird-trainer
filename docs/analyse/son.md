# Son

Le son de l'entraîneur est **synthétisé** (`src/audio.js`, Web Audio) : aucun échantillon du jeu n'est copié. Il est
réglé sur des mesures faites sur la bande son des enregistrements de référence ; les rafales ont été repérées avec la
touche de tir de l'affichage des commandes (trois rafales par enregistrement, plus un tir à vide sans munitions).

## Mesures

| Mesure                                     | Minigun (6 rafales)                                                                                                                                        | Vol (sans tir)                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Rythme                                     | un claquement toutes les **33 ms** (30,3 par seconde) sur les 6 rafales ; le compteur de munitions baisse, lui, de 25 coups/s : le son a son propre rythme | modulation des pales vers **31 à 38 Hz**                                                         |
| Enveloppe                                  | chaque claquement retombe à 50 % en **2 ms** et à 10 % en **25 ms**                                                                                        | —                                                                                                |
| Spectre (dB par octave, de 20 Hz à 16 kHz) | 44 · 40 · 31 · 28 · 26 · 26 · 22 · 18 · 14 : dominé par les graves (20 à 120 Hz), avec un « crack » aigu                                                   | 18 · 22 · 26 · 20 · 10 · 9 · 5 · −4 · −12 : grondement centré sur 120 à 250 Hz, note vers 225 Hz |
| Niveau                                     | environ 12 dB au-dessus du bruit de vol                                                                                                                    | presque constant de 0 à 290 km/h : **le jeu n'a pratiquement pas de bruit de vent**              |
| Tir à vide                                 | crépitement aigu (4 à 16 kHz) des canons qui tournent                                                                                                      | —                                                                                                |

**Vue pilote.** Par rapport à la vue poursuite, le vol s'entend environ 6 dB plus fort entre 60 et 400 Hz (grondement
du rotor), 2 à 3 dB plus faible entre 2,5 et 6 kHz et environ 10 dB plus faible au-dessus de 10 kHz.

## Synthèse dans l'entraîneur

- **Rotor** : boucle de 2 s, grondement filtré, note à 225 Hz, battement à 35,5 Hz ; le levier du collectif la module
  légèrement.
- **Vent** : presque inaudible ; il ne se devine qu'au-dessus de 150 km/h.
- **Minigun** : claquements courts (grave et « crack »), programmés à l'avance à 30 par seconde et alternés entre
  gauche et droite ; avant le premier coup, le crépitement des canons qui prennent leur vitesse pendant 0,35 s ; sans
  munitions, seulement les canons qui tournent.
- **Cabine de la vue pilote** : bus du rotor ×1,95, aigus −8 dB au-dessus de 4,5 kHz (contrôle F23, vérifié dans le
  navigateur).
- **Autres sons** (non mesurés, choisis) : explosions, leurres, départ de missile retardé par la distance (340 m/s),
  alertes de verrouillage (hauteur et cadence réglables, faute de mesure), rotor et rafales des hélicoptères ennemis
  retardés, atténués et placés selon leur position, claquement d'une balle qui passe près, CIWS à 30 coups/s. Une
  réverbération extérieure courte s'applique aux armes et aux explosions.
- Volumes séparés : moteur, armes, alertes (Réglages › Son).

## Vérification

Contrôle F22 (spectres mesurés par octave) :

| Son                            | Écart max. au spectre mesuré, par octave |
| ------------------------------ | ---------------------------------------- |
| Rotor                          | 4 dB                                     |
| Minigun (sur le rotor, +12 dB) | 4 dB                                     |

Le claquement synthétisé retombe à 50 % en 2,5 ms et à 10 % en 30 ms, contre 2 et 25 ms mesurés dans le jeu.
