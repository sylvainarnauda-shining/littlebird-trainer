# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Chaque changement de comportement est
déclaré ici, dans un commit à lui seul, avec la preuve que les goldens ne changent que là où il le dit (trailer
`Golden-Update:` du commit, voir `CONTRIBUTING.md`).

## [Non publié]

### Tests et outils

- **Crochets de test du joystick ; la suite `joystick` de l'enregistreur n'en dépend plus par les `id` du panneau
  (menus 1.0, phase M0c).** La suite `joystick` et les specs du joystick pilotaient le panneau Manette · HOTAS par les
  `id` de ses contrôles (le bouton « Lire les manettes », la liste des appareils, l'interrupteur HOTAS, l'appareil du
  tangage, l'import du fichier du jeu, son aperçu et « Appliquer »), que la page HOTAS fidèle au jeu retirera. Le crochet de
  test de la page (`window.__LB_EXPOSE__`, réservé aux tests, jamais défini par la page) expose en fin de liste huit
  membres, qui exécutent le code que les contrôles exécutent : `joyReading(on)`, `joyDevices()`, `joyHotas(on)`,
  `joyAxisDevice(axe, appareil)`, `joyImport(fichier)`, `joyPreviewShown()`, `joyApply()` et `joyCancel()` (`joyCancel`
  ferme l'aperçu : l'oracle de la suite s'en sert quand l'application est refusée). Les contrôles du panneau appellent
  les mêmes fonctions : rien ne change pour le joueur. La suite `joystick` prend les crochets quand le runtime les a tous,
  sinon les `id` (le baseline que `golden.mjs prove` enregistre est un runtime sans crochets) : les deux chemins
  enregistrent les mêmes octets, ce que `tests/regression/joystick-panel-paths.test.js` vérifie en les faisant tourner
  sur la page actuelle (appareils listés, aperçu, profil enregistré, avis). Le test d'automatisation du joystick et une
  spec du navigateur passent par les crochets. Ce qui change dans les goldens : `hookapi` seul, qui liste les membres du
  crochet de test (huit de plus, jamais retirés) ; tous les autres sont identiques octet pour octet, celui du joystick
  compris (les deux chemins enregistrent la même chose), et `meta.json` ne change que par les empreintes de
  l'enregistreur et d'`app.js`. Le changement de l'enregistreur est prouvé neutre (`golden.mjs prove` sur le runtime
  d'avant les crochets, puis `--adopt`).

## [0.10.0] — 2026-10-02

Préversion : les joysticks (T.16000M, manche virtuel vJoy) peuvent piloter l’entraîneur, la cabine de l’hélicoptère est plus pleine devant les portes, et l’outillage de test se prépare aux menus fidèles au jeu (version 1.0). Les menus restent ceux de l’entraîneur.

### Comportement (changements déclarés)

- **Joysticks et HOTAS : le moteur (phase J1) et une page provisoire.** L'entraîneur peut lire des joysticks dans
  Chrome, Edge et l'application Windows : d'abord un manche virtuel vJoy (ce que le jeu lit quand un logiciel comme
  Joystick Gremlin fusionne les vrais manches et que HidHide les cache), sinon la première manette vue, ou deux manches
  physiques identiques, gauche et droit, désignés par une pression sur une gâchette (au lancement suivant, ils ne
  pilotent qu'une fois gauche et droite confirmés, et cette pression ne tire pas). Les six axes du fichier de réglages
  du jeu (tangage, collectif, roulis, lacet, regard libre horizontal et vertical), chacun avec sa manette, son numéro
  d'axe, l'inversion, la sensibilité, la zone morte et les boutons des deux sens, plus les boutons Tirer, Leurres et
  Changer de vue. Les directions d'un chapeau ne sont lues que sur un appareil dont le codage du chapeau est connu
  (T.16000M, 8 directions) : celui d'un manche vJoy dépend de son réglage, n'est pas vérifié, et l'import ne reprend
  pas ces directions. Valeurs par défaut publiques : celles du jeu (aucun appareil, sensibilité 1, zone morte 0,05, HOTAS
  désactivé). Réponse **supposée** (base B0, rien n'est encore mesuré dans le jeu) : déviation dans le canal des touches
  (déviation complète = vitesse de la touche), zone morte retirée puis remise à l'échelle, sensibilité en gain plafonné,
  collectif = position du levier, regard libre = angle de vue, manches ajoutés au clavier et à la souris. Rien n'est lu
  avant que le joueur le demande (« Lire les manettes », ou en vol avec le HOTAS activé) ; une manette qui n'a encore
  rien envoyé ne commande rien ; un appareil débranché en vol met la session en pause ; un bouton encore tenu à la
  reprise est ignoré jusqu'à son relâchement, y compris sur une manette qui n'envoie ses valeurs qu'après la reprise
  (rebranchée, ou après une page masquée). Nouvelle carte « Manette · HOTAS (page provisoire) » dans l'onglet
  Commandes, avec un test des axes en direct et l'import de la section joystick du fichier de réglages du jeu (aperçu,
  puis question sur chaque appareil ; le fichier est lu dans la page, rien n'est envoyé). Les réglages forment un bloc
  `joystick` du profil (schéma 1), enregistré et exporté seulement quand il diffère des valeurs par défaut. Sécurité :
  sous automatisation, `navigator.getGamepads` est une simulation (les manettes de la machine ne sont jamais lues par un
  test, les specs du navigateur piègent la vraie fonction) ; l'application Windows envoie `gamepad=(self)`, et
  `gamepad=()` pendant son auto-test. Sans manette, le clavier et la souris volent au bit près comme avant : les goldens
  de vol, des sessions, du monde, du son, du HUD, des réglages, des modèles, des modules et du contrat de test sont
  identiques ; seul le golden de l'interface change (inventaire des nouveaux réglages et textes de la carte). Détail :
  `docs/REGLAGES.md`.
- **Cabine un peu plus ronde vue de dessus** (demande du 01/10 : la cabine paraissait « compactée sur les côtés »). Mesuré
  sur 12 images de la vue poursuite des enregistrements de référence, caméras recalées, le contour de la cabine trouvé
  par deux détecteurs et comparé à la silhouette exacte de l'entraîneur dans les mêmes caméras. De derrière et de bas (5
  images), la cabine du jeu a déjà la largeur de celle de l'entraîneur, à 1 cm près par côté jusqu'à 60 % de sa hauteur.
  De derrière et de dessus (caméra 5,6 à 8,3 m plus haut, 5 images des deux enregistrements), elle est 9,5 cm plus large,
  surtout vers l'avant : ses flancs restent presque parallèles le long des portes, là où l'œuf de la v13 se resserrait.
  La cabine est donc élargie seulement devant sa section la plus large, progressivement, jusqu'à +12 % en avant de
  z −1,6 m : 1,46 m au plus large (1,43 m avant), 1,40 m au montant avant des portes (1,25 m avant), largeur sur hauteur
  0,755 au lieu de 0,72. Hauteur, longueur, arrière de la cabine, capot, poutre, queue, patins, armes et tous les repères
  mesurés (F37) ne bougent pas ; la vue pilote non plus (le cockpit est un modèle à part, et l'extérieur y est caché).
  Écart de largeur du contour, jeu moins entraîneur : de dessus et de derrière +9,5 → +2,6 cm, de derrière
  −5,2 → −5,4 cm ; écart moyen du contour sur les 12 images 3,95 → 2,91 px. Une section plus large ou plus ronde,
  essayée, rendait la vue de derrière 7 à 17 cm plus large que le jeu. Le changement se voit de dessus, de trois-quarts
  et de face (silhouette +0,9 à +2,9 %), à peine dans la vue poursuite par défaut : sur un écran 1920 × 1080, le contour
  bouge de 4 px au plus en stationnaire (+0,9 %), de 3 px à 140 km/h (+0,6 %) et de 1 px à 250 km/h (+0,2 %), car en
  vol le nez baissé montre moins le dessus de la cabine et l'empennage passe devant. Ce qui change dans les goldens :
  - modèles : les empreintes des 6 hélicoptères (le sien, la cible aérienne, les trois bots à miniguns, le bot à
    roquettes), avec les mêmes nombres d'objets, de sommets et de triangles ; véhicules, fantassins, poste SAM, canon
    CIWS, structures et cockpit identiques ;
  - monde : l'empreinte de la scène de démarrage des 11 cartes et des 3 autres démarrages (l'hélicoptère y est) ;
    terrain, forêt, cockpit et canevas identiques ;
  - sessions : les scènes de départ et de fin des 14 scénarios. Comme les tirs touchent le maillage réel de
    l'hélicoptère (`sweptMesh`), les points d'impact sur l'avant de la cabine (effets d'impact) bougent dans 7
    scénarios : `air`, `mixed`, `duel`, `air-cross`, `duel-behind`, `duel-random` et `match`. Dans `duel-random`, le
    journal du son, cumulatif, diffère aussi du point de contrôle 8 à la fin, avec le même nombre d'opérations. Les
    nombres échantillonnés ne changent pas, sauf dans 3 scénarios où un impact gagné, perdu ou décalé, suivi du tirage
    des dégâts (aléa à graine), fait diverger la suite (la couverture et les taux d'exercice restent au-dessus de leurs
    seuils) :
    - tir aérien (`air`) : un impact de plus au point de contrôle 27 sur 61, puis les cibles et, à partir du point 31,
      la trajectoire divergent ; à la fin 851 tirs et 110 impacts au lieu de 829 et 117, 8 cibles abattues dans les
      deux cas ;
    - match (`match`) : à partir du point 47 ; à la fin 285 tirs et 22 impacts au lieu de 281 et 21, 14 impacts reçus
      au lieu de 11, canon CIWS 406 tirs et 0 impact au lieu de 413 et 1, santé 90 au lieu de 80 ; même score (510),
      mêmes morts (3) ;
    - duel par l'arrière (`duel-behind`) : les impacts bougent au point 15, puis le pilote de test tire une fois de
      moins (95 tirs au lieu de 96 à l'image 1700, mêmes 14 impacts). L'ennemi est abattu entre les images 1600 et 1700
      dans les deux cas, mais son épave touche le sol 5 images plus tard (fin de partie à l'image 2181 au lieu
      de 2176) ; la partie rejouée repart plus tard (entre les images 2300 et 2400 au lieu d'avant 2200) et diverge
      entièrement : à l'image 4000, 67 tirs et 12 impacts au lieu de 134 et 8, 99 tirs du bot au lieu de 39, 36 points
      de contrôle actifs au lieu de 39 ;
  - inchangés : vol, parité (G5), son, HUD, réglages, interface, modules, API de test.

### Tests et outils

- **Joysticks : le banc de test (phase J3).** Nouveau golden `joystick`, enregistré avec des manettes simulées (jamais
  un appareil) et déterministe : la porte G-J2 (avec le HOTAS activé, des manches au repos dans leur zone morte volent
  au bit près comme le clavier et la souris avec le HOTAS désactivé, et avec le HOTAS désactivé aucune manette n'est
  lue, menu compris), la porte G-J3 (déviations complètes et boutons des manches = touches, au bit près), la base B0
  supposée (son descripteur, les valeurs par défaut publiques, `axisValue`, `decodeHat` et `joystickMix` sur des
  grilles), un vol avec un manche vJoy réglé par l'import d'une section de jeu synthétique (levier, déviations
  partielles, regard sur deux axes, chapeau du manche vJoy sans effet, boutons, débranché puis rebranché, gâchette tenue à la reprise), deux manches
  T.16000M identiques (proposition qui ne pilote rien, même manches en butée, échange par la première gâchette, qui ne
  tire pas, levier tenu tant que le manche
  rebranché n'a rien envoyé), un oracle de profils et de sections de jeu hostiles, et, sous automatisation, la vraie
  fonction `getGamepads` jamais appelée. Les autres goldens ne changent pas d'un octet ; l'enregistreur accepte des
  manettes simulées (`opts.gamepads`), changement prouvé neutre (`golden.mjs prove`). La porte complète et le test de
  mutation couvrent le nouveau golden (signe du roulis inversé, une valeur par défaut, le verrou de la reprise, la
  simulation coupée). Specs du navigateur pour la carte « Manette · HOTAS » avec des manettes simulées ; chaque spec
  vérifie la simulation de `getGamepads` avant tout départ ; l'auto-test de l'application Windows la vérifie aussi,
  avec `gamepad=()`, avant de cliquer sur « Démarrer ».
- **Enregistreur : générateur de la suite `settings` figé (menus 1.0, phase M0).** Les profils tirés par l'oracle des
  réglages ne dépendent plus de la page : leurs bornes (min, max et pas des 71 curseurs) et leurs énumérations
  (scénarios, choix des sélecteurs, noms des éclairages) sont des constantes de l'enregistreur, copiées de la page
  actuelle. Quand les menus 1.0 changeront une borne, les profils tirés ne bougeront donc pas : seul ce que le code en
  fait changera, et le diff de l'oracle restera lisible. L'oracle hache aussi les blocs `prefs` et `secondary` du
  profil, seulement si le runtime les expose sur son crochet de test et s'ils diffèrent d'une page neuve (aucun runtime
  ne les expose encore). Des tests figent la forme de ces constantes (elles nomment de vrais réglages) et la règle des
  blocs. Changement de l'enregistreur seul, prouvé neutre (`golden.mjs prove`, puis `--adopt`) : tous les goldens sont
  identiques octet pour octet ; seules les empreintes de l'enregistreur, dans `meta.json` et `MANIFEST.json`, changent.
- **Enregistreur et outils : les listes de scripts viennent du gabarit de la page (menus 1.0, phase M0b).**
  L'enregistreur des goldens, `golden.mjs`, le test de mutation, la porte G1 (`ast-identity.mjs`), `verify-build.mjs`
  et trois tests de la page construite codaient chacun la liste, ou le nombre (13), des scripts de la page : y ajouter
  un script, comme le feront les menus 1.0 (`settings-data.js`, `settings.js`, `menus.js`), les aurait fait échouer
  ou aurait laissé le nouveau script hors de leurs contrôles. L'enregistreur lit maintenant les balises `<script>` du
  gabarit (nouveau module `tools/golden/template.cjs`) : three.js, `core/pow.js`, les modules du jeu, les trois
  scripts des menus, facultatifs et chacun à sa place, puis `app.js`. Tout autre script, ou un autre ordre, arrête
  l'enregistrement comme avant. `golden.mjs` extrait d'un commit le gabarit, puis les fichiers qu'il nomme (un commit
  antérieur aux menus se lit sans eux, un fichier nommé mais absent est refusé) ; le test de mutation et `ast-identity`
  prennent les fichiers du gabarit. `verify-build.mjs` attend un script en ligne de plus que `SCRIPTS` (celui des
  erreurs) au lieu de 13 ; les tests `csp` et `bundle` et la spec CSP du navigateur en déduisent leurs nombres, et
  `bundle.test.js` lit la liste des scripts dans le gabarit, si bien que les contrôles de sécurité (aucune API réseau,
  aucun crochet de test défini par la page) couvrent un script ajouté. Tests : le gabarit avec et sans les scripts des
  menus et les formes refusées, le démarrage d'une page avec eux, l'extraction d'un commit sans eux, avec eux, et d'un
  commit incohérent (dépôt temporaire), le nombre de scripts de `verify-build.mjs` dans les deux sens, les fichiers
  comparés par défaut par `ast-identity`. Changement de l'enregistreur seul, prouvé neutre (`golden.mjs prove`, puis
  `--adopt`) : tous les goldens sont identiques octet pour octet ; seules les empreintes de l'enregistreur, dans
  `meta.json` et `MANIFEST.json`, changent. `baseline.test.js` lit toujours 13 fichiers dans `meta.json` jusqu'à la
  première mise à jour des goldens.

## [0.9.0] — 2026-10-01

Première version publique. Elle part de l'entraîneur v13 (modèle de vol v6 identifié sur deux enregistrements de
référence, loi de la souris v13), importé octet pour octet, puis préparé pour la publication étape par étape.

### Comportement (changements déclarés)

- **Outils de calibration retirés** (S8d). L'onglet de calibration (gestes de référence, atelier A/B, journal de vol), son
  guide en vol et le bouton de journal de la pause ne font plus partie de l'entraîneur public. Le vol, les modes et
  l'interface publique ne changent pas.
- **Textes de l'interface neutres** (R2, avec R5.4). Les textes ne renvoient plus aux enregistrements, au fichier de
  réglages ou aux dates d'une personne ; on parle des « enregistrements de référence ». Les avis de migration du
  profil sont neutres : révision 12, « Sensibilités de la souris remises aux valeurs par défaut » ; révision 16, une
  mesure corrigée du gain de la souris. Les noms inventés par le jeu sont remplacés par des noms neutres (« poste
  SAM », « canon CIWS », « Ravitaillement », factions désignées par leur tenue) ; les désignations réelles restent
  (AH-6M, AH-6R, 9K333 Verba, M249, RPG-7, MAAWS). La vallée habituelle s'appelle « Vallée de référence ».
- **Identifiants des ambiances de lumière renommés.** Les huit ambiances gardent leurs paramètres et leur ordre sous
  des identifiants neutres (`aube-clair`, `matin-clair`, `matin-brouillard`, `midi-clair`, `apres-midi-clair`,
  `apres-midi-gris`, `apres-midi-brouillard`, `soir-clair`). Un profil enregistré avec un ancien identifiant revient à
  « au hasard », comme tout identifiant inconnu.
- **Ambiance de lumière cherchée parmi ses propres clés** (R5.1). Un profil importé avec `lighting` égal à
  `constructor`, `toString`, `__proto__` ou `hasOwnProperty` revient à « au hasard » (avant : la valeur était gardée
  et l'application lisait les propriétés d'`Object`) ; `applyLight()` revient de même à la lumière de référence.
- **Tous les nombres importés sont bornés** (R5.2). Rayon de la fusée des missiles (`aaFuse`) : 1 à 20 m ; portée
  minimale des lanceurs (`aaMinRange`) : 0 à 1 000 m (bornes choisies ; valeurs par défaut 5 et 100 m). Les autres
  nombres l'étaient déjà par la plage de leur réglage.
- **Export minimal du profil** (R5.3). Le fichier exporté ne contient plus que
  `{format: "littlebird-trainer-profile", version, tuningRevision, settings, bindings}` (avant : un nom d'affichage et
  une note sur l'origine des mesures). Les anciens exports s'importent toujours.
- **Valeurs par défaut publiques** (R5.5, R5.5b). Un nouveau profil et le bouton « Réglages initiaux » partent de
  valeurs publiques au lieu de réglages personnels : multiplicateur aérien 0,5 et champs de vision 90° (lus dans des
  guides), axe vertical non inversé, sensibilités 50 % et isolation 0 (choisis), et les touches par défaut du jeu pour
  l'hélicoptère : collectif Maj gauche / Ctrl gauche, cyclique W / S et A / D, lacet Q / E, tir au clic gauche, leurres
  V, caméra C, regard libre Alt gauche ; B, R et X restent les actions propres à l'entraîneur. Un profil enregistré ou
  importé garde toutes ses valeurs et touches ; seules les valeurs absentes ou invalides prennent les nouvelles valeurs
  par défaut. Sources et détail : `docs/REGLAGES.md`.
- **Options mortes retirées** (R5.6). La vibration de la caméra et l'élargissement du champ avec la vitesse (deux
  effets que le jeu n'a pas), les aides de vol v3 (remise à plat, anti-dérive, traînée linéaire) et la note de DPI de
  la souris n'ont plus de réglage et restent à leur valeur par défaut ; un profil qui les contient est ramené à ces
  valeurs.
- **Rechargement du tireur Verba** (R5.7). Juste après un tir, le lanceur est au repos avec son rechargement en cours ;
  si la réflexion périodique du tireur tombait à ce moment, il repassait en patrouille sans recharger le missile tiré
  (environ un tir sur trente). Il attend désormais son rechargement.
- **Import du fichier de réglages du jeu limité à sa section hélicoptère** (R5.8). Seules les lignes de la section des
  réglages utilisateur du jeu sont lues ; un fichier sans cette section n'importe rien et l'import est refusé avec
  l'avis habituel.
- **Confirmation avant de fermer pendant une session** (navigateur). Dans Chrome et Edge, Ctrl + W ferme l'onglet et
  aucune page ne peut l'empêcher ; or, avec les touches par défaut, descendre en piquant fait Ctrl gauche + W. Pendant
  une session (en vol ou en pause, pas sur l'écran de résultats), la page demande désormais au navigateur de confirmer
  la fermeture ou le rechargement. L'application Windows n'a pas ce raccourci et ferme toujours sans demander. Le vol et
  les modes ne changent pas : tous les goldens sont identiques.
- **Libellé de la vue poursuite** (étape de formulation). Il dit maintenant que l'élargissement de la vue poursuite
  s'ajoute au champ réglé (+24° dès 190 km/h, de 85° à 109° au champ des enregistrements) ; avant, il donnait
  seulement 85° et 109°, faux avec le champ par défaut de 90°. Seules les empreintes de ce texte changent dans les
  goldens (interface).
- **Puissances calculées de la même façon sur toutes les plateformes** (`src/core/pow.js`). `Math.pow` et l'opérateur
  `**` s'appuient sur la bibliothèque C du système, qui n'arrondit pas de la même façon sous Linux et sous Windows
  (mesuré sur Node.js 24.19.0 : c'est la seule fonction mathématique dans ce cas) ; avec la même graine, la vallée et
  les bots différaient donc au dernier chiffre binaire d'une plateforme à l'autre. L'entraîneur calcule maintenant ses
  13 puissances avec sa propre fonction, un portage de `e_pow.c` de fdlibm (erreur inférieure à 1 ulp, même résultat
  partout), et ses 16 carrés par un produit (`x*x`, le carré arrondi correctement). Les résultats peuvent changer au
  dernier bit. Dans le navigateur, three.js garde le `Math.pow` et le `**` du navigateur (couleurs, tailles de
  textures) ; seul l'enregistreur des goldens lui donne la fonction déterministe et calcule ses deux carrés `**2` par un
  produit. ESLint refuse désormais `Math.pow` et `**` dans `src/`, et toute autre écriture de `Math` que `Math.<nom>`.
  Ce qui change dans les goldens, mesuré étape par étape sous Windows (les carrés écrits en produits n'en changent
  aucun) ; seules des empreintes changent, aucun compte ni aucune structure :
  - puissances du jeu : monde (hauteurs du terrain des 11 cartes et des 3 profils de démarrage, lignes de vue,
    obstacles, pylônes et câbles, tables d'une carte générée, scènes et journaux des canevas) ; sessions (scènes de
    départ et de fin et journaux des canevas des 14 scénarios ; duel : bots à partir du point de contrôle 17, cibles et
    scène à partir du 58, diagnostics au 61) ; modules (bataille au sol de la vallée, 9 vols de bots, aides de la
    physique). Écarts : au plus 1,1 × 10⁻¹³ m sur le terrain (2,3 à 2,9 % des points de chaque carte), 3 × 10⁻¹³ m et
    4 × 10⁻¹⁴ m/s pour les bots, sans aucune décision de tir changée ; l'hélicoptère du joueur ne change pas ;
  - three.js dans l'enregistreur : empreintes des 18 modèles 3D, des scènes et du cockpit de chaque carte et profil de
    démarrage, des scènes de départ et de fin des sessions (couleurs converties par three.js) ;
  - inchangés : vol, parité (G5), son, HUD, réglages, interface, API de test.
- **Version complète dans le menu et onglet « À propos »** (demande du 30/09 : que la personne qui télécharge ou suit
  le projet voie si elle a la dernière version). Le menu affiche le numéro complet (`v0.9.0` au lieu de `v0.9`), et un
  quatrième onglet, **À propos**, redonne le nom et la version, dit comment savoir si c'est la dernière (« Compare avec
  la dernière version sur la page des versions du dépôt ; l'entraîneur ne vérifie rien tout seul et n'envoie rien. »), montre
  l'adresse de la page Releases en texte et en lien (nouvel onglet, sans `opener` ni référent), la licence MIT, la
  mention « projet non officiel » et où se trouvent les avis des composants tiers. La version n'est écrite qu'une fois,
  dans `package.json` : la construction la reporte dans la page (aucune copie dans les sources ; construction refusée
  pour un modèle sans emplacement de version ou une version qui n'est pas X.Y.Z, `verify:build` refuse une page qui en
  affiche une autre). Aucun code réseau ni vérification de mise à jour : le jeu ne contacte rien. Dans l'application
  Windows, le lien s'ouvre dans le navigateur par défaut par la règle qui existait déjà (l'adresse exacte de la page
  Releases, et elle seule, jamais pendant l'auto-test), sans préchargement ni IPC. Le raccourci garde son nom,
  **LittleBird Trainer**, sans numéro. Seul le golden de l'interface (`ui`) change : un bouton de plus dans
  l'inventaire (l'onglet `about`, au rang 4), le rang de chaque commande et bouton qui le suit décalé d'un, et
  l'empreinte des textes ; les configurations de session et les valeurs par défaut n'y changent pas, et les autres
  goldens (vol, parité, sessions, monde, son, HUD, réglages, modèles, modules, API de test) sont identiques octet pour
  octet.

### Application Windows

- **Nouvelle application Windows** (P5), sur Electron 44.5.1 (Chromium 152) : la même page, dans une fenêtre sans
  Node.js, servie depuis l'origine `app://littlebird`. Installateur en un clic pour l'utilisateur courant, sans droits
  administrateur, avec raccourcis Bureau et menu Démarrer (`LittleBird-Trainer-Setup-0.9.0.exe`), et zip portable
  (`LittleBird-Trainer-0.9.0-win-x64.zip`). La désinstallation garde le profil (`%APPDATA%\LittleBird Trainer`).
  F11 : plein écran ; pas de barre de menus (Alt reste le regard libre). Non signée.
- Sécurité : aucun réseau, aucune navigation vers l'extérieur ni fenêtre surgissante, deux permissions seulement
  (verrouillage du pointeur, plein écran), export du profil par la boîte « Enregistrer sous », démarrage refusé sans
  politique de sécurité stricte dans la page ou avec un commutateur de débogage, fusibles d'Electron (pas de mode
  Node.js, `app.asar` vérifié au démarrage), aucune mise à jour automatique. Règles testées sans Electron
  (`desktop/policy.cjs`).
- **Electron 44.5.1** (au lieu de 44.4.5, avant la première version) : correctifs de sécurité reportés de Chromium,
  ANGLE, Dawn et V8 (44.5.1), et une trentaine de corrections, dont des plantages du processus graphique (44.5.0).
  Chromium reste 152.0.7977.130 et V8 15.2. Le calcul du vol dans le moteur de l'application a été mesuré de nouveau
  (G5) : même empreinte qu'avec 44.4.5.
- Auto-test intégré (`--lb-self-test`, avec la variable d'environnement `LB_SELF_TEST` égale au nonce) : page,
  capture simulée vérifiée avant « Démarrer » et encore juste avant le clic, calcul du vol comparé à la référence
  (G5), session, export, et refus du réseau, des fenêtres, de la navigation, des scripts injectés et des
  téléchargements non prévus ; fenêtre qui ne prend ni le focus ni la souris, permissions toutes refusées.
- **Auto-test : la session vole jusqu'à 2 s simulées** (au moins 20 images qui font avancer le vol et dessinent la
  scène, 3 minutes au plus) au lieu d'être mesurée sur 3 s de temps réel. En rendu logiciel (WARP, les machines de la CI
  n'ont pas de carte graphique), la vallée s'affiche à environ une image par seconde (0,6 s par image sur un processeur
  de bureau à 12 fils, 1,2 à 1,4 s avec 4 processeurs) et chaque image compte au plus 0,1 s de vol : 3 s de temps réel
  ne simulaient que 0,1 à 0,5 s, et l'auto-test échouait (« the session did not fly ») alors que la session tournait,
  visible et avec le focus. Le rapport garde la chronologie des images (première, médiane, plus longue, blocages). Les
  sondes négatives attendent leur preuve avant de conclure : le téléchargement refusé enregistré, la tentative de
  navigation vue par l'application (avant, la vérification pouvait réussir sans que la tentative ait eu lieu) et les
  violations de la politique reçues.
- Défense en profondeur : politique de sécurité de la page vérifiée sur une liste exacte au démarrage, WebRTC limité
  au mandataire (aucun n'est configuré), commutateurs refusés étendus (commandes lancées devant un processus de
  Chromium, fonctionnalités, journaux, profil ailleurs).
- **Icône Little Bird** (demande du 30/09) : l'hélicoptère vu de profil, nez à droite (cabine en œuf, grande verrière
  teintée, poutre de queue fine, empennage en T, patins, rotor), en cyan sur le carré ardoise. C'est notre propre
  dessin, fait par le code à partir de formes simples (`scripts/make-icon.mjs`, `build/icon.svg`) : aucune image du
  jeu, photo, logo, texte ni police. Chacune des sept tailles du fichier `.ico` (16 à 256 px) est calculée pour ses
  pixels : traits d'au moins un pixel, traits horizontaux et verticaux calés sur la grille jusqu'à 48 px, cadre de la
  verrière toujours visible, et jusqu'à 32 px un empennage simplifié en T.
