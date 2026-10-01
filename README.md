# LittleBird Trainer

Entraîneur hors ligne de pilotage et de tir pour hélicoptère léger armé (type AH-6M à miniguns), dans le navigateur.
Son modèle de vol, sa souris, sa caméra, son HUD et ses sons sont calés sur des mesures faites sur deux
enregistrements de parties de WARDOGS, pour s'entraîner à ses sensations sans lancer le jeu.

> **Projet non officiel.** LittleBird Trainer est un entraîneur gratuit, créé par un joueur pour les joueurs. Il n'est
> **ni affilié, ni approuvé, ni soutenu** par les éditeurs ou les développeurs de WARDOGS. WARDOGS et les autres
> marques citées appartiennent à leurs propriétaires respectifs. Le programme ne contient aucun fichier, modèle,
> texture, son, police ou image du jeu : tout est généré par son propre code. Il fonctionne hors ligne, n'envoie aucune
> donnée et ne modifie jamais les fichiers du jeu (l'import des réglages lit seulement le fichier que vous choisissez).

## Ce que c'est

- **Vol** : le modèle v6, identifié sur les enregistrements de référence (roulis, lacet, tangage, collectif assisté,
  vitesse maximale, nez qui suit la trajectoire à vitesse), et la loi de la souris mesurée (la vitesse du geste donne
  la vitesse de rotation). L'ancienne loi « manche virtuel » reste disponible en option.
- **Modes** : stand de tir (air/air, air/sol, mixte), assaut air-sol, défense sol-air (verrouillage, missiles,
  leurres, esquive), partie réelle (tout à la fois, zone chaude, ravitaillement sur l'hélipad), tours, vol libre et
  duel contre un à trois hélicoptères pilotés par des bots qui ont le même modèle de vol que vous.
- **Monde** : la vallée de référence, aux dimensions mesurées, et des vallées générées à la demande (le même numéro
  redonne la même carte, par exemple `#carte=gen-123456`), huit ambiances de lumière de jour.
- **Vues** : vue pilote avec cockpit 3D et viseur reflex, vue poursuite qui s'élargit avec la vitesse comme dans le
  jeu, regard libre.
- **Transparence** : chaque valeur dit si elle est **mesurée**, **lue** dans une source publique, **supposée** ou
  **choisie** (`docs/REGLAGES.md`, `docs/SOURCES.md`, `docs/analyse/`).

## Télécharger et lancer

Sur la page **Releases** du dépôt, chaque version propose :

- **l'application Windows** (10 ou 11, 64 bits) : `LittleBird-Trainer-Setup-X.Y.Z.exe`, installation en un clic pour
  votre compte, sans droits administrateur, avec raccourcis sur le Bureau et dans le menu Démarrer ; ou
  `LittleBird-Trainer-X.Y.Z-win-x64.zip`, la même application sans installation ;
- **la version navigateur** : `LittleBird-Trainer-X.Y.Z-navigateur.zip`, une seule page `index.html` à ouvrir dans
  Chrome ou Edge, sur tout système.

Il faut une carte graphique compatible WebGL 2, une souris et un clavier ; ni compte ni connexion. Les exécutables ne
sont pas signés : Windows affiche d'abord un avertissement SmartScreen (**Informations complémentaires** › **Exécuter
quand même**). Chaque fichier a son empreinte SHA-256 et une attestation de provenance
([`docs/VERIFIER-UN-TELECHARGEMENT.md`](docs/VERIFIER-UN-TELECHARGEMENT.md)).

**Quelle version avez-vous ?** Le numéro complet (par exemple `v0.10.0`) est affiché en haut à droite du menu du jeu,
et dans son onglet **À propos**, avec l'adresse de la page **Releases**. Le jeu ne vérifie pas lui-même s'il en existe
une plus récente (il n'a aucun code réseau et n'envoie rien) : comparez ce numéro avec la dernière version de la page
**Releases**, ou suivez le dépôt sur GitHub (**Watch › Custom › Releases**) pour être prévenu de chaque nouvelle
version. Les fichiers téléchargés portent le numéro dans leur nom ; le raccourci, lui, s'appelle toujours
**LittleBird Trainer**.

Depuis les sources, avec Node.js 24 : `npm ci` puis `npm run build` (la page `dist/web/index.html`) ou `npm run dist`
(l'installateur et le zip portable, sous Windows). Les tests demandent la version exacte de `.nvmrc` (24.19.0), avec
laquelle les goldens ont été enregistrés : voir [`CONTRIBUTING.md`](CONTRIBUTING.md).

Choisissez un mode, puis **Démarrer** : la souris est capturée. **Échap** met en pause, **F11** passe en plein écran.
Détails, profils, mise à jour et désinstallation : [`docs/INSTALLATION.md`](docs/INSTALLATION.md).

## Commandes par défaut

Ce sont les touches par défaut du jeu pour l'hélicoptère, telles que les guides les donnent, plus trois actions propres
à l'entraîneur. Les touches sont reconnues par leur position physique (sur un clavier AZERTY, W est la touche Z et Q
la touche A). Tout se réassigne dans l'onglet Commandes.

| Action                               | Touche                                                         |
| ------------------------------------ | -------------------------------------------------------------- |
| Collectif + / −                      | Maj gauche / Ctrl gauche (maintien automatique au relâchement) |
| Piquer / cabrer                      | W / S                                                          |
| Roulis gauche / droit                | A / D                                                          |
| Lacet gauche / droit                 | Q / E                                                          |
| Souris                               | horizontale : lacet ; verticale : tangage                      |
| Tirer                                | clic gauche                                                    |
| Leurres                              | V                                                              |
| Changer de vue                       | C                                                              |
| Regard libre                         | Alt gauche (maintenir, ou double appui pour le garder)         |
| Ravitaillement (posé sur l'hélipad)  | B                                                              |
| Recommencer                          | R                                                              |
| Recentrer la souris (manche virtuel) | X                                                              |
| Pause                                | Échap                                                          |

**Dans le navigateur, attention à Ctrl + W.** Chrome et Edge ferment l'onglet avec Ctrl + W (la fenêtre avec
Ctrl + Maj + W), et une page ne peut pas l'empêcher. Or, avec ces touches, descendre en piquant fait Ctrl gauche + W.
Pendant une session, l'entraîneur demande donc au navigateur de confirmer avant de fermer : répondez **Annuler** (ou
**Rester**) pour continuer. L'application Windows n'a pas ce raccourci ; dans le navigateur, vous pouvez aussi
réassigner « Réduire le collectif » ou « Piquer » dans l'onglet Commandes.

