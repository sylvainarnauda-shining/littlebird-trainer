# Sources publiques

Certaines valeurs de l'entraîneur ne peuvent pas être mesurées sur les enregistrements de référence (aucun
verrouillage de missile, aucun tir de CIWS, aucun duel n'y figure). Elles viennent alors de sources publiques :

- des **bases communautaires**, qui publient des fiches d'armes et de véhicules (dégâts, cadences, vitesses, points de
  vie). Ce sont des **valeurs publiées par des bases communautaires, non vérifiées en jeu** ; elles se contredisent
  parfois ;
- des **guides** et des **messages de joueurs**, qui décrivent des comportements ; ce sont des avis ;
- une **documentation communautaire des réglages des serveurs**, pour les ambiances de lumière.

Rien n'est copié de ces sources : ni tableau, ni texte, ni fichier. Les valeurs sont réexprimées comme paramètres de
l'entraîneur, et le code les marque « read » (lues). Là où aucune source n'existe, la valeur est « chosen » (choisie)
ou « assumed » (supposée). Sauf mention contraire, les pages ont été consultées entre le 27 et le 30 septembre 2026.

Les touches et réglages par défaut du jeu ont leurs propres sources, dans `REGLAGES.md`.

## Défense sol-air : règles de verrouillage et leurres

