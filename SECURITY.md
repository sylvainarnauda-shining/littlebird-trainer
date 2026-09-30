# Politique de sécurité

## Signaler une vulnérabilité

N'ouvrez pas de ticket public. Utilisez le signalement privé de GitHub : onglet **Security** du dépôt, puis
**Report a vulnerability**. Décrivez le problème, la version ou le commit concerné et, si possible, comment le
reproduire.

- Première réponse sous 7 jours.
- Correctif ou conclusion sous 30 jours.
- Une fois le correctif publié, la faille est décrite dans un avis de sécurité du dépôt, avec votre nom si vous le
  souhaitez.

## Versions suivies

Seule la dernière version publiée (onglet **Releases**) et la branche principale reçoivent des correctifs.

## Ce que fait le programme

- **Aucune connexion réseau.** La page ne télécharge rien, n'envoie rien, ne contient ni télémétrie, ni compte, ni
  mise à jour automatique. Sa politique de sécurité du contenu (CSP, dans la page) n'autorise que ses propres blocs de
  script et de style, identifiés par leur empreinte SHA-256, et ferme tout le reste : réseau, images, polices, médias,
  workers, cadres, objets, formulaires et `<base>`. `npm run verify:build` et les tests vérifient cette politique
  exacte.
- **Données locales uniquement.** Les réglages et les touches restent dans le stockage local du navigateur, sur
  l'ordinateur.
- **Fichiers ouverts.** La page lit seulement les fichiers choisis par l'utilisateur : un profil `.json` exporté par
  l'entraîneur (100 ko au plus), ou le fichier de réglages du jeu d'origine, en lecture seule. Chaque valeur importée
  est vérifiée : nombres finis et bornés, listes fermées pour les choix, clés propres uniquement (`Object.hasOwn`),
  touches uniques. Le texte brut d'un fichier importé n'est jamais conservé.
- **Fichiers créés.** L'export du profil est un téléchargement lancé par l'utilisateur.
- **Aucun lien avec le jeu d'origine.** L'entraîneur ne lit pas les fichiers du jeu de lui-même, n'injecte rien dans
  le jeu et ne le modifie pas. Il ne contient ni code ni ressource du jeu.
- **Capture de la souris.** Elle n'est demandée qu'au clic sur « Démarrer » ; Échap la libère. Quand la page est
  pilotée par un outil d'automatisation (`navigator.webdriver`), elle simule la capture au lieu de la demander au
  système, pour qu'un test ne puisse jamais capturer la souris de la machine.

## Application Windows

- Elle affiche la même page, depuis sa propre origine `app://littlebird`, dans une fenêtre sans Node.js (bac à sable,
  isolation du contexte, aucun script de préchargement, aucune communication avec le processus principal).
- Toute requête réseau de la page est annulée ; la navigation vers l'extérieur, les nouvelles fenêtres et les
  `<webview>` sont refusées ; seules deux permissions existent (verrouillage du pointeur, plein écran). Une seule
  adresse peut être ouverte, dans le navigateur par défaut, au plus une fois toutes les 1,5 s : la page Releases du
  dépôt, lien de l'onglet « À propos » (comparaison exacte de l'adresse).
- Aucune mise à jour automatique, aucun rapport de plantage, aucune télémétrie.
- Les fusibles d'Electron empêchent d'utiliser l'exécutable comme interpréteur Node.js et refusent un `app.asar`
  modifié ; une application empaquetée lancée avec un commutateur de débogage (`--remote-debugging-port`, `--inspect`,
  `--no-sandbox`, etc.) s'arrête aussitôt.
- Les réglages sont dans `%APPDATA%\LittleBird Trainer` ; l'installateur agit pour l'utilisateur courant seulement,
  sans droits administrateur.
- Electron est mis à jour dans les 30 jours d'un correctif de sécurité de Chromium (7 jours pour une faille exploitée).

Détail et vérifications : `docs/SECURITE-CONCEPTION.md`. Vérifier un fichier téléchargé :
`docs/VERIFIER-UN-TELECHARGEMENT.md`.

## Périmètre

Font partie du périmètre : le code de ce dépôt, la page construite (`dist/web/index.html`), l'application Windows
(installateur et zip portable) et les fichiers publiés dans les Releases.

N'en font pas partie : les failles des navigateurs ou du système qui ne dépendent pas de ce programme (signalez-les à
leur éditeur), et le jeu d'origine.

---

## Security policy (English summary)

Do not open a public issue: report vulnerabilities privately through GitHub (**Security** tab, **Report a
vulnerability**). First answer within 7 days, fix or conclusion within 30 days, then a security advisory (with credit
if you wish). Only the latest release and the main branch are supported.

The trainer is an offline page: no network, no telemetry, no account, no auto-update. Its Content-Security-Policy
allows only the page's own inline blocks by SHA-256 and closes everything else; the build verifies the exact policy.
Settings stay in the browser's local storage. Imported files (a profile JSON up to 100 kB, or the game's settings
file, read only) are validated value by value. The pointer is captured only on Start; under automation the page
emulates the lock so that tests never capture the machine's mouse. The Windows app shows the same page from its own
`app://littlebird` origin in a sandboxed, context-isolated window without Node.js, preload or IPC; it cancels every
network request, blocks navigation, pop-ups and webviews, grants only pointer lock and fullscreen, has no auto-update
or crash reporter, and its Electron fuses refuse Node.js modes and a modified `app.asar`. The game itself is out of
scope.