Les réglages de la souris (sensibilités, multiplicateur, inversion, isolation, champs de vision) portent les mêmes
noms que dans le jeu, et l'onglet Commandes peut les lire dans le fichier de réglages du jeu. Voir
[`docs/REGLAGES.md`](docs/REGLAGES.md).

## Comment la fidélité a été mesurée

Deux enregistrements de parties (1080p, 60 images par seconde, environ 9 minutes au total) ont été analysés image par
image, en privé : chiffres du HUD (vitesse, altitudes, cap), indicateur d'attitude et arcs du collectif, compteur de
munitions, chiffres de dégâts, bande son. Ces enregistrements **ne sont pas publiés** : ni image, ni son, ni nom de
fichier. Seules des séries de nombres qui en sont tirées (relevés du HUD image par image, courbes de réponse de la
souris) le sont, comme données de test, pour que les contrôles de fidélité tournent chez tout le monde.

Chaque réglage n'est adopté que s'il reproduit mieux les passages qui n'ont pas servi à le régler. Les contrôles F01 à
F37 (`tests/fidelity/`) relient l'entraîneur à ces mesures, et les goldens figent son comportement bit à bit : tout
changement de comportement est déclaré dans le [`CHANGELOG.md`](CHANGELOG.md). Méthode complète :
[`docs/FIDELITE.md`](docs/FIDELITE.md) ; analyses par thème : [`docs/analyse/`](docs/analyse/).

