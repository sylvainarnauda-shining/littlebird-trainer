# Apparence du Little Bird (v13)

L'hélicoptère de l'entraîneur est un modèle original, construit dans le code (`src/models.js`) ; aucun modèle ni
texture du jeu n'est utilisé. Sa forme, sa matière et sa couleur ont été recalées sur les images de la vue poursuite
des enregistrements de référence. Toutes ces images montrent l'hélicoptère de l'arrière.

## Forme

Les positions du moyeu, de l'empennage, de la poutre de queue, des patins, de la poutre d'armement, des miniguns et de
la tuyère ont été mesurées sur 6 images du jeu, après avoir calé la caméra de l'entraîneur sur celle de chaque image :

- écart moyen avec le jeu : **50,9 px en v12, 4,6 px en v13** (56 repères, image 1080p) ;
- tous les repères à moins de 10 px ; sur des images qui n'ont pas servi au réglage, 2 à 6 px.

Principales corrections : hélicoptère plus haut sur ses patins (+7 %) ; queue plus basse et plus courte, stabilisateur
de 1,67 m avec ses dérives d'extrémité ; capot plat et poutre d'un seul tenant ; tuyère en bas à l'arrière ; patins qui
s'arrêtent à la traverse arrière ; poutre d'armement et miniguns 20 cm plus en avant ; tête de rotor basse et arrondie.

Rotor en marche : seulement les moignons des pales, et une fine bande sombre vue par la tranche à partir de 25 km/h
(complète à 50 km/h), aucune en stationnaire. Aucun feu clignotant : aucun n'est allumé dans le jeu.

Détails vus sur les images et ajoutés : fond du capot arrière en renfoncement sombre, tuyère ouverte en bas à
l'arrière, antenne en X sur la poutre, embout sombre en bout de poutre, ouvertures de portes plus grandes, mécanismes
des miniguns plus gros, pieds de pales plus longs.

Le contrôle F37 vérifie les repères mesurés.

## Rondeur de la cabine

Après la v13, la cabine paraissait « compactée sur les côtés ». Son contour a été relevé ligne par ligne sur 12 images
recalées (deux détecteurs indépendants, une ligne gardée seulement s'ils s'accordent à 1,6 px près) et comparé à la
silhouette exacte de l'entraîneur dans la même caméra :

- de derrière et de bas (5 images), le jeu a la largeur de la cabine de l'entraîneur, à 1 cm près par côté jusqu'à
  60 % de sa hauteur ; le contour de l'entraîneur est même 5 cm plus large, à cause des cadres de portes en tube, qui
  dépassent de 3,8 cm par côté et que le jeu n'a pas ;
- de derrière et de dessus (caméra 5,6 à 8,3 m plus haut, 5 images des deux enregistrements), le jeu est 9,5 cm plus
  large : 8,8 cm par côté vers l'avant de la cabine, 3,8 cm au milieu des portes, rien à sa section la plus large.

La cabine du jeu n'est donc pas plus ronde en section : vue de dessus, elle garde des flancs presque parallèles le long
des portes, là où l'œuf de l'entraîneur se resserrait vers l'avant. Une section plus large ou plus ronde, essayée,
éloignait la vue de derrière du jeu (7 à 17 cm trop large). La cabine est élargie seulement devant sa section la plus
large, progressivement, jusqu'à +12 % : 1,46 m au plus large au lieu de 1,43 m, 1,40 m au montant avant des portes au
lieu de 1,25 m. La hauteur, la longueur, l'arrière et les repères mesurés ne bougent pas. Le contrôle F37 vérifie ces largeurs.

| Écart du contour (jeu − entraîneur)      | avant   | après   |
| ---------------------------------------- | ------- | ------- |
| Largeur, de derrière et de dessus        | +9,5 cm | +2,6 cm |
| Largeur, de derrière                     | −5,2 cm | −5,4 cm |
| Écart moyen du contour sur les 12 images | 3,95 px | 2,91 px |

L'appareil réel (MD 500E et 530F) a un fuselage de 1,40 m de large, 1,45 à 1,50 m selon d'autres fiches
(`SOURCES.md`) : l'ancienne et la nouvelle largeur restent dans cette fourchette.

