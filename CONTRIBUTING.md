# Contribuer

Merci de votre intérêt. Ce projet vise un entraîneur **fidèle au jeu mesuré** : chaque changement de comportement doit
être déclaré et prouvé, et rien de privé ni de protégé ne doit entrer dans le dépôt. Ce document dit comment.

## Préparer l'environnement

- Node.js **24.19.0**, la version exacte de `.nvmrc` (par exemple `nvm install 24.19.0` puis `nvm use 24.19.0`, ou
  `fnm use`), et Git. Toute version 24 (au moins 24.11, `package.json`) construit la page, mais les goldens sont
  exacts au bit près sur la version qui les a enregistrés : sur une autre version, `npm test` échoue exprès avec ce
  message. `LB_GOLDEN_ANY_NODE=1 npm test` lance quand même les goldens, pour regarder les différences.
- `npm ci` installe les outils de développement, à versions exactes (`package-lock.json`).
- `git config core.hooksPath .githooks` active les deux crochets du dépôt : le scanner de confidentialité avant chaque
  commit (`--staged`) et, avant chaque envoi, sur tout l'arbre et tout l'historique (`--strict`). Ne les contournez
  jamais (`--no-verify` est interdit dans ce dépôt) : tout ce qui est poussé est public aussitôt, et la CI ne voit un
  envoi qu'une fois publié.
- Pour les tests dans le navigateur : Chrome installé (canal `chrome` de Playwright), ou
  `npx playwright install chromium` puis `LB_BROWSER_CHANNEL=` (vide) pour le Chromium de Playwright.

## Vérifier

| Commande                   | Ce qu'elle fait                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm run verify`           | scanner de confidentialité, ESLint, Prettier, construction, `verify:build`, tous les tests Node          |
| `npm run build`            | construit `dist/web/index.html` (une page autonome) et `dist/web/csp.txt`                                |
| `npm run verify:build`     | politique CSP exacte, blocs hachés, aucune référence externe, construction reproductible                 |
| `npm test`                 | tests unitaires, de fidélité, de non-régression (goldens), d'intégration, de construction et de sécurité |
| `npm run test:browser`     | construit la page, puis la teste dans Chrome, sans fenêtre (voir la règle de sécurité ci-dessous)        |
| `npm run test:golden:gate` | la porte complète des goldens (trois enregistrements, déterminisme, test de mutation)                    |
| `npm run test:perf`        | images par seconde sur la machine locale (mesurées, imposées seulement avec `LB_PERF=1`)                 |
| `npm run dist:dir`         | l'application Windows non installée dans `release/win-unpacked/` (Windows)                               |
| `npm run dist`             | l'installateur et le zip portable dans `release/` (Windows)                                              |
| `npm run desktop:check`    | fusibles, contenu de `app.asar`, fichiers d'Electron officiels, auto-test de l'application empaquetée    |
| `npm run release:check`    | zip portable et installateur de `release/` : contenu, auto-tests, installation et désinstallation        |
| `npm run test:desktop`     | les règles de sécurité de l'application et la porte G5 dans Node (sans Electron)                         |

## Règle de sécurité des tests dans le navigateur

Un test ne doit **jamais** capturer la souris ou le clavier de la machine qui le lance.

- Les configurations Playwright sont sans fenêtre (`headless: true`), un seul worker, sans nouvel essai.
- Chaque spec prend `test` dans `tests/browser/fixtures.mjs`. Ce fichier remplace, avant tout script de la page, les
  vraies API de capture (verrouillage du pointeur, plein écran, verrouillage du clavier) par des pièges qui comptent
  les appels, et vérifie que la page simule elle-même le verrouillage (`window.__LB_EMULATED_POINTER_LOCK__` sous
  `navigator.webdriver`) avant tout clic sur « Démarrer » (fonction `start()`).
- `scripts/build.mjs` refuse de construire une page dont `app.js` n'a plus cette simulation.
- Aucun test ne demande le plein écran, le vrai verrouillage ou le verrouillage du clavier ;
  `tests/build/browser-safety.test.js` le vérifie.

La même règle vaut pour l'application Windows. Elle n'est jamais pilotée de l'extérieur (Playwright ne peut pas
s'y attacher : ses fusibles refusent `--inspect` et son code refuse les ports de débogage). Elle se teste par son
auto-test (`--lb-self-test=<nonce>` avec la variable d'environnement `LB_SELF_TEST=<nonce>`, posés tous deux par
`scripts/desktop-smoke.mjs`) : mode automatisation déclaré à Chromium, simulation de la capture vérifiée avant de
cliquer sur « Démarrer » et encore juste avant le clic, toutes les permissions refusées (la capture et le plein écran
sont donc impossibles), fenêtre qui ne peut pas prendre le focus et laisse passer la souris, profil temporaire. Aucun
test ne lance l'application sans son auto-test ; `tests/desktop/self-test-safety.test.js` vérifie cet ordre.

Sous Windows 11, le **Contrôle intelligent des applications**, s'il est activé, peut refuser de lancer un exécutable
non signé que l'on vient de construire (`spawn UNKNOWN`) : les vérifications qui lancent l'application empaquetée
tournent alors seulement dans la CI (GitHub Actions). Ne le désactivez pas pour cela.

