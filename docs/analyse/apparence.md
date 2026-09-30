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
  soleil, pour les régler.

Les bases communautaires ne listent que deux habillages d'hélicoptère, tous deux pour le MH-6 non armé : l'AH-6M des
enregistrements porte la peinture d'origine.