Ce qui se voit : de dessus, de trois-quarts arrière et de face, la silhouette grandit de 0,9 à 2,9 %. Dans la vue
poursuite par défaut (écran 1920 × 1080), le contour ne bouge que de 4 px au plus en stationnaire (silhouette +0,9 %),
de 3 px à 140 km/h en palier (+0,6 %) et de 1 px à 250 km/h (+0,2 %, vue élargie) : en vol, le nez baissé (2,7° et 8,4°,
l'assiette du vol en palier du modèle de vol, G tan θ = 0,0003 V²) montre moins le dessus de la cabine, et l'empennage
horizontal passe devant elle. C'est ce que donne la mesure : vue de derrière à la hauteur normale de la caméra, la
cabine du jeu n'est pas plus large que celle de l'entraîneur ; elle ne l'est que vue de plus haut.

## Matière

Après la forme, l'hélicoptère restait « crayeux » : gris, pâle, sans contraste. La répartition des luminosités de la
peinture, les reflets et la couleur ont été comparés sur 12 vues du jeu (7 pour régler, 5 pour contrôler). Le niveau
moyen était juste ; il manquait les tons sombres (creux, dessous, ouvertures), les bords rasants s'éclaircissaient
par le reflet du ciel, le soleil éclairait trop fort et l'ombre tirait sur le bleu.

Corrections, sur l'hélicoptère seulement : ombre des creux calculée sur sa forme, reflet du ciel réduit sous
l'horizon, peinture moins claire au soleil et ombre neutre, miniguns et poutre d'armement en métal sombre (au soleil et
à l'ombre, luminosité médiane 0,040 et 0,038 dans le jeu, 0,034 et 0,030 dans l'entraîneur). Sur une zone de pixels
fixe, l'écart de rendu baisse de 23 % sur les vues de réglage et de 22 % sur les vues de contrôle.

## Couleur

Mesurée en couleurs perçues (CIELAB, écart ΔE00 : moins de 1 invisible, 2 à 3 léger, plus de 5 net) sur les 12 vues
recalées (6 pour régler, 5 pour contrôler, 1 écartée) et sur 118 images de vol où l'hélicoptère est assez grand à
l'écran (97 de l'enregistrement 1 pour régler, 21 de l'enregistrement 2 pour contrôler), carrosserie seule. La lumière
du soleil et celle du ciel ont été séparées image par image pour mesurer la couleur de la peinture elle-même.

- La teinte était déjà la bonne : tan (h ≈ 75°).
- La peinture manquait de couleur : au soleil, intensité 15 au lieu de 20.
- Côté ombre, elle tirait sur le gris bleu au lieu du gris olive.
- Le soleil rasant éclairait trop : en vol, clarté 47 au lieu de 34.
- Le dessus de la poutre et de la queue, vu presque à plat à l'ombre, était trop clair (46 au lieu de 40).

Corrections : peinture plus colorée à clarté égale (#9f9081 → **#a58f76**) ; peinture plus sombre quand le soleil
l'éclaire en biais (N·L² au lieu de N·L, loi ajustée sur les images, sans cause identifiée dans le jeu) ; moins de
reflet du ciel sur le dessus vu en rasant. Les ennemis gardent leurs couleurs supposées, avec la même façon de prendre
la lumière.

| Mesure (réglage / contrôle)                                      | avant                    | après                    |
| ---------------------------------------------------------------- | ------------------------ | ------------------------ |
| Couleur du soleil sur la peinture, en vol (ΔE00, à clarté égale) | 3,3 / 1,9                | 1,5 / 1,8                |
| Écart moyen des zones de la carrosserie en vol (ΔE00)            | 5,3 / 4,5                | 2,8 / 2,2                |
| Le même, à clarté égale                                          | 3,0 / 3,0                | 1,7 / 1,8                |
| 12 vues recalées, zone par zone (ΔE00)                           | 4,9 / 4,9                | 4,8 / 4,2                |
| Côté ombre (jeu : h 70 à 81°)                                    | gris bleu (h 202 à 234°) | gris olive (h 98 à 100°) |

À l'aveugle, sur 23 vues, la version corrigée a été jugée plus proche du jeu dans 8 vues, pareille dans 10, moins
bonne dans 5 : l'amélioration est **réelle mais modeste**.

## Ce qui reste différent

- L'hélicoptère est plus clair et plus pâle que dans le jeu, à l'ombre et en vol : le jeu a plus de contraste.
- Vus de haut au soleil, la poutre et le stabilisateur sont presque gris neutre dans 2 vues du jeu, tan dans
  l'entraîneur ; une correction a été essayée puis écartée parce qu'elle n'améliorait pas les vues de contrôle.
- Face au soleil, la peinture de l'entraîneur a des reflets presque blancs (clarté 81 à 85 pour le 1 % le plus clair),
  pas le jeu (56 au plus sur 11 images) ; deux corrections essayées n'ont pas été retenues.
- Petit à l'écran (vol rapide ou lointain), l'hélicoptère du jeu paraît bien plus sombre, sans cause établie.
- La texture : taches et coulures dans l'entraîneur, panneaux et joints dans le jeu ; la tête de rotor reste
  simplifiée.
- L'avant et les flancs n'ont jamais été vus : il faudrait un tour lent de l'hélicoptère posé, en passant face au
  soleil, pour les régler. La forme de la cabine devant le montant avant des portes est prolongée, pas mesurée.
- Les cadres de portes en tube dépassent de la cabine (environ 3 cm par côté vus de derrière) ; le jeu n'en montre
  pas. Les enfoncer réduisait l'écart de derrière mais élargissait celui de dessus.

Les bases communautaires ne listent que deux habillages d'hélicoptère, tous deux pour le MH-6 non armé : l'AH-6M des
enregistrements porte la peinture d'origine.
