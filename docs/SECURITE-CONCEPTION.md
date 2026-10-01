# Sécurité : conception

Ce document décrit comment le programme et sa chaîne de publication sont protégés, et où chaque règle est vérifiée.
Pour signaler une faille : [`SECURITY.md`](../SECURITY.md).

## La page

- Une seule page autonome (`dist/web/index.html`), construite sans dépendance par `scripts/build.mjs`, non minifiée.
- Politique de sécurité du contenu (CSP) à empreintes : seuls ses 13 scripts et sa feuille de style, identifiés par
  leur SHA-256, sont autorisés ; réseau, images, polices, médias, workers, cadres, objets, formulaires et `<base>` sont
  fermés. `scripts/verify-build.mjs` vérifie la chaîne exacte, et refuse le balisage autour duquel le HTML
  délimiterait les blocs autrement que cette vérification (commentaire, guillemet laissé ouvert, bloc dans un titre
  ou du SVG) ; la construction est reproductible.
- Aucun code réseau, aucun `eval`. Les fichiers importés (profil, réglages du jeu) sont vérifiés valeur par valeur.
- Sous automatisation (`navigator.webdriver`), la page simule la capture de la souris : un test ne capture jamais la
  souris de la machine. `scripts/build.mjs` refuse un `app.js` sans cette simulation (vérifiée dans le code lui-même,
  hors commentaires et chaînes, quand `acorn`, dépendance de développement, est installé).
