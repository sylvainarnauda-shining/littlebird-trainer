# Réglages et valeurs par défaut

Ce document donne les valeurs par défaut de l'entraîneur et leur origine. Chaque valeur est classée :

- **mesurée** sur les deux enregistrements de référence (méthode : `FIDELITE.md`) ;
- **lue** dans un guide ou une base communautaire, sans vérification en jeu (sources ci-dessous et `SOURCES.md`) ;
- **supposée**, faute de mesure ;
- **choisie** pour l'entraînement ou la jouabilité.

Les valeurs par défaut publiques s'appliquent à un nouveau profil et au bouton « Réglages initiaux ». Un profil
enregistré ou importé garde ses propres valeurs ; seules les valeurs absentes ou invalides prennent celles-ci. Elles
sont vérifiées par `tests/integration/app-defaults.test.js`.

## Touches par défaut

Les touches sont reconnues par leur position physique (`KeyboardEvent.code`) : sur un clavier AZERTY, la touche W du
tableau est Z, A est Q et Q est A. L'onglet Commandes affiche le nom de la touche de votre clavier.

| Action                               | Défaut                                             | Origine                                |
| ------------------------------------ | -------------------------------------------------- | -------------------------------------- |
| Augmenter / réduire le collectif     | Maj gauche / Ctrl gauche                           | lue (sources 1, 2, 3)                  |
| Piquer / cabrer                      | W / S                                              | lue (1, 2, 3)                          |
| Roulis gauche / droit                | A / D                                              | lue (1, 2, 3)                          |
| Lacet gauche / droit                 | Q / E                                              | lue (1, 2, 3)                          |
| Tirer                                | clic gauche                                        | lue (1, 2)                             |
| Leurres                              | V                                                  | lue (1, 2, 3)                          |
| Changer de vue                       | C                                                  | lue (1, 2)                             |
| Regard libre                         | Alt gauche, maintenu ; double appui pour le garder | lue (1, 2, 3 ; double appui : 4)       |
| Ravitaillement sur l'hélipad         | B                                                  | choisie (action propre à l'entraîneur) |
| Recommencer                          | R                                                  | choisie (action propre à l'entraîneur) |
| Recentrer la souris (manche virtuel) | X                                                  | choisie (action propre à l'entraîneur) |

Une action ajoutée par une version plus récente ne prend jamais une touche déjà utilisée par le profil : elle reste
alors « non assignée ». Deux actions ne peuvent pas partager une touche.

**Version navigateur : Ctrl + W.** Dans Chrome et Edge, Ctrl + W ferme l'onglet (Ctrl + Maj + W la fenêtre), et une
page ne peut pas annuler ce raccourci. Avec ces touches par défaut, descendre en piquant fait Ctrl gauche + W. Pendant
une session (en vol ou en pause), l'entraîneur demande donc au navigateur de confirmer la fermeture (choisi) ;
répondez « Annuler » pour rester. L'application Windows n'a pas ce raccourci et ferme sans demander. Pour ne pas voir
la question, réassignez « Réduire le collectif » ou « Piquer » dans l'onglet Commandes.

## Souris et vues du joueur

Ces réglages portent les mêmes noms et les mêmes unités que la page de réglages du jeu ; l'import du fichier de
réglages du jeu les lit (section suivante).

| Réglage                                           | Défaut          | Origine                                                         |
| ------------------------------------------------- | --------------- | --------------------------------------------------------------- |
| Sensibilité de tangage (souris)                   | 50 %            | choisie : les guides ne donnent pas la valeur par défaut du jeu |
| Sensibilité de lacet (souris)                     | 50 %            | choisie, idem                                                   |
| Multiplicateur de sensibilité (véhicules aériens) | 0,5             | lue (source 5)                                                  |
| Axe vertical inversé (hélicoptères)               | non             | choisie : les guides ne donnent pas la valeur par défaut du jeu |
| Isolation des axes                                | 0               | choisie (0 = mouvement transmis tel quel)                       |
| Champ de vision, vue pilote                       | 90° horizontaux | lue, confiance faible (source 6)                                |
| Champ de vision, vue poursuite                    | 90° horizontaux | lue, confiance faible (source 6)                                |

Le champ de vision est horizontal, comme dans le jeu : 90° horizontaux font environ 59° verticaux à 16:9. Sur les
enregistrements de référence, la vue pilote mesurait environ 89° horizontaux (`analyse/graphismes.md`).

Dans l'entraîneur, la souris pilote toujours : horizontale → lacet, verticale → tangage. Dans le jeu, le pilotage à la
souris est une option (source 7), avec plusieurs dispositions ; l'entraîneur reproduit celle des enregistrements de
référence.

## Loi de la souris (mesurée)

| Réglage                                                | Défaut                                 | Origine                                                                       |
| ------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------- |
| Loi                                                    | vitesse du geste → vitesse de rotation | mesurée (`analyse/souris.md`)                                                 |
| Gain en tangage                                        | 0,339                                  | mesuré : 0,0271° par pixel au produit de sensibilité 0,08 des enregistrements |
| Gain en lacet                                          | 0,339                                  | supposé égal au tangage (aucun geste de lacet isolé mesurable)                |
| Retard propre de la souris                             | 0,10 s                                 | mesuré, intervalle 0,05 à 0,20 s                                              |
| Ajustement fin                                         | ×1 (bornes ×0,7 à ×1,4)                | choisi                                                                        |
| Souris + touches plafonnées aux vitesses des touches   | oui                                    | supposé                                                                       |
| Manche virtuel v12 (option) : gain 0,05, retour 2,4 /s | —                                      | valeurs de la v12, gardées pour cette option                                  |

Le gain de la souris suit la formule K = gain × (sensibilité / 100) × multiplicateur × ajustement fin, en degrés par
pixel du curseur. On suppose que le jeu applique la sensibilité proportionnellement ; ce n'est pas encore vérifié en
jeu.

Aux valeurs par défaut (sensibilités 50 %, multiplicateur 0,5, ajustement ×1), K = 0,339 × 0,50 × 0,5 ≈ 0,085° par
pixel, en tangage comme en lacet : environ **3,1 fois** le gain mesuré sur les enregistrements de référence en tangage
(0,0271° par pixel, au produit sensibilité × multiplicateur de 0,08), et plus encore en lacet. Comme la sensibilité
par défaut du jeu n'est pas connue, c'est une valeur choisie : si l'hélicoptère tourne trop vite à la souris, baissez
les deux sensibilités ; un produit sensibilité × multiplicateur de 0,08 redonne en tangage le gain des
enregistrements.

## Modèle de vol (mesuré)

Les valeurs du modèle v6 et de la v13 sont décrites dans `analyse/vol.md` et `analyse/sensations.md` : roulis 80 °/s,
lacet 36 °/s, tangage environ 52 °/s, retards 0,30 s et 0,40 s (lacet : un seul retard de 0,35 s, choisi dans
l'intervalle mesuré), levier du collectif +3 /s et −1 /s avec maintien automatique, levier de stationnaire −0,14,
traînée et suivi du nez à vitesse. Le panneau « Modèle de vol » des Réglages indique pour chaque valeur si elle est
mesurée, choisie ou supposée.

## Armes, défense sol-air, modes

- Miniguns : 1 500 coups/min (mesuré), lancement 0,35 s (mesuré), dégâts tirés parmi les 42 impacts observés
  (mesurés) ; vitesse des balles 800 m/s, dispersion 0,35°, convergence 300 m (choisies).
- Défense sol-air : portée de verrouillage 1 000 m, missiles à 450 m/s, deux impacts pour abattre l'hélicoptère (lus,
  `SOURCES.md`) ; temps d'accrochage 2,5 s, altitude minimale 10 m, délai entre salves de leurres 12 s (lus ou choisis,
  voir `analyse/foret-dca.md`) ; 2 charges de leurres (mesurées).
- Durées, nombres de cibles, de camps, de lanceurs et de bots : choisis, réglables dans le menu de chaque mode.

## Import du fichier de réglages du jeu

Le bouton « Importer les réglages du jeu » (onglet Commandes) lit un fichier choisi par l'utilisateur, en lecture
seule. Il ne lit que la section des réglages utilisateur du jeu, et seulement ces clés : `RotaryMousePitchSensitivity`,
`RotaryMouseYawSensitivity`, `AirVehicleSensitivityMultiplier`, `bInvertYAxisHelicopters`, `RotaryMouseAxisIsolation`,
`FirstPersonVehicleFieldOfView` et `ThirdPersonVehicleFieldOfView`. Chaque valeur est bornée comme le réglage
correspondant ; le texte du fichier n'est pas conservé. Un exemple synthétique se trouve dans
`tests/fixtures/synthetic/game-settings.sample.txt`.

## Réglages retirés

La vibration de la caméra et l'élargissement du champ de la vue pilote avec la vitesse (absents du jeu), les aides de
vol de la v3 (remise à plat, anti-dérive, traînée linéaire) et la note de DPI de la souris n'ont plus de réglage : ils
restent à leur valeur par défaut, et un profil qui les contient y est ramené.

## Sources des valeurs par défaut du jeu

Consultées en septembre 2026 ; lues, non vérifiées en jeu.

1. BisectHosting, « WARDOGS Controls Guide: All PC & Controller Key Bindings », 5 septembre 2026 —
   https://www.bisecthosting.com/blog/wardogs-controls-guide-all-pc-controller-key-bindings (touches des véhicules à
   voilure tournante : collectif Left Shift / Ctrl, cyclique W / S et D / A, lacet Q / E, caméra C, regard libre Alt,
   contre-mesure V, tir clic gauche).
