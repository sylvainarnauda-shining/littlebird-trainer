# Publier une version (mainteneur)

Tout ce qui est poussé sur GitHub est public aussitôt. Une version n'est publiée qu'à la main, par le mainteneur, à
partir d'un brouillon que le workflow de publication prépare et vérifie.

## Une seule fois : réglages du dépôt

1. **Secret du scanner.** Le scanner de confidentialité lit une liste privée de termes (`.publish-denylist`, jamais
   versionnée). Pour que la CI l'applique aussi : `gh secret set PUBLISH_DENYLIST < .publish-denylist`, tapé par le
   mainteneur lui-même. Les journaux publics n'affichent jamais un terme trouvé, seulement le fichier et la ligne.
2. **Réglages en code.** `node scripts/github-settings.mjs plan` liste les réglages ; `apply` les pose avec `gh`
   (authentifié par le mainteneur), `verify` les relit et échoue sur toute différence :
   - fusions : seulement par écrasement (« squash »), avec le titre et la description de la pull request comme message
     (la ligne `Golden-Update:` d'une description arrive ainsi sur `main`), branche supprimée après la fusion ;
   - Actions : seulement les actions de GitHub, épinglées par empreinte de commit complète ; jeton en lecture seule ;
     Actions ne peut pas approuver une pull request ; approbation des workflows de contributeurs extérieurs ;
   - règle `protect-main` : ni suppression ni force-push, historique linéaire, pull request obligatoire, vérification
     requise **`ci-ok`** (la seule : elle agrège tous les travaux de la CI) ; aucune exception ;
   - règle `release-tags` : seul un administrateur crée, déplace ou supprime une étiquette `v*` ;
   - environnement `release` : approbation du mainteneur, étiquettes `v*` seulement ;
   - versions immuables une fois publiées ;
   - relus sans les changer : analyse des secrets avec blocage à l'envoi, alertes et correctifs Dependabot, signalement
     privé des failles ; la « configuration par défaut » de CodeQL reste désactivée (le workflow `codeql.yml` fait
     l'analyse).
3. **Compte GitHub** (réglages du compte, par le mainteneur) : clé d'accès ou double authentification, **Keep my
   email addresses private** et **Block command line pushes that expose my email**.

**En cas de blocage** (la règle sans exception empêche une correction urgente) : désactiver temporairement la règle
dans Settings › Rules, corriger, la réactiver ; le journal d'audit du dépôt en garde la trace. Ne jamais contourner les
crochets Git (`--no-verify`) : le crochet d'envoi est le seul contrôle de confidentialité avant publication.

## À chaque version

1. Sur une branche : la version dans `package.json` (`npm version X.Y.Z --no-git-tag-version`) et, dans
   `CHANGELOG.md`, la section `## [X.Y.Z] — AAAA-MM-JJ` datée du jour de l'étiquette (le workflow refuse une section
   non datée). Tout ce qui change dans les sensations de vol y est écrit. Puis les **notes de version** en français,
   `docs/notes-de-version/<version>.md` (modèle : [notes de la 0.9.0](notes-de-version/0.9.0.md)), écrites pour les
   joueurs : ce qu'est l'entraîneur, son statut (une version 0.x est une préversion), quel fichier prendre,
   SmartScreen et le Contrôle intelligent des applications avec la version navigateur en repli, la vérification des
   empreintes et des attestations. `{{version}}`, `{{repo}}` et `{{page_sha256}}` y sont remplacés à la publication ;
   le workflow refuse des notes absentes ou incomplètes (`scripts/release-notes.mjs`).
2. Sur le PC du mainteneur, avec sa carte graphique :
   - `npm run verify` puis `npm run test:browser` (tous les tests, y compris ceux marqués `@gpu`, que la CI ne lance
     pas faute de carte graphique : vol libre, modes, cartes, loi de la souris, cadence des images, politique de
     sécurité sur chaque écran) ;
   - `npm run test:perf` (seuils d'images par seconde imposés avec `LB_PERF=1`) ;
   - `npm run dist`, puis `npm run desktop:check` (fusibles, contenu de `app.asar`, fichiers d'Electron officiels,
     auto-test de l'application empaquetée) et `npm run release:check` (zip portable, installation et
     désinstallation silencieuses dans un dossier temporaire) ;
   - cinq minutes de vol dans Chrome, puis cinq minutes dans l'application, sur la même carte et avec des réglages
     identiques (regard libre avec Alt, Échap, fluidité), et `trainerDiagnostics()` qui montre la carte graphique
     dédiée ;
   - avec les **réglages initiaux** : la sensation de la souris (sensibilités par défaut choisies, voir
     [`REGLAGES.md`](REGLAGES.md)) ; dans Chrome, Ctrl gauche + W pendant une session doit afficher la demande de
     confirmation du navigateur (et « Annuler » garder la session).
3. Pull request, `ci-ok` vert, fusion dans `main`.
4. Essai à blanc : Actions › **Release** › **Run workflow** construit et vérifie tout sans rien publier (fichiers
   gardés 3 jours).
5. Étiquette sur le commit fusionné : `git switch main`, `git pull`, `git tag vX.Y.Z`, `git push origin vX.Y.Z`.
6. Le workflow **Release** : contrôles (étiquette sur `main`, version, journal, empreinte de la page dans les notes,
   confidentialité de tout l'historique), toute la CI sans travail consultatif (les tests dans le navigateur et
   l'application empaquetée bloquent aussi), puis seulement la page et le zip navigateur (Linux), l'installateur et le
   zip portable (Windows), dont les empreintes passent par les sorties des travaux ; leur vérification (fichiers égaux
   à ces empreintes, même page sous Linux, sous Windows et dans les notes, fusibles, contenu, auto-tests du zip et de
   l'application installée, installation et désinstallation), l'analyse de confidentialité des fichiers livrés, puis,
   après **votre approbation** de l'environnement `release`, la même vérification des empreintes,
   `SHA256SUMS.txt`, les attestations et un **brouillon** de version (marqué préversion pour une version 0.x), avec
   les notes de version suivies de la section du journal.
7. Relire le brouillon (fichiers, notes), télécharger l'installateur, vérifier son empreinte et son attestation
   ([`VERIFIER-UN-TELECHARGEMENT.md`](VERIFIER-UN-TELECHARGEMENT.md)), l'installer, voler, puis **Publish release**.

Une version publiée est immuable : en cas d'erreur, ne jamais réutiliser l'étiquette ; corriger et publier `X.Y.Z+1`.
Un brouillon, lui, peut être supprimé (avec son étiquette) avant publication.

## Mettre Electron à jour

Electron ne suit que ses trois dernières versions majeures, et chaque correctif de sécurité de Chromium arrive dans une
nouvelle version d'Electron. Règle du projet : une version de l'entraîneur sort **dans les 30 jours** d'un correctif
d'Electron, **dans les 7 jours** si Chromium signale une faille exploitée ; le workflow hebdomadaire `maintenance.yml`
échoue quand ce délai est dépassé ou quand la version majeure n'est plus suivie.

Dependabot propose la mise à jour (groupe `desktop-runtime`). Avant de fusionner : lire les notes de version d'Electron
(correctifs de sécurité), `node scripts/check-install-scripts.mjs` (relire tout script d'installation nouveau), CI
verte, puis sur le PC `npm run dist` et `npm run desktop:check`. L'auto-test compare le calcul du vol dans le moteur
d'Electron à la référence (porte G5, `desktop/parity.cjs`) : si la nouvelle version de Chromium calcule autrement, il
échoue ; on mesure alors l'écart (il doit rester sous la tolérance), on enregistre la nouvelle empreinte dans
`CHROMIUM` avec la version qui l'a donnée (`measuredWith`), et on le note dans `CHANGELOG.md`. L'empreinte complète se
lit dans le rapport de l'auto-test (`steps.parity.final`, fichier `desktop-smoke.json` de la CI) et, pour le Chromium
de Playwright, dans le journal du test `G5` du navigateur ; pour une empreinte inconnue, le rapport
(`steps.parity.checkpointHex`) et le journal (ligne `G5 checkpointHex`) donnent aussi les points de contrôle, tout ce
qu'il faut pour l'enregistrer après avoir vérifié l'écart. Même sans changement d'empreinte, la mesure est notée
(exemple : 44.4.5 puis 44.5.1, même empreinte). Enfin quelques minutes de vol (souris capturée, 100 Hz, son).

## Signature

Les exécutables ne sont pas signés (pas de certificat au nom d'une personne). Options étudiées pour plus tard :
SignPath Foundation (gratuit pour les projets libres, après quelques versions) ou le Microsoft Store (MSIX). Une
signature se ferait dans un travail à part, après la vérification des fichiers et avant les attestations, sans clé
stockée dans les secrets du dépôt.
