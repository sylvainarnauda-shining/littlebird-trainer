# Décor : vallée de référence et cartes générées

Le décor reprend les **ordres de grandeur** mesurés sur les deux enregistrements de référence ; ce n'est pas le plan
d'une carte du jeu. Tout est tracé par le code de l'entraîneur (`src/world.js`, `src/scenery.js`, `src/forest.js`).

## Ce que les enregistrements permettent de mesurer

### Relief

Le HUD affiche l'altitude au-dessus du sol (AGL) et au-dessus de la mer (ASL) : leur différence donne l'altitude du
sol sous l'hélicoptère, image par image.

| Mesure                                | Enregistrement 1                    | Enregistrement 2                    |
| ------------------------------------- | ----------------------------------- | ----------------------------------- |
| Hélipad de départ                     | ASL 84, AGL 0                       | ASL 84, AGL 0                       |
| Altitude du sol survolé               | environ 0 à 104 m                   | 75 à 104 m                          |
| Pente du sol sur 100 m de trajectoire | médiane 0,03 ; p90 0,14 ; max. 0,30 | médiane 0,09 ; p90 0,16 ; max. 0,19 |

Les sommets enneigés visibles tout autour ne sont jamais survolés : leur hauteur n'est pas mesurée (plusieurs centaines
de mètres au-dessus de la vallée, par estimation angulaire).

### Hauteur des objets

**L'AGL du jeu compte les objets** : au passage au-dessus d'un arbre ou d'un toit, l'AGL chute alors que l'ASL ne bouge
pas. L'enveloppe basse du sol sur ±60 m de trajectoire donne le terrain ; ce qui dépasse est un objet.

|                                      | Enregistrement 1 (106 objets) | Enregistrement 2 (54 objets) |
| ------------------------------------ | ----------------------------- | ---------------------------- |
| Médiane de la hauteur max. par objet | 7 m                           | 13 m                         |
| p75                                  | 12 m                          | 15 m                         |
| p90                                  | 16 m                          | 18 m                         |
| Max.                                 | 19 m                          | 20 m                         |

Les objets de plus de 12 m sont des cimes d'arbres et des toits d'usine : **arbres et toits de 13 à 20 m**.
L'entraîneur fait de même : l'AGL compte les arbres et les toits, et affiche AGL 0 et ASL 84 posé sur l'hélipad
(contrôle F28).

### Grandes structures, estimées sur images

- Grande cheminée : environ 90 m (± 15 m) ; son sommet apparaît au niveau de l'horizon quand la caméra est vers 170 m
  ASL, au-dessus d'un sol à 80–85 m. La seconde fait environ 80 % de la première.
- Pylônes haute tension : environ 35 m (deux fois la hauteur des arbres voisins).
- Grues portuaires : environ 30 à 40 m.
- Tours : environ **33 m jusqu'au toit**, mesurés avec l'AGL au-dessus d'une tour de l'enregistrement 1.

### Éléments observés

Vallée de montagne avec une rivière de 20 à 35 m de large, voie ferrée double sur ballast, route à deux voies,
prairies, forêt mixte (conifères sombres, feuillus d'automne jaunes et orange), usine (halles, bâtiments en brique, deux
cheminées, grues sur rail, wagons, conteneurs), ligne haute tension, sommets enneigés. L'hélipad est dans une cour
murée de gravier mouillé, avec des flaques, à côté d'une halle ; autour, des conteneurs, des fûts, un filet de
camouflage. Les tours ont des pieds en acier contreventés, un gros bloc en panneaux avec leur numéro sur chaque face, un
toit avec cabane d'escalier et un escalier extérieur. Les villages ont des maisons crépies à toit à deux pans, des
granges en tôle, quelques immeubles ; un viaduc de pierre franchit la vallée.

## La vallée de référence