## Sécurité et vie privée

La page n'a aucun code réseau et sa politique de sécurité du contenu n'autorise que ses propres scripts et sa feuille
de style, identifiés par leur empreinte. L'application Windows l'affiche sans Node.js dans la page, bloque tout accès
réseau, et n'a ni mise à jour automatique ni télémétrie. Les réglages restent sur l'ordinateur. Conception :
[`docs/SECURITE-CONCEPTION.md`](docs/SECURITE-CONCEPTION.md) ; signaler une faille en privé :
[`SECURITY.md`](SECURITY.md).

## Contribuer

Voir [`CONTRIBUTING.md`](CONTRIBUTING.md) : vérifications (`npm run verify`), règles des tests dans le navigateur,
changements de comportement déclarés, sources des constantes.

## Licence

Code sous licence MIT (voir [`LICENSE`](LICENSE)). three.js est inclus sous licence MIT ; l'application Windows
contient Electron (MIT) et Chromium (licences dans `LICENSES.chromium.html`, livré avec elle) ; voir
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

---

## English summary

LittleBird Trainer is an offline flight and gunnery trainer for a light armed helicopter (AH-6M-type, miniguns) that
runs in the browser. Its flight model, mouse law, cameras, HUD and sounds are fitted to measurements taken on two
recordings of WARDOGS matches, so that players can train the game's feel without launching it.

> **Unofficial project.** LittleBird Trainer is a free trainer made by a player for players. It is **not affiliated
> with, endorsed or sponsored by** the publishers or developers of WARDOGS. WARDOGS and the other trademarks mentioned
> belong to their respective owners. The program contains no file, model, texture, sound, font or image from the game:
> everything is generated by its own code. It runs offline, sends no data and never modifies the game's files (the
> settings import only reads the file you pick).

- **Run it**: each release ships a one-click per-user Windows installer, a portable Windows zip (Electron 44, no
  Node.js in the page, no network, no auto-update; unsigned, so SmartScreen warns once) and a browser zip with the
  single-page `index.html` for Chrome or Edge; every file has a SHA-256 sum and a build-provenance attestation. From
  source: Node.js 24, `npm ci`, `npm run build` (page) or `npm run dist` (Windows app); the tests need the exact
  version in `.nvmrc` (24.19.0), which the bit-exact goldens were recorded with.
- **Which version**: the full version number (e.g. `v0.10.0`) shows in the top right of the game's menu and in its
  **À propos** (About) tab, with the address of the releases page to compare against; the game checks nothing by
  itself (no network code). Watch the repository's releases to hear of new ones.
- **Default keys**: the game's helicopter defaults (collective Left Shift / Left Ctrl, cyclic W/S and A/D, yaw Q/E,
  fire left click, flares V, camera C, free look Left Alt) plus B (resupply on the helipad), R (restart) and X
  (re-centre the virtual stick); all rebindable. In a browser, Ctrl+W (collective down while pitching down) closes the
  tab and no page can prevent it: during a session the trainer asks the browser to confirm first. The Windows app has
  no such shortcut.
- **Fidelity**: the recordings were analysed frame by frame in private and are not published; only numeric series
  derived from them ship as test data. Every constant is labelled measured, read, assumed or chosen; behaviour is
  locked by bit-exact goldens and fidelity checks, and every behaviour change is declared in the changelog.
- **Security**: no network code; a hash-based Content-Security-Policy allows only the page's own blocks. Report
  vulnerabilities privately (see `SECURITY.md`).
- **License**: MIT; three.js (MIT) is bundled; the Windows app contains Electron (MIT) and Chromium (licenses in
  `LICENSES.chromium.html`).