- Aucun changement de comportement du vol ni du jeu : la page livrée est octet pour octet celle de la version
  navigateur ; les goldens sont inchangés. Mesure (G5) : le moteur de Chromium (Electron 44.4.5 et 44.5.1, Chrome 154)
  arrondit certaines fonctions mathématiques autrement que Node.js 24 au dernier chiffre binaire ; le vol calculé reste
  à 1,3 × 10⁻¹² m du golden sur 60 s, et l'application calcule exactement comme Chrome (`docs/FIDELITE.md`).

### Intégration continue et publication

- Workflows GitHub : `ci.yml` (confidentialité, dépendances, lint, tests Node sous Linux et Windows, reproductibilité
  de la page, navigateur en rendu logiciel, application empaquetée ; vérification requise unique `ci-ok`),
  `release.yml` (sur étiquette `vX.Y.Z` : page et zip navigateur, installateur et zip portable, leurs vérifications,
  `SHA256SUMS.txt`, attestations de provenance et de composants, **brouillon** de version ; essai à blanc à la
  demande), `nightly.yml`, `maintenance.yml` (suivi d'Electron à 30 jours, audit, confidentialité), `codeql.yml`,
  Dependabot. Actions de GitHub seulement, épinglées par empreinte de commit ; jeton en lecture seule ; aucun secret
  requis pour construire.
- Publication : fichiers livrés liés à leur travail de construction par leurs empreintes SHA-256 (sorties des travaux),
  téléchargements d'artefacts nommés seulement, toute la CI terminée avant la construction des fichiers livrés,
  empreinte de la page dans les notes de version.
- **Notes de version en français** (`docs/notes-de-version/0.9.0.md`), écrites pour les joueurs : ce qu'est
  l'entraîneur, son statut de préversion (les menus fidèles au jeu arrivent en 1.0), quel fichier prendre,
  l'avertissement SmartScreen et le Contrôle intelligent des applications avec la version navigateur en solution de
  repli, la vérification des empreintes SHA-256 et des attestations. Le workflow de publication refuse une version
  sans elles ; il y ajoute l'empreinte de la page et la section de ce journal. Une version 0.x est publiée en
  **préversion** (brouillon marqué _pre-release_).
- **Tests dans le navigateur de la CI bornés dans le temps.** En rendu logiciel (WARP), une page met environ une
  minute à démarrer et chaque image environ une seconde : les tests qui rendent des centaines à des milliers d'images
  (marqués `@gpu` : vol libre, modes, cartes, loi de la souris, cadence des images, politique de sécurité sur chaque
  écran) ne pouvaient pas finir, et le travail `browser` dépassait son délai. La CI lance désormais les autres
  (`npm run test:browser:ci` : page et politique de sécurité, WebGL2, capture simulée, parité G5, profils enregistrés,
  export et import, garde de fermeture), en deux parties d'environ quatre tests, avec 15 minutes au plus par test et
  50 par partie ; le travail de nuit sous Linux (SwiftShader, mesuré : 10 minutes pour les huit tests avec 4
  processeurs, 5 pour le plus long) a 20 minutes par test et 60 en tout. Chaque test vérifie en plus qu'aucune règle de
  la politique de sécurité n'a été enfreinte. Tous les tests, marqués ou non, restent lancés par `npm run test:browser`
  sur une carte graphique avant chaque version (`docs/PUBLIER-UNE-VERSION.md`).
- Travail `golden-update` : une modification des goldens exige la ligne `Golden-Update: <raison>` dans la description
  de la pull request et une entrée dans ce journal ; un changement de l'enregistreur seul est reprouvé neutre.
- Scanner de confidentialité, historique : seulement ce que `HEAD` atteint (dans une pull request, le commit de fusion
  d'essai de GitHub, pas les autres branches que la CI récupère), ou les révisions et étiquettes envoyées (`--rev`,
  crochet `pre-push`, qui ne vérifie rien pour un envoi fait seulement de suppressions) ; `--all-refs` pour tout, chaque
  semaine dans `maintenance.yml`. Les robots Dependabot et GitHub Actions sont admis sous leur nom et leur adresse
  « noreply » exacts, et les messages de commit peuvent citer l'adresse « noreply » de GitHub (aussi comme texte d'un
  lien Markdown) et la signature de Dependabot ; toute autre adresse reste refusée.
