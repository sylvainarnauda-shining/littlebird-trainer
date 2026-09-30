# Forêt, carburant, défense sol-air, combat au sol et bots

## Forêt

### Ce que montrent les enregistrements

- Pins sur les versants : long fût orangé nu, couronne irrégulière dans le haut de l'arbre.
- Feuillus élancés, écorce claire, feuillage jaune, orange ou vert.
- Vus d'en haut, les versants forment une canopée presque continue ; le fond de vallée a des prairies, des bosquets et
  des rangées d'arbres le long de la rivière, avec de l'herbe entre les massifs.
- Couleurs mesurées à l'écran, plus ternes qu'une forêt « de synthèse » : verts de #464c3b à #606e50 (saturation
  environ 0,25), tons d'automne de #56462a à #735d34 (environ 0,45), herbe de #49513a à #535433.

### Dans l'entraîneur

|                                                                       | Entraîneur                                                                | Enregistrements             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------- |
| Arbres de la vallée de référence, qualité haute                       | environ 290 000 (moyenne 170 000, basse 85 000)                           | —                           |
| Espèces                                                               | pin sylvestre, épicéa, feuillu à écorce claire, bouleau                   | pins, feuillus d'automne    |
| Hauteur                                                               | 10,5 à 20 m (médiane 16,2 ; p90 19,0)                                     | cimes et toits de 13 à 20 m |
| « AGL au-dessus des arbres », même mesure que sur les enregistrements | p90 environ 19 m                                                          | p90 17 à 19 m               |
| Forêt                                                                 | fermée sur environ 60 % des versants bas, bosquets dans le fond de vallée | idem                        |

Les arbres arrêtent les balles et accrochent le rotor (grille de collision de 16 m, une boîte de tronc et une ou
plusieurs boîtes de couronne par arbre). Contrôle F24.

## Carburant

Les enregistrements montrent une jauge de carburant sous l'indicateur d'attitude : une pompe et 10 segments qui se
vident en continu. Lecture toutes les 2 s, croisée avec la vitesse et le levier :

| Vitesse           | Consommation mesurée (fenêtres de 20 s) |
| ----------------- | --------------------------------------- |
| moins de 100 km/h | environ 0,08 %/s                        |
| 100 à 180 km/h    | environ 0,15 %/s                        |
| 180 km/h et plus  | environ 0,28 %/s                        |

Lors d'un atterrissage sur l'hélipad, la jauge remonte d'environ 5 %/s.

Modèle de l'entraîneur : 0,02 %/s + 0,0011 %/s par km/h (0,32 %/s à 270 km/h, environ 5 minutes pleins gaz) ; plein à
5 %/s au ras de l'hélipad ; actif en partie réelle et avec munitions limitées. Réservoir vide : plus de puissance, il
faut se poser (comportement du jeu non observé). Limites : une graduation vaut 1,6 % ; la vitesse n'explique qu'à peine
la moitié des variations (R² 0,46). Contrôle F29.

## Défense sol-air

