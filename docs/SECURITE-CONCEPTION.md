# Sécurité : conception

Ce document décrit comment le programme et sa chaîne de publication sont protégés, et où chaque règle est vérifiée.
Pour signaler une faille : [`SECURITY.md`](../SECURITY.md).

## La page

- Une seule page autonome (`dist/web/index.html`), construite sans dépendance par `scripts/build.mjs`, non minifiée.
- Politique de sécurité du contenu (CSP) à empreintes : seuls ses 13 scripts et sa feuille de style, identifiés par
  leur SHA-256, sont autorisés ; réseau, images, polices, médias, workers, cadres, objets, formulaires et `<base>` sont
  fermés. `scripts/verify-build.mjs` vérifie la chaîne exacte ; la construction est reproductible.
- Aucun code réseau, aucun `eval`. Les fichiers importés (profil, réglages du jeu) sont vérifiés valeur par valeur.
- Sous automatisation (`navigator.webdriver`), la page simule la capture de la souris : un test ne capture jamais la
  souris de la machine. `scripts/build.mjs` refuse un `app.js` sans cette simulation (vérifiée dans le code lui-même,
  hors commentaires et chaînes, quand `acorn`, dépendance de développement, est installé).

## L'application Windows

Electron 44.4.5 (Chromium 152), épinglé. Le processus principal (`desktop/main.cjs`) ne fait que brancher des règles
pures, testées sans Electron (`desktop/policy.cjs`, `tests/desktop/policy.test.js`) :

| Règle                                                                                                                                                                                                 | Où                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Page sans Node.js : `sandbox`, `contextIsolation`, `nodeIntegration` désactivé, pas de script de préchargement, pas d'IPC                                                                             | `windowOptions`                             |
| Une seule origine, `app://littlebird`, qui ne sert que la page (et sa CSP en en-tête, avec `frame-ancestors 'none'`)                                                                                  | `pageFor`, `responseHeaders`, `cspFromPage` |
| Démarrage refusé si la CSP de la page sort d'une liste exacte : directives connues et uniques, scripts et styles par empreinte seulement, tout le reste `'none'`                                      | `cspFromPage`                               |
| Toute requête qui n'est pas l'application est annulée (aucun réseau) ; WebRTC limité au mandataire (aucun configuré)                                                                                  | `requestAllowed`, `main.cjs`                |
| Navigation vers l'extérieur, nouvelles fenêtres et `<webview>` refusées                                                                                                                               | `isAppUrl`, `externalAllowed`               |
| Permissions : seulement le verrouillage du pointeur et le plein écran, depuis l'application                                                                                                           | `permissionAllowed`                         |
| Téléchargements : seulement l'export du profil (`little-bird-*.json`), par la boîte « Enregistrer sous »                                                                                              | `downloadAllowed`                           |
| Commutateurs refusés (sortie immédiate) : débogage, commandes lancées devant un processus de Chromium (`--gpu-launcher`…), bac à sable, fonctionnalités, journaux et profil ailleurs, réseau redirigé | `refusedSwitch`                             |
| Auto-test seulement avec `--lb-self-test=<nonce>` **et** la variable d'environnement `LB_SELF_TEST` égale au nonce                                                                                    | `selfTestArgs`                              |
| Pas de barre de menus (Alt reste la touche du regard libre), pas d'outils de développement une fois empaqueté ; la fenêtre se ferme sans demande de confirmation de la page                           | `main.cjs`                                  |

**Fusibles d'Electron** (écrits dans l'exécutable après l'empaquetage, `build/fuses.cjs`, relus par
`scripts/check-fuses.mjs`) : l'exécutable ne peut pas servir d'interpréteur Node.js (`ELECTRON_RUN_AS_NODE`,
`NODE_OPTIONS` et `--inspect` ignorés), l'application ne se charge que depuis `app.asar`, dont l'intégrité est vérifiée
au démarrage, et `file://` n'a aucun privilège particulier.