- Scanner de confidentialité, identités : le champ d'adresse doit être tout entier une adresse « noreply » (avant, il
  suffisait qu'il se termine par le domaine « noreply ») et le nom ne doit contenir aucune adresse
  (`identity-name-email`) ; un domaine admis ne couvre plus que les hôtes placés juste sous lui, pas un autre domaine
  écrit devant lui.
- `ci.yml` tourne aussi sur les branches `ci/**` poussées par un mainteneur, pour éprouver une branche sous Linux et
  sous Windows avant sa pull request ; `golden-update` la juge alors contre `main`, la ligne `Golden-Update:` étant lue
  dans ses messages de commit (un envoi sur `main` est jugé de même sur tous les commits envoyés), et son résultat
  d'ensemble s'y appelle `ci-ok (ci branch)`, pour ne jamais tenir lieu de la vérification requise d'une pull request.
- Contrôle des scripts d'installation : un paquet revu qu'une mise à jour retire du fichier de verrouillage ne fait
  plus échouer la CI (avertissement, et `--prune` pour le retirer de la liste) ; un paquet nouveau ou une version
  nouvelle qui déclare un script d'installation échoue toujours jusqu'à sa relecture, et la version revue reste listée
  jusque-là.
- Contrôle des scripts d'installation, identité d'un paquet : son vrai nom (celui d'un alias compris) et sa version ; il
  doit venir de l'archive du registre npm pour ce nom et cette version, sinon (autre hôte, git, dossier local) la CI
  échoue.
- Outils sans dépendance : zip déterministe, sommes SHA-256, notes de version, SBOM CycloneDX, contrôle des scripts
  d'installation, réglages GitHub en code (`scripts/github-settings.mjs`), vérifications de l'application et des
  fichiers livrés. Le scanner de confidentialité analyse aussi les fichiers livrés (`--shipped`).
- Documentation : `docs/INSTALLATION.md` (application Windows), `docs/VERIFIER-UN-TELECHARGEMENT.md`,
  `docs/PUBLIER-UNE-VERSION.md`, `docs/SECURITE-CONCEPTION.md`.

### Interface

- Identité visuelle propre (R3) : couleurs, arrondis et police définis par des jetons CSS, surfaces ardoise et accent
  cyan, coins arrondis de 6 px, polices du système, logo de l'entraîneur. Le HUD de vol ne change pas.
- Le logo du menu est le Little Bird de l'icône, d'une seule couleur, la verrière ouverte sur le fond du bandeau
  (`logoSvg()` de `scripts/make-icon.mjs` ; les tests vérifient que la page contient exactement ce dessin). Aucun
  golden ne change : seule l'empreinte du modèle de page que les goldens nomment (`meta.json`, `srcManifest`) est mise
  à jour.

### Construction et sécurité

- Page autonome construite sans dépendance (`npm run build`) avec une politique de sécurité du contenu à empreintes :
  seuls les 13 scripts et la feuille de style de la page sont autorisés, tout le reste est fermé (R4).
  `npm run verify:build` vérifie la politique exacte, les empreintes, l'absence de référence externe, three.js épinglé
  et la reproductibilité.
- La page simule la capture de la souris quand elle est pilotée par un outil d'automatisation ; la construction refuse
  un `app.js` sans cette simulation.
- Alertes CodeQL corrigées avant la première version. La vérification de la page, ses tests et l'enregistreur des
  goldens lisent les blocs `<script>` et `<style>` sous toutes leurs formes (toute casse, attributs, balise de fin
  suivie d'un espace ou d'une barre oblique), et la vérification refuse le balisage autour duquel le HTML les
  délimiterait autrement (commentaire, guillemet laissé ouvert dans une balise, bloc dans un titre ou dans du SVG…) :
  `verify-build` refuse une page où un bloc a été ajouté ou caché, même sans la comparer à une reconstruction. Le
  rapport de l'auto-test de l'application est un fichier nouveau, jamais écrit à travers un fichier ou un lien
  existant, dans un dossier temporaire de l'utilisateur qui ne peut pas être un lien. Les notes de version cherchent
  la version dans ce journal telle quelle. La page livrée et les données des goldens ne changent pas.

### Tests et outils

- Goldens bit à bit de l'entraîneur (vol, sessions, monde, son, HUD, réglages, modèles, interface, modules, API de
  test) et leur porte ; identité des arbres syntaxiques (G1) ; contrôles de fidélité F01 à F37 ; tests d'import
  hostile ; tests dans Chrome sans fenêtre, avec la capture simulée et vérifiée avant chaque départ.
- Scanner de confidentialité (`scripts/privacy-scan.mjs`) sur les fichiers, l'historique (chaque chemin de chaque
  arbre, étiquettes annotées) et les identités de commit, lancé par les crochets Git ; texte lu aussi décodé, termes
  privés cherchés en hexadécimal et en base64, identité de GitHub admise comme « committer » seulement ; les règles
  propres au mainteneur sont hors du dépôt.

### Documentation

- README, installation, réglages et sources, méthode de mesure de la fidélité, analyses réécrites (`docs/`), licence
  MIT, composants tiers, politique de sécurité, guide de contribution.