Les enregistrements ne contiennent **aucun verrouillage** : leur bande son, analysée par spectrogramme avec un bip de
test injecté pour contrôler la sensibilité, ne montre aucune tonalité de plus de 0,35 s ni suite de bips. Les règles
viennent donc de sources publiques (`../SOURCES.md`) ou de choix d'entraînement. Seuls les leurres sur V et leurs deux
charges (« 002 » à l'écran) sont observés.

### Verrouillage et missiles

- Un lanceur doit voir l'hélicoptère sans interruption (relief et bâtiments masquent ; les arbres, réglable), dans sa
  portée et au-dessus de l'altitude minimale (10 m). Après un temps de réaction, l'accrochage fait entendre des
  **bips** ; au bout de 2,5 s, il **verrouille** (son continu) ; le tir part un peu plus tard ; le son continu dure tant
  qu'un missile guide. Masqué plus de 0,35 s, le lanceur perd l'accrochage.
- Missile de 72 mm (valeurs publiées par des bases communautaires, non vérifiées en jeu) : 20 m/s à la sortie du tube,
  450 m/s en vol, armement après 0,13 s ; 200 points sur un impact direct, soit la moitié des 400 points de la coque de
  l'AH-6M, et des éclats jusqu'à 10,8 m. Il faut donc en général **deux missiles**. Le moteur pousse dans l'axe du
  tube ; le missile explose contre le relief et les bâtiments.

  | Distance de passage | 0 à 2 m | 3 m  | 5 m  | 8 m  | 10,8 m et plus |
  | ------------------- | ------- | ---- | ---- | ---- | -------------- |
  | Intégrité perdue    | 50 %    | 44 % | 33 % | 16 % | 0 %            |

- Autodirecteur infrarouge (choisi) : champ de ±30°, il suit la source la plus chaude de son champ ; un leurre est plus
  chaud que l'hélicoptère pendant environ 1,7 s ; masqué par le relief plus de 0,25 s, le missile perd sa cible.

### Leurres et esquive

- Leurres sur V, 2 charges, 6 leurres par salve, 12 s entre deux salves (durée choisie), rechargés sur l'hélipad.
- Fenêtre efficace **0,5 à 3 s avant l'impact** (environ 90 % de missiles leurrés), qui **découle** de l'autodirecteur :
  trop tôt, le leurre s'éteint alors que l'hélicoptère est encore dans le champ du missile ; trop tard, le missile passe
  dans le rayon de la fusée. Au bip continu, avant le départ du missile, c'est trop tôt. Les guides conseillent 1 à 2 s.
- Sans leurres (règles choisies pour l'entraînement, taux non mesurés) : un virage serré à 2 g en travers de la
  trajectoire, commencé au départ du missile, en sème environ 1 sur 4 ; le vol très bas en fait perdre environ 1 sur 3
  à 4 m et 3 sur 5 à 2 m ; se masquer derrière le relief casse l'accrochage et fait perdre un missile en vol.

### Lanceurs

- **Tireur Verba** : un fantassin, tube à l'épaule. Entre 100 et 1 000 m, il s'arrête, épaule (0,7 s), accroche puis
  verrouille en suivant l'hélicoptère, tire depuis le tube, puis recharge un genou à terre (12 s) et va chercher des
  missiles au dépôt de son camp. Tirer près de lui peut le faire fuir et casser l'accrochage. Abattu, son lanceur
  disparaît (+150).
- **Poste SAM** : un tube sur trépied, un servant assis, un missile dans le tube rechargé en environ 3 s, une réserve de
  8 missiles (+1 toutes les 15 s, choisi). Il ne vise pas au-dessus de 77° d'élévation (cône mort, d'après les guides).
  3 000 points de coque ; on détruit le poste ou on abat le servant (+80), qu'un fusilier vient remplacer dans un camp.
- Placement : dans l'exercice, sur des toits d'usine, des buttes, des clairières, la rive et deux postes SAM ; en partie
  réelle, dans les camps.

### Canon CIWS de 20 mm

Emplacement pointé par un servant assis. Valeurs publiées par des bases communautaires, non vérifiées en jeu :
1 800 coups/min, obus à 224 m/s (difficiles à ajuster de loin, ils tombent d'environ 100 m sur 1 km), 60 points par
obus (15 % de l'intégrité de l'AH-6M), chargeur de 500 obus rechargé en environ 5 s sur une réserve de 2 000, portée
efficace environ 1 km, 5 000 points de coque (environ 694 impacts de référence de minigun). Il ne tire pas à la
verticale. Le servant perçoit l'hélicoptère avec un retard et vise avec une erreur qui dépendent du niveau (choisis).
Canon détruit : +300 ; servant abattu : +80.

## Combat au sol

Choix d'entraînement, rien de mesuré dans le jeu, sauf les valeurs d'armes publiées (`../SOURCES.md`) :

- camps tirés au hasard (mirador, cabanes, bunker, tentes, dépôts de carburant et de munitions qui explosent,
  antenne) ; fantassins qui patrouillent, s'abritent dans les bâtiments quand l'hélicoptère approche ou que les balles
  tombent près d'eux, puis ressortent ; un abri détruit tue ses occupants ;
- en partie réelle, les fantassins ripostent par rafales, avec une précision qui baisse avec la distance et la
  vitesse ;
- tireurs de roquettes : RPG-7 (93 mm, 100 m/s, 300 m, 110 points en impact direct, souffle jusqu'à 12 m) et MAAWS
  (84 mm, 230 m/s, 400 m, 100 points) ; ils visent au-dessus et devant l'hélicoptère et ne tirent que quand le sol
  riposte ;
- véhicules armés sur la route (Humvee à minigun, pick-up à mitrailleuse M249) ; ils ne tirent pas à moins de 300 m de
  l'hélipad, la base.

## Bots (duel et partie réelle)

- Chaque bot vole avec **le même modèle de vol et les mêmes constantes** que le joueur, et pilote avec les mêmes quatre
  commandes : consignes de vitesse de rotation en tangage, lacet et roulis, et levier de collectif. Il tire avec les
  mêmes miniguns (25 coups/s après 0,35 s, 800 m/s, dispersion 0,35°, dégâts tirés dans la distribution observée). Il
  n'a aucun pouvoir que le joueur n'a pas.
- Perception : position vue avec un retard de 0,2 à 0,55 s selon le niveau ; relief et bâtiments le masquent ; il
  oublie une cible cachée au bout de 10 s.
- Comportements : anticipation du tir, garde de hauteur, virages en inclinant, rafales, dégagement après une passe,
  esquive quand il est visé, anti-collision, évitement du relief, des bâtiments, des cheminées et des câbles.
- Niveaux (choisis) :

  |                    | Découverte | Normal | Réaliste       |
  | ------------------ | ---------- | ------ | -------------- |
  | Temps de réaction  | 0,55 s     | 0,35 s | 0,2 s          |
  | Erreur de visée    | ± 2,8°     | ± 1,1° | ± 0,45°        |
  | Inclinaison max.   | 38°        | 48°    | 55°            |
  | Portée de tir      | 500 m      | 650 m  | 650 m          |
  | Repères et flèches | oui        | oui    | non (son seul) |

- AH-6R : deux paniers de 8 roquettes de 122 mm, 350 coups/min, rechargés en 6 s, 100 points par roquette (quatre
  roquettes abattent l'AH-6M) ; salves de 2 à 4 roquettes ; vitesse des roquettes choisie (600 m/s).
- Résistance des hélicoptères : non mesurée. Avec la coque de 400 points et −80 % contre les armes légères publiés
  par les bases, il faudrait environ 56 impacts de référence pour la coque seule ; le duel utilise 40 impacts de
  référence par défaut (réglable de 20 à 200), pour tous les hélicoptères, le joueur compris.
- En simulation (relief et modèle de vol réels, 36 vols) : aucun crash, garde au sol de plus de 15 m à tous les
  niveaux ; bot contre bot, aucun abordage.