| Élément                            | Entraîneur                                            | Origine                                       |
| ---------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| Hélipad                            | ASL 84 m, cour murée                                  | mesuré, observé                               |
| Fond de vallée                     | 14 à 115 m ASL, descend vers le nord                  | mesuré (0 à 104 m survolés)                   |
| Pentes du fond de vallée sur 100 m | médiane 0,02, p90 0,14                                | mesuré : médiane 0,03 à 0,09, p90 0,14 à 0,16 |
| Montagnes                          | jusqu'à environ 1 300 m ASL, neige au-dessus de 800 m | estimé                                        |
| Arbres                             | 10,5 à 20 m                                           | mesuré : 13 à 20 m (voir `foret-dca.md`)      |
| Halle d'usine                      | 18 m ; autres bâtiments 10 à 26 m                     | mesuré : toits de 14 à 20 m                   |
| Cheminées                          | 90 et 72 m                                            | estimé                                        |
| Grues portuaires                   | 33 à 36 m                                             | estimé                                        |
| Pylônes haute tension              | 35 m, câbles solides                                  | estimé                                        |
| Conteneurs                         | 12,19 × 2,59 × 2,44 m                                 | norme ISO 40 pieds                            |
| Route                              | 8 m, deux voies                                       | norme, cohérent avec les images               |
| Voie ferrée                        | ballast de 10 m, deux voies                           | observé                                       |
| Rivière                            | 31 m d'eau, lit de graviers                           | observé : 20 à 35 m                           |
| Tours                              | trois tours numérotées d'environ 33 m                 | mesuré                                        |
| Village                            | au sud de l'hélipad, et cinq champs                   | choisi, d'après les images                    |

## Cartes générées

Le menu « Carte » propose une **nouvelle carte** : une vallée du même type, tracée à partir d'un numéro (visible dans
l'adresse, par exemple `#carte=gen-123456` ; le même numéro redonne la même carte). Chaque carte a une rivière dans un
lit de graviers, une route, une voie ferrée, une usine avec une à trois cheminées de 60 à 100 m, un ou deux villages,
quatre à neuf champs, trois tours numérotées, une ligne haute tension, des ponts, souvent un viaduc, et un nom de lieu
inventé.

Règles vérifiées sur 300 cartes : l'hélipad est plat ; le couloir de tir devant l'hélipad reste dégagé ; les tours
font 32 à 35 m et sont séparées d'au moins 450 m ; chaque carte a deux postes SAM et huit à onze postes de tir au
total ; les maisons évitent la rivière, la route et la voie ferrée ; les champs sont plats et sans arbre ; les ponts
enjambent l'eau. Les contrôles G03 et les goldens du monde vérifient dix cartes et la reproductibilité.

## Ambiances de lumière

Les serveurs du jeu tirent une ambiance parmi huit à chaque partie : toutes de jour, deux avec brouillard, ni nuit ni
pluie (documentation communautaire, `../SOURCES.md`). L'entraîneur en tire une au hasard, ou utilise celle choisie
dans le menu. Ses huit ambiances portent des noms neutres :

| Identifiant             | Libellé                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| `aube-clair`            | Lever du jour, ciel clair                                                |
| `matin-clair`           | Matin, ciel clair                                                        |
| `matin-brouillard`      | Matin, brouillard                                                        |
| `midi-clair`            | Midi, ciel clair                                                         |
| `apres-midi-clair`      | Après-midi, ciel clair (lumière de référence, celle des enregistrements) |
| `apres-midi-gris`       | Après-midi, ciel gris                                                    |
| `apres-midi-brouillard` | Après-midi gris, brouillard                                              |
| `soir-clair`            | Fin du jour, ciel clair                                                  |

Les couleurs, le brouillard et la position du soleil sont l'interprétation de l'entraîneur (choisis).

## Limites

- Les cartes sont des vallées d'environ 6 km dans le style des enregistrements, pas les cartes du jeu.
- Les villages sont plus clairsemés et plus réguliers que ceux du jeu.
- La rivière de la vallée de référence reste plus large que le torrent des images.
