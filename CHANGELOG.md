# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Chaque changement de comportement est
déclaré ici, dans un commit à lui seul, avec la preuve que les goldens ne changent que là où il le dit (trailer
`Golden-Update:` du commit, voir `CONTRIBUTING.md`).

## [0.9.0] — non publiée

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

### Application Windows

- **Nouvelle application Windows** (P5), sur Electron 44.4.5 (Chromium 152) : la même page, dans une fenêtre sans
  Node.js, servie depuis l'origine `app://littlebird`. Installateur en un clic pour l'utilisateur courant, sans droits
  administrateur, avec raccourcis Bureau et menu Démarrer (`LittleBird-Trainer-Setup-0.9.0.exe`), et zip portable
  (`LittleBird-Trainer-0.9.0-win-x64.zip`). La désinstallation garde le profil (`%APPDATA%\LittleBird Trainer`).
  F11 : plein écran ; pas de barre de menus (Alt reste le regard libre). Non signée.
- Sécurité : aucun réseau, aucune navigation vers l'extérieur ni fenêtre surgissante, deux permissions seulement
  (verrouillage du pointeur, plein écran), export du profil par la boîte « Enregistrer sous », démarrage refusé sans
  politique de sécurité stricte dans la page ou avec un commutateur de débogage, fusibles d'Electron (pas de mode
  Node.js, `app.asar` vérifié au démarrage), aucune mise à jour automatique. Règles testées sans Electron
  (`desktop/policy.cjs`).
- Auto-test intégré (`--lb-self-test`, avec la variable d'environnement `LB_SELF_TEST` égale au nonce) : page,
  capture simulée vérifiée avant « Démarrer » et encore juste avant le clic, calcul du vol comparé à la référence
  (G5), session, export, et refus du réseau, des fenêtres, de la navigation, des scripts injectés et des
  téléchargements non prévus ; fenêtre qui ne prend ni le focus ni la souris, permissions toutes refusées.
- Défense en profondeur : politique de sécurité de la page vérifiée sur une liste exacte au démarrage, WebRTC limité
  au mandataire (aucun n'est configuré), commutateurs refusés étendus (commandes lancées devant un processus de
  Chromium, fonctionnalités, journaux, profil ailleurs).
- Icône propre, dessinée par le code (`scripts/make-icon.mjs`, `build/icon.svg`).
- Aucun changement de comportement du vol ni du jeu : la page livrée est octet pour octet celle de la version
  navigateur ; les goldens sont inchangés. Mesure (G5) : le moteur de Chromium (Electron 44.4.5, Chrome 154) arrondit
  certaines fonctions mathématiques autrement que Node.js 24 au dernier chiffre binaire ; le vol calculé reste à
  1,3 × 10⁻¹² m du golden sur 60 s, et l'application calcule exactement comme Chrome (`docs/FIDELITE.md`).

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

### Construction et sécurité

- Page autonome construite sans dépendance (`npm run build`) avec une politique de sécurité du contenu à empreintes :
  seuls les 13 scripts et la feuille de style de la page sont autorisés, tout le reste est fermé (R4).
  `npm run verify:build` vérifie la politique exacte, les empreintes, l'absence de référence externe, three.js épinglé
  et la reproductibilité.
- La page simule la capture de la souris quand elle est pilotée par un outil d'automatisation ; la construction refuse
  un `app.js` sans cette simulation.

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