| Règle dans l'entraîneur                                                                | Source                       | Statut                                                                 |
| -------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| Bips pendant l'accrochage, son continu une fois verrouillé et tant qu'un missile guide | G1                           | lu, non vérifié                                                        |
| Pas de verrouillage au ras du sol (environ 10 m)                                       | G1, G2                       | lu ; un joueur affirme l'inverse (réglable)                            |
| Leurres à lâcher 1 à 2 s avant l'impact, pas au premier bip                            | G2                           | lu ; dans l'entraîneur, la fenêtre efficace découle de l'autodirecteur |
| Délai entre deux salves de leurres                                                     | S1                           | existence rapportée par des joueurs ; durée inconnue, 12 s choisies    |
| Missiles très agiles, capables de virages serrés                                       | S2, S3                       | témoignages                                                            |
| Leurres sur V, 2 charges                                                               | enregistrements de référence | mesuré (compteur « 002 » à l'écran)                                    |
| Temps d'accrochage 2,5 s, délai avant tir, agilité 25 g, autodirecteur de ±30°         | —                            | choisis (réglables)                                                    |
| Esquive par manœuvre ou vol très bas, éclats                                           | —                            | choisis pour l'entraînement ; taux non mesurés                         |

## Défense sol-air : missiles, tireur Verba, poste SAM

| Valeur                                                                                                                               | Source     | Statut                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------- |
| 9K333 Verba : lance-missile d'épaule, 72 mm, guidage infrarouge, verrouillage obligatoire                                            | W1, G1     | lu                                                                                        |
| Verba : portée environ 1 000 m, minimum 100 m                                                                                        | W1, G1     | lu                                                                                        |
| Missile de 72 mm commun au Verba et au poste SAM : 20 m/s à la sortie du tube, 450 m/s en vol, armement après 0,13 s                 | B1, B2     | valeurs publiées par des bases communautaires, non vérifiées en jeu                       |
| Dégâts : 200 points sur un impact direct (la moitié des 400 points de coque de l'AH-6M), éclats jusqu'à 10,8 m, plein effet sous 2 m | B1, B2, B3 | idem ; « deux lanceurs pour abattre un hélicoptère à coup sûr » (S4) va dans le même sens |
| Poste SAM : emplacement construit par l'équipe, un siège, rechargeable                                                               | B4, B5     | lu                                                                                        |
| Poste SAM : un missile dans le tube, rechargé en environ 3 s                                                                         | B1, S5     | lu (2 s plus les délais ; un joueur parle de 3 s)                                         |
| Poste SAM : ne vise pas à la verticale (cône mort au-dessus)                                                                         | G3         | lu                                                                                        |
| Poste SAM : 3 000 points de coque, emprise environ 3 × 3 × 2 m                                                                       | B1, B4     | valeurs publiées par des bases communautaires, non vérifiées en jeu                       |
| Réserve de 8 missiles, un de plus toutes les 15 s ; rechargement du Verba 12 s                                                       | —          | choisis                                                                                   |

## Canon CIWS de 20 mm

| Valeur                                                                                                | Source     | Statut                                                                                                             |
| ----------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Emplacement construit dans une base avancée, pointé à la main par un servant                          | G3, B4, B5 | lu                                                                                                                 |
| Munition 20 × 102 mm, 60 points par obus (15 % de l'intégrité de l'AH-6M)                             | G3, B2, B5 | lu                                                                                                                 |
| Cadence 1 800 coups/min, obus à 224 m/s                                                               | B1, B2     | valeurs publiées par des bases communautaires, non vérifiées en jeu (la v10 estimait 3 000 coups/min et 1 000 m/s) |
| Chargeur de 500 obus, réserve de 2 000 ; rechargement environ 5 s                                     | B1, S6     | lu (base : 3 s plus 1 s avant et après ; joueur : environ 5 s)                                                     |
| Portée efficace environ 1 km ; « presque impossible d'anticiper à distance »                          | S6         | témoignage, cohérent avec des obus lents                                                                           |
| 5 000 points de coque (soit environ 694 impacts de référence de minigun à −80 %), emprise 6 × 6 × 5 m | B1, B3     | lu ; un joueur rapporte « environ 500 coups de minigun sur la cible » (S6)                                         |
| Ne tire pas à la verticale                                                                            | G3         | lu                                                                                                                 |
| Temps de réaction, erreur de visée, vitesses de rotation de la tourelle                               | —          | choisis                                                                                                            |

## Au sol

| Valeur                                                                                                     | Source                                                                          | Statut                                                              |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| RPG-7 : 93 mm, 100 m/s au départ, portée efficace 300 m, 110 points en impact direct, souffle jusqu'à 12 m | B1                                                                              | valeurs publiées par des bases communautaires, non vérifiées en jeu |
| MAAWS : 84 mm, 230 m/s, 400 m, 100 points                                                                  | B1                                                                              | idem                                                                |
| Propulseur du RPG-7 jusqu'à 190 m/s, temps de rechargement                                                 | —                                                                               | choisis                                                             |
| Véhicules armés (Humvee à minigun, pick-up à mitrailleuse M249) : cadences, portées, précision             | B2 pour les armes ; le reste choisi                                             | lu / choisi                                                         |
| Base protégée autour de l'hélipad (pas de tir des véhicules à moins de 300 m)                              | guides (zone de base protégée d'environ 480 m dans le jeu ; page non conservée) | lu, distance choisie                                                |
| Camps, structures, fantassins, abris, riposte                                                              | —                                                                               | choisis pour l'entraînement                                         |

## Hélicoptères

| Valeur                                                                                                                                                 | Source     | Statut                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| AH-6M : coque 400 points, moteur 200, réservoir 200, rotor de queue 300, rotor principal 400 ; armes légères −80 % ; vitesse maximale 350 km/h         | B1         | valeurs publiées par des bases communautaires, non vérifiées en jeu ; la vitesse de l'entraîneur reste celle mesurée (environ 290 km/h) |
| Résistance des hélicoptères du duel : 40 impacts de référence (réglable de 20 à 200)                                                                   | —          | choisie (voir `analyse/foret-dca.md`)                                                                                                   |
| AH-6R : deux paniers de roquettes B-13, 8 roquettes de 122 mm, 350 coups/min, rechargés en 6 s, 100 points par roquette (4 roquettes abattent l'AH-6M) | B1, B2, G2 | lu                                                                                                                                      |
| Vitesse des roquettes de 122 mm : 600 m/s                                                                                                              | —          | choisie (une base donne 1 430 m/s, valeur douteuse)                                                                                     |
| Bots : perception, niveaux, tactique                                                                                                                   | —          | choisis (voir `analyse/foret-dca.md`)                                                                                                   |

## Monde, vues et modes

| Élément                                                                                                       | Source                      | Statut                                                                                         |
| ------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| Huit ambiances de lumière, toutes de jour, deux avec brouillard, ni nuit ni pluie ; une tirée à chaque partie | D1                          | lu ; noms neutres propres à l'entraîneur, couleurs, brouillard et soleil interprétés (choisis) |
| Tours : grands bâtiments avec escalier extérieur, salle de contrôle et toit                                   | G4, G5                      | lu ; hauteur mesurée sur un enregistrement de référence (environ 33 m)                         |
| Zone chaude qui double les points et se déplace                                                               | G4                          | lu ; période de 3 minutes choisie                                                              |
| Regard libre : maintenir Alt, ou double appui pour le garder                                                  | `REGLAGES.md` (source 4)    | lu ; vitesse et limites du regard choisies (non mesurées)                                      |
| Regard libre : la souris tourne la vue, l'hélicoptère garde son attitude, les touches pilotent toujours       | vidéos publiques de joueurs | lu ; non observé sur les enregistrements de référence                                          |

## Liste des sources

Les pages dont l'adresse contient un nom inventé par le jeu (que l'entraîneur a remplacé par un nom neutre) sont
citées par leur site et leur sujet.

**Bases communautaires**

- B1 — wardogs.zone, base de données : fiches de l'AH-6M, de l'AH-6R, du lance-missile d'épaule, du poste sol-air
  construit, du canon rotatif construit, du RPG-7 et du MAAWS — https://wardogs.zone/database (par exemple
  https://wardogs.zone/database/air-rotary-littlebird-mountedmachineguns, https://wardogs.zone/database/rpg7,
  https://wardogs.zone/database/cgm4, https://wardogs.zone/database/stationary-phalanx).
- B2 — wardogs.tools, base de données : munitions 72 mm, 20 × 102 mm et 122 mm, véhicules — https://wardogs.tools/database
  (par exemple https://wardogs.tools/database/ammunition/72mm, https://wardogs.tools/database/ammunition/20x102mm).
- B3 — wardogshub.uk, base de données (emplacements armés) — https://wardogshub.uk/en/database/
- B4 — wiki WARDOGS de Dexerto (emplacements) — https://www.dexerto.com/wikis/wardogs/
- B5 — getwardogshq.com, armurerie — https://getwardogshq.com/armory ; wardogshq.gg — https://wardogshq.gg/

**Wikis et guides**

- W1 — wardogs.wiki, « 9K333 Verba » — https://wardogs.wiki/index.php/9K333_Verba
- G1 — wardogshub.gg, guide de l'hélicoptère d'attaque — https://wardogshub.gg/blog/wardogs-attack-helicopter-guide/
- G2 — wardogsbuild.com, guide de l'hélicoptère — https://wardogsbuild.com/guides/helicopter/
- G3 — allthings.how, guides sur la construction et la neutralisation du canon CIWS et du poste sol-air —
  https://allthings.how/
- G4 — allthings.how, « WARDOGS Towers Explained » —
  https://allthings.how/wardogs-towers-explained-capturing-codes-and-the-hot-zone-magnet/ ; wardogshub.gg, tours —
  https://wardogshub.gg/towers/
- G5 — PCGamesN, « How to capture Wardogs towers » — https://www.pcgamesn.com/wardogs/capture-wardogs-towers

**Discussions Steam de WARDOGS** (https://steamcommunity.com/app/1867240/discussions/)

- S1 — délai des leurres — https://steamcommunity.com/app/1867240/discussions/0/571549822592501740/
- S2 — comportement de la défense sol-air — https://steamcommunity.com/app/1867240/discussions/0/562541966849805609/
- S3 — défense sol-air jugée trop forte — https://steamcommunity.com/app/1867240/discussions/0/562541634873785616/
- S4 — message de joueur relevé lors de l'analyse v12 dans ces discussions (nombre de lanceurs pour abattre un
  hélicoptère) ; fil non conservé.
- S5 — poste sol-air construit — https://steamcommunity.com/app/1867240/discussions/0/586183940257138361/
- S6 — canon CIWS — https://steamcommunity.com/app/1867240/discussions/0/585060903247153969/

**Réglages des serveurs**

- D1 — documentation communautaire de l'API des serveurs (projet warcon) —
  https://github.com/warcon-app/warcon (fichier « wardogs-api.md » de sa documentation) : noms des huit ambiances de lumière.
