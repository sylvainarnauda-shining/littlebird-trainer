# Loi de la souris (v13)

## Ce qui a été mesuré

La souris n'est pas visible sur les enregistrements de référence. Sa loi a donc été mesurée par la réponse de
l'hélicoptère, sur **43 passages rapides du point de visée** pendant lesquels la touche de tangage n'était pas pressée :
pour chacun, la vitesse de tangage lue sur le HUD image par image, alignée sur le passage, donne une courbe de réponse.
La moyenne de ces courbes est publiée comme donnée de test (`tests/fixtures/recordings/cross-curve.json`).

Résultat : **la vitesse du geste donne la vitesse de rotation.** Le mouvement de la souris pendant une image commande
une vitesse de rotation ; quand la souris s'arrête, le nez s'arrête en 1,1 à 1,4 s. Ce n'est pas un « manche
virtuel » (l'écart de la souris qui donne une vitesse qui continue), comme le supposait la v12, avec laquelle le nez
tournait encore environ 3 s après l'arrêt.

| Mesure                            | Valeur                                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gain en tangage, K                | 0,0271° par pixel du curseur (intervalle à 90 % : 0,0221 à 0,0343), au produit de sensibilité 0,08 des enregistrements (sensibilité / 100 × multiplicateur) |
| Gain de l'entraîneur              | 0,339 = K / 0,08 (intervalle à 90 % : 0,276 à 0,429)                                                                                                        |
| Retard propre de la souris        | 0,10 s (intervalle 0,05 à 0,20 s, non identifiable plus finement)                                                                                           |
| Pic de la réponse                 | 0,20 s après le passage (jeu : 0,22 s)                                                                                                                      |
| Écart moyen avec la courbe du jeu | 17,1 °/s avec le manche virtuel v12, **2,4 °/s** avec la loi mesurée (bruit de mesure du jeu : environ 2,9 °/s)                                             |

Un premier calcul avait lu le produit de sensibilité des enregistrements à 0,1 au lieu de 0,08 : le gain valait
alors 0,271. Il a été corrigé à 0,339 ; les mesures elles-mêmes ne changent pas.

## Pas de surapprentissage

La loi réglée sur l'enregistrement 1 prédit l'enregistrement 2 (écart 5,0 °/s, contre 18,0 °/s avec la v12), et
inversement (3,3 °/s, contre 17,0 °/s). Trois des 43 passages contiennent autre chose que du vol (curseur dans un menu,
changement de vue) ; sans eux, le gain mesuré serait 5 % plus bas, un écart non significatif (0,4 erreur type).

## Dans l'entraîneur

- Le gain en degrés par pixel vaut K = 0,339 × (sensibilité / 100) × multiplicateur × ajustement fin. On **suppose**
  que le jeu applique la sensibilité proportionnellement ; ce n'est pas encore vérifié en jeu.
- Le mouvement d'une image devient une vitesse de rotation tenue pendant les pas de simulation de cette image (le pas
  du modèle est de 1/120 s) : un geste tourne exactement de K × pixels, quel que soit le rythme des images.
- Souris et touches ensemble sont plafonnées aux vitesses des touches (52 °/s en tangage, 36 °/s en lacet) :
  **supposé**.
- Le gain en lacet est **supposé** égal à celui du tangage : les enregistrements ne contiennent que 13 passages
  horizontaux, trop peu pour l'identifier.
- Le pointeur capturé donne des pixels du curseur avec l'accélération du système (la capture ne demande pas de
  mouvement brut) : c'est l'unité dans laquelle K a été mesuré.
- Sans capture (mode de compatibilité), l'écart du pointeur depuis sa position de départ reste un manche virtuel, dans
  les deux lois.
- L'ancienne loi reste une option : Commandes › Souris › « Manche virtuel (v12) », avec son gain (0,05) et son retour
  au neutre (2,4 /s).

Conséquence : il faut un **geste plus ample** qu'avec le manche virtuel. Un geste de 400 px en 0,3 s donnait 45° de
tangage en v12 ; avec la loi mesurée et le produit de sensibilité des enregistrements, il en donne environ 11.

## Vérification

- Contrôles F14 et F15 : la courbe des 43 passages est reproduite (écart 2,4 °/s, pic 0,20 s) et le nez s'arrête en
  moins de 1,5 s après un geste, alors que le manche virtuel tourne encore au-delà de 2 s.
- Contrôle F34 : la loi passe par les vrais gestionnaires de la souris de l'application.
- Test dans le navigateur : un geste de 200 px, via la capture simulée, tourne le nez d'environ K × 200 px puis
  s'arrête.

## À mesurer

- Le gain à d'autres sensibilités (proportionnalité supposée).
- Le gain en lacet.
- Le retard propre de la souris (0,05 à 0,20 s).
- La queue d'un geste lent : avec le gain 0,339, un geste lent de 300 px laisse 1,03 °/s une seconde après l'arrêt,
  juste au-dessus de la cible de 1 °/s fixée d'avance.
