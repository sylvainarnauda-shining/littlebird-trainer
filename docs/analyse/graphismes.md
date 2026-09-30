# Graphismes, vues et cockpit

Tout est généré par le code de l'entraîneur (formes, textures dessinées en code, lumière) ; aucun modèle, texture ni
image du jeu n'est utilisé. Les comparaisons ont été faites avec des images des enregistrements de référence, qui ne
sont pas publiées.

## Vue pilote immobile

Les premières versions ajoutaient deux effets absents du jeu : une vibration de la tête (37 et 43 Hz, plus forte avec
la vitesse) et un élargissement du champ avec la vitesse (+5°). Vérification sur les enregistrements : des pièces fixes
du cockpit (boulon de la ferrure, fenêtre du compas, arceau du viseur, auvent) ont été retrouvées par corrélation sur
des images à 42, 49, 56, 73, 78, 222 et 226 km/h. Elles ne bougent que de quelques pixels (12 au plus), sans lien avec
la vitesse, alors que 5° de champ en plus rapprocheraient le boulon d'environ 50 px du centre.

Conclusion : **le jeu n'élargit pas le champ de la vue pilote avec la vitesse, et la vue ne vibre pas.** Les deux
effets sont retirés (réglages supprimés en 0.9.0). Le choc d'un impact reste une petite secousse d'angle (0,2° pour un
missile, amortie en 0,5 s). La vue poursuite, elle, s'élargit avec la vitesse (`sensations.md`).

## Champ de vision

Le jeu donne un champ **horizontal**. La focale mesurée en vue pilote (972 px en 1080p) correspond à 58° verticaux,
soit environ 89° horizontaux à 16:9. L'entraîneur prend le champ horizontal comme réglage (90° par défaut,
`../REGLAGES.md`) et en déduit le champ vertical selon le format de l'écran.

## Viseur

- Sur les enregistrements, la vue poursuite n'a **rien au centre de l'écran** ; la vue pilote a un viseur reflex vert
  sur une lunette fixée devant le pilote. L'entraîneur ne dessine donc le viseur qu'en vue pilote ; en vue poursuite,
  on vise aux traçantes.
- Réticule dessiné comme celui du jeu, en vert-jaune : croix de ±68 px en horizontal et de −60 / +75 px en vertical,
  coupée de 14 px au centre ; anneau de 13 px, point de 3,6 px ; cercle de 50 px, plein en bas et pointillé en haut
  (tailles en 1080p). Le viseur est collimaté : sa taille angulaire est fixe.

## Cockpit 3D

Deux images de la vue pilote servent de modèle. Chaque pièce est placée à partir de son contour sur l'image, à une
profondeur choisie devant l'œil, avec la géométrie de la caméra du jeu (focale 972 px, ligne de visée relevée de
0,06 rad et décalage de 22 et 15 px, mesurés, qui mettent le viseur sur l'axe des canons). Pièces reproduites : viseur
reflex (tambour, grille, arceau, verre), barre transversale, câble et montant, ferrure et ses boulons, cadre de porte
droit avec sa sangle, montant gauche de verrière avec le compas de secours, auvent avec 14 voyants, écran
multifonction dessiné en direct (bande de cap, compteur, symbole d'attitude), coque de cabine pour regarder autour de
soi.

Le cockpit est dessiné dans une seconde passe de rendu (plan proche à 2 cm, profondeur effacée entre les passes) : il
ne traverse jamais le décor et reste en place pendant le regard libre. Limites : de profil, les pièces sont des
plaques ; l'écran multifonction ne reproduit que la disposition.

## Forêt

- Feuillage en **plans texturés**, avec un atlas dessiné en code (touffes d'aiguilles de pin, rameau d'épicéa, grappe
  de feuilles, écorce), des normales qui sortent de la couronne (elle s'éclaire comme un volume), un intérieur plus
  sombre et un peu de lumière à travers les feuilles.
- Espèces : pins sylvestres (fût orangé nu, couronne irrégulière), épicéas, feuillus et bouleaux (fût clair et fin).
- Niveaux de détail : complet à moins de 330 m, simplifié jusqu'à 900 m, silhouettes au-delà.
- Buissons sur les prairies et en lisière, touffes d'herbe autour de la caméra en vol bas.
- Densités, hauteurs et couleurs : `foret-dca.md`.

## Sol, eau, lumière

- Sol : grain d'herbe et de terre sur des carreaux de 4,5 m, fondu dans le même motif à 24 m avec la distance ; relief
  fin tiré du grain ; strates rocheuses sur les pentes raides ; pierres dans le lit et sur les berges de la rivière.
- Couleur de l'herbe recalée sur les images :

  |                       | Couleur médiane | Teinte | Saturation | Valeur |
  | --------------------- | --------------- | ------ | ---------- | ------ |
  | Jeu, enregistrement 1 | #444c30         | 77°    | 0,37       | 0,30   |
  | Jeu, enregistrement 2 | #4a5235         | 77°    | 0,35       | 0,32   |
  | Entraîneur, vallée    | #40482a         | 76°    | 0,42       | 0,28   |
  | Entraîneur, rivière   | #4f5535         | 71°    | 0,38       | 0,33   |

- Eau gris-vert avec le reflet du ciel, rides qui dérivent avec le courant, en partie transparente : la rivière paraît
  peu profonde, comme sur les images.
- Lumière : soleil, lumière du ciel sur tous les matériaux, ombres autour de l'hélicoptère ; huit ambiances de jour
  (`decor.md`).
- Post-traitement : rendu HDR avec anticrénelage, bloom léger sur les zones très lumineuses (soleil, flammes,
  traçantes, leurres), courbe ACES, étalonnage, netteté, pas de flou de mouvement. La qualité basse désactive le
  post-traitement.

## Coût

Les budgets d'images par seconde (45 i/s en stationnaire au-dessus de la forêt, 40 i/s en duel contre deux bots) sont
mesurés en local par `npm run test:perf`. La qualité moyenne et la qualité basse réduisent les arbres, les ombres et la
résolution.

## Limites

- La rivière de la vallée de référence est plus large que le torrent des images.
- Les arbres sont plus simples que ceux du jeu ; vus de très près par en dessous, on devine leurs plans.
- Les villages sont plus clairsemés et plus réguliers que ceux du jeu.