**Contenu** : `app.asar` ne contient que la page, les quatre fichiers de `desktop/` et `package.json`
(`scripts/check-asar.mjs`) ; les fichiers d'Electron sont ceux de sa version officielle, vérifiés octet pour octet
contre l'archive publiée et son empreinte (`scripts/check-electron-runtime.mjs`).

**Auto-test** (`--lb-self-test=<nonce>`, `desktop/self-test.cjs`, lancé par `scripts/desktop-smoke.mjs`) : sur les
fichiers livrés, la page se charge et dessine, la capture de la souris est simulée (vérifié avant de cliquer sur
Démarrer), le calcul du vol est celui de la référence (porte G5, voir [`FIDELITE.md`](FIDELITE.md)), une session vole,
l'export du profil fonctionne ; et la page n'a ni Node.js ni crochet de test, le réseau, les fenêtres surgissantes, la
navigation, un script injecté, `eval` et un téléchargement autre que l'export sont refusés. Pendant l'auto-test, la
fenêtre ne peut pas prendre le focus, laisse passer la souris, et toutes les permissions sont refusées ; le profil est
un dossier temporaire. Une copie dont `app.asar` a été modifiée d'un octet ne démarre pas.

**Installateur** : NSIS en un clic, pour l'utilisateur courant, sans élévation ; aucune mise à jour automatique ;
exécutables non signés (voir [`INSTALLATION.md`](INSTALLATION.md)).

## Le dépôt et la chaîne de publication

- Liste d'autorisation des fichiers (`.gitignore` et `publish-policy.json`) et scanner de confidentialité
  (`scripts/privacy-scan.mjs`) sur les fichiers, tout l'historique (chaque chemin de chaque arbre, messages, étiquettes
  annotées), les identités de commit et les fichiers livrés ; le texte est aussi lu décodé (Unicode normalisé,
  caractères invisibles retirés, `%XX` et références HTML décodés) et les termes privés sont cherchés en hexadécimal et
  en base64. Les termes privés et l'organisation des dossiers du mainteneur ne sont pas dans le dépôt : fichier non
  versionné et secret `PUBLISH_DENYLIST`, jamais affichés, même quand une ligne est mal formée. Seule l'identité de
  GitHub lui-même (fusions, modifications en ligne, Dependabot) est admise comme « committer » en plus des adresses
  « noreply ».
- Goldens : le travail `golden-update` de la CI refuse une modification des goldens sans la ligne
  `Golden-Update: <raison>` dans la description de la pull request et sans entrée dans `CHANGELOG.md`, et refait la
  preuve de neutralité d'un changement de l'enregistreur seul.
- Dépendances à versions exactes, `npm ci`, aucun script d'installation exécuté (`.npmrc`), liste revue des paquets qui
  en déclarent (`scripts/check-install-scripts.mjs`), signatures du registre vérifiées, audit.
- Workflows : jeton en lecture seule par défaut, seulement des actions de GitHub épinglées par empreinte de commit,
  aucun identifiant conservé, aucun cache, pas de `pull_request_target`, aucune expression dans un script
  (`tests/build/workflows.test.js`, et `actionlint`). Une seule vérification requise, `ci-ok`.
- Publication : seul un administrateur pousse une étiquette `v*` ; toute la CI (sans travail consultatif) se termine
  avant que les fichiers livrés soient construits, donc aucun outil de lint ou de test ne tourne à côté d'eux ; le
  travail qui produit les fichiers n'a aucun secret et aucun cache, et donne leurs empreintes SHA-256 par ses sorties ;
  la vérification et la publication ne téléchargent que les artefacts nommés et exigent ces empreintes (pas un fichier
  de sommes du même artefact) ; le travail qui publie n'exécute aucun code du projet, signe les attestations de
  provenance et de composants, et crée seulement un **brouillon** que le mainteneur approuve puis publie ; les versions
  publiées sont immuables.
- Analyse CodeQL du code et des workflows ; Dependabot chaque semaine ; `maintenance.yml` surveille le suivi d'Electron.