## Vérifier les workflows

`tests/build/workflows.test.js` vérifie les règles d'hygiène des workflows (jeton fermé, actions épinglées, pas
d'expression dans un script…). Avant de pousser une modification d'un workflow, passez aussi `actionlint` (version
publiée de https://github.com/rhysd/actionlint, empreinte vérifiée avec le fichier `checksums.txt` de la version) :
`actionlint .github/workflows/*.yml`.

## Changer le comportement

Le comportement de l'entraîneur est figé par les goldens (`tests/fixtures/golden/`, outil `tools/golden/`) et par les
contrôles de fidélité (`tests/fidelity/`, index `tests/fidelity/INDEX.json`).

- **Un refactor ou un changement de commentaire** ne change aucun golden : `npm test` doit rester vert sans rien
  réenregistrer. La porte G1 compare les arbres syntaxiques : `node scripts/ast-identity.mjs --ref HEAD`.
- **Un changement de texte de l'interface** (étape de formulation) ne change aucun nombre, mais il change les
  empreintes des textes que les goldens gardent (textes du HUD et de l'interface, noms, avis). On le prouve ainsi :
  `node scripts/ast-identity.mjs --ref HEAD --mask-strings` (seules des chaînes changent),
  `node scripts/golden.mjs check --wording-step` (seuls les groupes de textes diffèrent, tous les groupes de nombres
  restent identiques), la liste des textes modifiés relue, puis `node scripts/golden.mjs update --reason "<raison>"`,
  une entrée dans `CHANGELOG.md` et la ligne `Golden-Update: <raison>` (voir ci-dessous). Les textes vérifiés par les
  tests sont dans `tests/helpers/ui-text.js`.
- **Un changement de comportement** est déclaré : une pull request à lui seul, une entrée dans `CHANGELOG.md`
  (section « Comportement »), une preuve que la différence des goldens se limite à ce qui est déclaré
  (`node scripts/golden.mjs check --report <fichier>`), puis `node scripts/golden.mjs update --reason "<raison>"`.
- **La ligne `Golden-Update: <raison>`** va dans la description de la pull request : la fusion par écrasement
  (« squash ») la recopie dans le message du commit de `main`. Le travail `golden-update` de la CI refuse toute
  modification des goldens sans cette ligne et sans entrée dans `CHANGELOG.md`. On ne régénère jamais les goldens pour
  faire passer un refactor.
- **Un changement de l'enregistreur** (`tools/golden/`) est prouvé neutre : `node scripts/golden.mjs prove`, puis
  `--adopt` ; la CI refait la preuve.
- Les bandes de fidélité ne sont jamais élargies pour faire passer un changement.

## Constantes et sources

Chaque constante qui décrit le jeu dit d'où elle vient, dans un commentaire en anglais :

- **measured** : mesurée sur les enregistrements de référence (voir `docs/FIDELITE.md`) ;
- **read** : lue dans un guide ou une base communautaire, non vérifiée en jeu (ajoutez la source à `docs/SOURCES.md`) ;
- **assumed** : supposée, faute de mesure ;
- **chosen** : choisie pour l'entraînement ou la jouabilité.

## Langues

- Interface et documentation : en français.
- Code, commentaires et messages de commit : en anglais.

## Ce qui ne doit jamais entrer dans le dépôt

- Images, vidéos, sons ou extraits du jeu ; ses modèles, textures, polices, logos ou longs textes.
- Enregistrements de parties, noms de fichiers d'enregistrement, captures d'écran du jeu.
- Contenu d'un fichier de réglages réel, chemins absolus, noms d'utilisateur, adresses e-mail autres que les adresses
  « noreply » de GitHub, détails de matériel.
- Les noms inventés par le jeu que l'entraîneur a remplacés par des noms neutres (factions, noms d'emplacements, écran
  de ravitaillement, ambiances de lumière) : le scanner les refuse.

Le dépôt fonctionne par liste d'autorisation (`.gitignore` et `allowedPaths` de `publish-policy.json`) : un nouveau
fichier à la racine s'ajoute aux deux, volontairement. `npm run scan` lance le scanner ; ses règles génériques sont
dans `publish-policy.json`, les termes privés du mainteneur dans un fichier non versionné (`.publish-denylist`) et dans
le secret `PUBLISH_DENYLIST` de la CI. Le scanner n'affiche jamais le texte trouvé, seulement la règle, le fichier et
la ligne.

## Proposer une modification

1. Une branche, des commits petits et ciblés, en anglais, avec votre adresse « noreply » de GitHub comme auteur (le
   scanner refuse toute autre adresse dans l'historique).
2. `npm run verify` et, si la page change, `npm run test:browser`.
3. Une pull request qui dit ce qui change, pourquoi, et comment c'est prouvé (avec la ligne `Golden-Update:` si les
   goldens changent). Elle est fusionnée par écrasement quand la vérification `ci-ok` est verte.

Pour une faille de sécurité, suivez `SECURITY.md` (signalement privé), pas un ticket public.