2. Shacknews, « Wardogs PC keybindings & controls », 10 septembre 2026 —
   https://www.shacknews.com/article/150690/wardogs-pc-keybindings-controls (même liste).
3. WARDOGS Wiki (site communautaire), « Controls and Keybinds », mis à jour le 15 septembre 2026 —
   https://wardogs-wiki.com/guides/controls-and-keybinds/ (collectif, cyclique, lacet, regard libre Alt,
   contre-mesures V).
4. WARDOGS Field (site communautaire), « Helicopter Controls », vérifié le 18 septembre 2026 —
   https://www.wardogsfield.com/helicopter-controls (regard libre : maintenir, ou double appui sur Alt gauche).
5. Vidéo de guide de pilotage d'un joueur, 12 septembre 2026 — https://www.youtube.com/watch?v=Yci_Ly2DdKw
   (multiplicateur des véhicules aériens à 0,5 par défaut, lu dans la transcription).
6. ShowGamer, « Best WARDOGS Settings for FPS, Visibility and Performance », 16 septembre 2026 —
   https://showgamer.com/en/guides/5794-luchshie-nastroyki-wardogs-kak-povysit-fps-i-vidimost (champs de vision des
   véhicules « 90 or Default » : formulation ambiguë, d'où la confiance faible).
7. allthings.how, « WARDOGS Helicopter Controls: Best Settings for Flying », mis à jour le 14 septembre 2026 —
   https://allthings.how/wardogs-helicopter-controls-best-settings-for-flying/ (option de pilotage à la souris ;
   réglage d'inversion propre aux véhicules aériens).
