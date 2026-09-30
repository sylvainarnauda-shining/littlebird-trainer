# Sensations de vol (v13) : lacet, collectif, vue poursuite, fluidité

La v13 a repris la sensation de pilotage avec une méthode mesurée : rien n'est réglé « au jugé ». Chaque changement
vient des enregistrements de référence et n'est adopté que s'il les reproduit mieux sur les passages qui n'ont pas
servi à le régler (règle d'adoption : `../FIDELITE.md`). La loi de la souris est décrite à part (`souris.md`).

## Méthode

1. **Audit** : cinq pistes indépendantes (souris, touches, vitesse, caméra, modèle de vol) ont relu les
   enregistrements ; un arbitre les a confrontées et a fixé 16 mesures de référence (M1 à M16), chacune avec sa
   tolérance.
2. **Banc de rejeu** : les commandes relevées sont rejouées dans le modèle ; on compare image par image l'attitude, le
   cap, l'altitude et la vitesse.
3. **Adoption** : validation croisée en 18 blocs, réglage sur un enregistrement et contrôle sur l'autre, gain
   supérieur à deux erreurs types ; sinon, la valeur v12 est gardée.
4. **Contrôle exact** : l'entraîneur livré reproduit pas à pas le candidat retenu ; avec les réglages v12, il redonne
   exactement la v12.

## Ce qui a changé

|                           | v12                                 | v13                                                                                                                                        | Origine                                                                                 |
| ------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Lacet à la touche         | deux retards (0,30 + 0,40 s)        | un seul retard de 0,35 s                                                                                                                   | choisi dans l'intervalle mesuré 0,35–0,70 s                                             |
| Collectif en stationnaire | arc du levier au repère central     | arc à −0,14 sous le repère ; montées et descentes maximales inchangées                                                                     | mesuré (médiane −0,133 sur 653 images de stationnaire ; −0,14 en palier de 0 à 15 km/h) |
| Vue poursuite             | champ et recul fixes                | 85° jusqu'à 140 km/h, 109° dès 190 km/h (au champ de 85° des enregistrements : +24° ajoutés au champ réglé), caméra reculée de 14 à 15,5 m | mesuré par tranche de vitesse ; forme de la rampe supposée                              |
| Fluidité                  | l'image avançait par pas de 1/120 s | image interpolée entre deux pas                                                                                                            | mesuré : irrégularité 0,33 → 0,002                                                      |

### Lacet

La bande de cap de la vue poursuite suit la caméra, qui a elle-même 0,30 s de retard sur l'hélicoptère : l'ajustement
v6 (0,30 + 0,40 s) contenait donc déjà le retard de la caméra. L'hélicoptère garde un seul retard. Cap en vue poursuite
après un appui sur la touche de lacet depuis le stationnaire :

- à 0,73 s : 3,7° en v12, **8,4°** en v13 (jeu : 7,4 à 9,0° sur 3 appuis) ;
- à 1,47 s : 20,4° en v12, **30,5°** en v13 (jeu : 31,1 à 32,5°).

0,35 s est choisi dans l'intervalle mesuré ; un ajustement libre à un seul retard donne 0,55 à 0,6 s, à confirmer par
des échelons de lacet en vue pilote, absents des enregistrements. Un profil qui avait gardé l'ancienne valeur par
défaut (0,40 s) passe à 0,35 s, avec un avis.

### Collectif

Le levier de stationnaire est à −0,14 ; les autorités verticales sont remises à l'échelle (7,02 au-dessus, 4,07
au-dessous) pour que le levier à ±1 garde les montées et descentes maximales de 8,9 et 3,9 m/s en stationnaire. La
baisse du levier a été mesurée à 0,89 /s au lieu de 1 /s (27 appuis, intervalle à 90 % 0,81 à 0,98), mais ce gain ne
tient pas sur les passages non vus : 1 /s est gardé.

### Vue poursuite

Le champ et le recul augmentent avec la vitesse. La mesure compare la rotation du décor à celle du cap, par tranche de
vitesse (vitesse de cap de 6 à 80 °/s) : le rapport des focales donne le champ. Toutes les tranches au-dessus de
110 km/h tombent dans la tolérance ; la queue paraît 0,55 fois sa taille du stationnaire (jeu : 0,51 à 0,58). La vue
pilote, elle, reste fixe (`graphismes.md`). Le cap du HUD suit la caméra en vue poursuite (mesuré).

## Regard libre

Les enregistrements ont été relus pour vérifier qu'aucun regard libre ne faussait les mesures : vue poursuite deux fois
par seconde, rotation du décor comparée au cap soixante fois par seconde, viseur de la vue pilote dix fois par
seconde. **Aucun regard libre en cap n'y a été trouvé** ; les sept moments où la rotation du décor et le cap
différaient s'expliquent par des trous de lecture du cap, un menu, ou une caméra qui rattrape le cap après un lacet.

En revanche, la caméra extérieure du jeu regarde souvent l'hélicoptère **de haut** (40 à 60° au-dessus dans 100 des
282 images retenues, surtout en stationnaire), toujours de derrière. L'origine de cette hauteur n'est pas établie ;
l'entraîneur garde sa caméra à 10° sous l'horizon.

Dans l'entraîneur, le regard libre se maintient, ou se garde par un double appui (d'après des sources publiques,
`../SOURCES.md`) ; sa vitesse (0,0025 rad par pixel), ses limites (±149° et ±63°) et son retour au relâchement (d'un
coup en vue pilote, en douceur en vue poursuite) sont **choisis**, non mesurés.

## Aides au pilotage du jeu

Le modèle a été identifié sur des enregistrements faits avec les aides au pilotage du jeu actives ; il en contient
donc l'effet tel qu'il apparaît à l'image :

- le levier qui se règle seul pour tenir l'altitude correspond au maintien automatique ;
- le nez qui suit la trajectoire à vitesse correspond à la coordination des virages.

L'inclinaison monte jusqu'à 88° sur les enregistrements : le jeu ne la plafonne pas plus bas, l'entraîneur non plus.
Ces aides ne se désactivent pas dans l'entraîneur : il faudrait des enregistrements sans elles pour mesurer la
différence.

## Pas encore adopté

| Point                                                                              | Ce qu'on sait                                                                                                                    |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Virages lâchés à vitesse                                                           | vers 125–175 km/h, le nez semble suivre davantage le virage, mais les passages propres (un seul clic, puis rien) sont trop rares |
| Descente au collectif                                                              | mesurée à 0,89 /s, gain non confirmé sur les passages non vus                                                                    |
| Altitude pendant les manœuvres, freinage à basse vitesse, assiette de 27 à 55 km/h | écarts réels, mais aucun réglage testé ne les réduit de façon fiable                                                             |
| Souris en lacet, retard propre de la souris                                        | voir `souris.md`                                                                                                                 |

Les bots volent avec le même modèle ; leur collectif tient compte du nouveau levier de stationnaire (0 crash sur 36
vols simulés).