- Joysticks : la page ne les lit que sur demande (bouton « Lire les manettes », ou en vol avec le HOTAS activé), en un
  seul endroit du code. Sous automatisation, `navigator.getGamepads` est remplacé par une simulation qui ne rend que les
  manettes qu'un test y met : aucun test ne lit les manettes de la machine (les specs du navigateur piègent en plus la
  vraie fonction et vérifient qu'elle n'est jamais appelée, `tests/build/browser-safety.test.js`). Pas de WebHID, de
  WebUSB, de Web Serial ni de vibration. Le golden des joysticks (`tests/fixtures/golden/joystick.json`) le vérifie
  aussi : une page sous automatisation dont la vraie fonction rendrait une manette ne l'appelle jamais, et avec le HOTAS
  désactivé la page ne lit aucune manette, menu compris. L'auto-test de l'application Windows vérifie, avant de cliquer
  sur « Démarrer », que `getGamepads` est la simulation (sans l'appeler) et que la politique de la page refuse l'API
  des manettes (`document.featurePolicy` doit répondre non ; s'il ne répond pas, l'auto-test s'arrête aussi).

## L'application Windows

Electron 44.5.1 (Chromium 152), épinglé. Le processus principal (`desktop/main.cjs`) ne fait que brancher des règles
pures, testées sans Electron (`desktop/policy.cjs`, `tests/desktop/policy.test.js`) :

| Règle                                                                                                                                                                                                   | Où                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Page sans Node.js : `sandbox`, `contextIsolation`, `nodeIntegration` désactivé, pas de script de préchargement, pas d'IPC                                                                               | `windowOptions`                             |
| Une seule origine, `app://littlebird`, qui ne sert que la page (et sa CSP en en-tête, avec `frame-ancestors 'none'`)                                                                                    | `pageFor`, `responseHeaders`, `cspFromPage` |
| Démarrage refusé si la CSP de la page sort d'une liste exacte : directives connues et uniques, scripts et styles par empreinte seulement, tout le reste `'none'`                                        | `cspFromPage`                               |
| Toute requête qui n'est pas l'application est annulée (aucun réseau) ; WebRTC limité au mandataire (aucun configuré)                                                                                    | `requestAllowed`, `main.cjs`                |
| Navigation vers l'extérieur, nouvelles fenêtres et `<webview>` refusées ; seule l'adresse exacte de la page Releases (lien « À propos ») va au navigateur par défaut, jamais en auto-test               | `isAppUrl`, `externalAllowed`               |
| Permissions : seulement le verrouillage du pointeur et le plein écran, depuis l'application                                                                                                             | `permissionAllowed`                         |
| Politique de permissions de la page : caméra, micro, HID, USB, port série, Bluetooth… fermés ; joysticks `gamepad=(self)`, et `gamepad=()` pendant l'auto-test (les manettes de la machine jamais lues) | `responseHeaders`                           |
| Téléchargements : seulement l'export du profil (`little-bird-*.json`), par la boîte « Enregistrer sous »                                                                                                | `downloadAllowed`                           |
| Commutateurs refusés (sortie immédiate) : débogage, commandes lancées devant un processus de Chromium (`--gpu-launcher`…), bac à sable, fonctionnalités, journaux et profil ailleurs, réseau redirigé   | `refusedSwitch`                             |
| Auto-test seulement avec `--lb-self-test=<nonce>` **et** la variable d'environnement `LB_SELF_TEST` égale au nonce                                                                                      | `selfTestArgs`                              |
| Pas de barre de menus (Alt reste la touche du regard libre), pas d'outils de développement une fois empaqueté ; la fenêtre se ferme sans demande de confirmation de la page                             | `main.cjs`                                  |

**Fusibles d'Electron** (écrits dans l'exécutable après l'empaquetage, `build/fuses.cjs`, relus par
`scripts/check-fuses.mjs`) : l'exécutable ne peut pas servir d'interpréteur Node.js (`ELECTRON_RUN_AS_NODE`,
`NODE_OPTIONS` et `--inspect` ignorés), l'application ne se charge que depuis `app.asar`, dont l'intégrité est vérifiée
au démarrage, et `file://` n'a aucun privilège particulier.

**Contenu** : `app.asar` ne contient que la page, les quatre fichiers de `desktop/` et `package.json`
(`scripts/check-asar.mjs`) ; les fichiers d'Electron sont ceux de sa version officielle, vérifiés octet pour octet
contre l'archive publiée et son empreinte (`scripts/check-electron-runtime.mjs`).

**Auto-test** (`--lb-self-test=<nonce>`, `desktop/self-test.cjs`, lancé par `scripts/desktop-smoke.mjs`) : sur les
fichiers livrés, la page se charge et dessine, la capture de la souris est simulée (vérifié avant de cliquer sur
Démarrer), le calcul du vol est celui de la référence (porte G5, voir [`FIDELITE.md`](FIDELITE.md)), une session vole
(2 s simulées sur au moins 20 images qui font avancer le vol et dessinent la scène, quelle que soit la vitesse de la
machine), l'export du profil fonctionne ; et la page n'a ni Node.js ni crochet de test, le réseau, les fenêtres
surgissantes, la navigation (la tentative est vue par l'application, puis refusée), un script injecté, `eval` et un
téléchargement autre que l'export sont refusés ; chaque refus est jugé sur sa preuve, pas après un délai fixe. Pendant
l'auto-test, la fenêtre ne peut pas prendre le focus, laisse passer la souris, et toutes les permissions sont refusées ;
le profil est un dossier temporaire, et le rapport un fichier nouveau, jamais écrit à travers un fichier ou un lien
existant, dans un dossier temporaire de l'utilisateur qui ne peut pas être un lien. Une copie dont `app.asar` a été
modifiée d'un octet ne démarre pas.

**Installateur** : NSIS en un clic, pour l'utilisateur courant, sans élévation ; aucune mise à jour automatique ;
exécutables non signés (voir [`INSTALLATION.md`](INSTALLATION.md)).

## Le dépôt et la chaîne de publication

- Liste d'autorisation des fichiers (`.gitignore` et `publish-policy.json`) et scanner de confidentialité
  (`scripts/privacy-scan.mjs`) sur les fichiers, tout l'historique de ce qui est publié (chaque chemin de chaque arbre,
  messages, étiquettes annotées : ce que `HEAD` atteint dans la CI, le commit de fusion d'essai pour une pull request ;
  chaque révision et chaque étiquette envoyées pour le crochet `pre-push` ; chaque semaine, toutes les branches et
  étiquettes du dépôt avec la liste privée du moment, dans `maintenance.yml`), les identités de commit et les fichiers
  livrés ; le texte est aussi lu décodé (Unicode normalisé, caractères invisibles retirés, `%XX` et références HTML
  décodés) et les termes privés sont cherchés en hexadécimal et en base64. Les termes privés et l'organisation des
  dossiers du mainteneur ne sont pas dans le dépôt : fichier non versionné et secret `PUBLISH_DENYLIST`, jamais
  affichés, même quand une ligne est mal formée. En plus des adresses « noreply », seules sont admises l'identité de
  GitHub lui-même comme « committer » (fusions, modifications en ligne, Dependabot) et, sous leur nom et leur adresse
  « noreply » exacts, les robots Dependabot et GitHub Actions ; dans les messages de commit, l'adresse « noreply » de
  GitHub et la ligne de signature de Dependabot. Toute autre adresse, par exemple celle d'une personne dans le commit
  de fusion d'essai d'une pull request, fait échouer la CI. Le champ d'adresse d'une identité doit être tout entier une
  adresse « noreply », et son nom ne doit contenir aucune adresse ; un domaine admis couvre les hôtes placés juste sous
  lui, pas un autre domaine écrit devant lui. Une adresse volontairement déguisée (« nom [at] domaine ») n'est pas
  cherchée : le scanner vise les fuites accidentelles.
- Goldens : le travail `golden-update` de la CI refuse une modification des goldens sans la ligne
  `Golden-Update: <raison>` dans la description de la pull request (dans les messages de commit pour une branche
  `ci/**`) et sans entrée dans `CHANGELOG.md`, et refait la preuve de neutralité d'un changement de l'enregistreur seul.
- Dépendances à versions exactes, `npm ci`, aucun script d'installation exécuté (`.npmrc`), liste revue des paquets qui
  en déclarent (`scripts/check-install-scripts.mjs`, `nom@version`) : un nouveau paquet ou une nouvelle version fait
  échouer la CI jusqu'à sa relecture ; une entrée qu'une mise à jour a retirée du fichier de verrouillage est seulement
  signalée, et `node scripts/check-install-scripts.mjs --prune` la retire de la liste. Un paquet y est identifié par
  son vrai nom (celui d'un alias compris) et doit venir de l'archive du registre npm pour ce nom et cette version, que
  le registre ne republie jamais ; un paquet à script d'installation venu d'ailleurs fait échouer la CI. Signatures du
  registre vérifiées, audit.
- Workflows : jeton en lecture seule par défaut, seulement des actions de GitHub épinglées par empreinte de commit,
  aucun identifiant conservé, aucun cache, pas de `pull_request_target`, aucune expression dans un script
  (`tests/build/workflows.test.js`, et `actionlint`). Une seule vérification requise, `ci-ok` ; sur une branche
  `ci/**`, le même travail s'appelle `ci-ok (ci branch)` et ne peut donc pas en tenir lieu pour une pull request.
- Publication : seul un administrateur pousse une étiquette `v*` ; toute la CI (sans travail consultatif) se termine
  avant que les fichiers livrés soient construits, donc aucun outil de lint ou de test ne tourne à côté d'eux ; le
  travail qui produit les fichiers n'a aucun secret et aucun cache, et donne leurs empreintes SHA-256 par ses sorties ;
  la vérification et la publication ne téléchargent que les artefacts nommés et exigent ces empreintes (pas un fichier
  de sommes du même artefact) ; le travail qui publie n'exécute aucun code du projet, signe les attestations de
  provenance et de composants, et crée seulement un **brouillon** que le mainteneur approuve puis publie ; les versions
  publiées sont immuables.
- Analyse CodeQL du code et des workflows ; Dependabot chaque semaine ; `maintenance.yml` surveille le suivi d'Electron.
