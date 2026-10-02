# Installer et lancer LittleBird Trainer

Trois façons de jouer, toutes hors ligne, sans compte :

| Fichier (page **Releases** du dépôt)      | Pour qui                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `LittleBird-Trainer-Setup-X.Y.Z.exe`      | Windows 10 ou 11 (64 bits) : installation en un clic pour votre compte, raccourcis Bureau et Démarrer |
| `LittleBird-Trainer-X.Y.Z-win-x64.zip`    | Windows, sans installation (clé USB, ordinateur partagé)                                              |
| `LittleBird-Trainer-X.Y.Z-navigateur.zip` | Windows, macOS ou Linux, sans rien exécuter : une page `index.html` à ouvrir dans Chrome ou Edge      |

Il faut une carte graphique compatible **WebGL 2** (toute carte récente), une souris et un clavier. Avant d'ouvrir un
fichier téléchargé, vous pouvez vérifier qu'il est bien celui publié : voir
[`VERIFIER-UN-TELECHARGEMENT.md`](VERIFIER-UN-TELECHARGEMENT.md).

## Application Windows (installateur)

1. Téléchargez `LittleBird-Trainer-Setup-X.Y.Z.exe`. Si le navigateur dit que le fichier est rarement téléchargé,
   choisissez **Conserver**.
2. Double-cliquez dessus. Windows affiche **« Windows a protégé votre ordinateur »** : cliquez sur **Informations
   complémentaires**, puis sur **Exécuter quand même**. Cet avertissement vient de ce que le programme n'est pas signé
   par un certificat payant ; ce n'est pas une alerte de virus.
3. L'installation se fait pour votre compte Windows seulement, sans droits administrateur, dans
   `%LOCALAPPDATA%\Programs`. Le jeu démarre ensuite ; les raccourcis **LittleBird Trainer** sont sur le Bureau et dans
   le menu Démarrer.

**Contrôle intelligent des applications (Windows 11).** S'il est activé (Sécurité Windows › Contrôle des
applications et du navigateur), il peut bloquer l'installateur et l'application sans proposer de les lancer, parce
qu'ils ne sont pas signés et encore peu connus. Utilisez alors la version navigateur, qui n'exécute rien. Ne
désactivez pas ce contrôle pour ce programme : selon la version de Windows, il ne se réactive pas sans réinstaller
Windows.

**Commandes propres à l'application.** **F11** passe en plein écran et en revient. **Échap** libère la souris et met
en pause. L'application n'a pas de barre de menus : **Alt** reste la touche du regard libre.

## Application Windows (zip portable)

Clic droit sur le `.zip` › **Extraire tout**, puis lancez `LittleBirdTrainer.exe` dans le dossier extrait (pas depuis
l'intérieur du zip). Le même avertissement SmartScreen apparaît au premier lancement. Pour supprimer la version
portable, supprimez le dossier.

## Version navigateur

Extrayez le `.zip`, puis ouvrez `index.html` avec **Chrome** ou **Edge** (clic droit › Ouvrir avec). D'autres
navigateurs peuvent fonctionner, mais seuls Chrome et Edge sont testés.

**Ctrl + W ferme l'onglet.** Dans Chrome et Edge, Ctrl + W ferme l'onglet (Ctrl + Maj + W la fenêtre) et aucune page
ne peut l'empêcher, même pendant la capture de la souris. Avec les touches par défaut, descendre en piquant fait
justement Ctrl gauche (collectif −) + W (piquer). Pendant une session, l'entraîneur demande au navigateur une
confirmation avant de fermer : choisissez **Annuler** (ou **Rester**), puis cliquez dans le jeu pour reprendre. Pour
éviter la question, jouez avec l'application Windows (elle n'a pas ce raccourci) ou réassignez « Réduire le
collectif » ou « Piquer » dans l'onglet Commandes.

**Depuis les sources.** Avec Git et Node.js 24 :

```
git clone https://github.com/sylvainarnauda-shining/littlebird-trainer.git
cd littlebird-trainer
npm ci
npm run build
```

La page est `dist/web/index.html`, avec sa politique de sécurité dans `dist/web/csp.txt`. `npm run verify:build`
vérifie la page construite. `npm run dist` construit l'installateur et le zip portable dans `release/` (Windows).
Toute version 24 de Node.js construit la page ; les tests (`npm test`) demandent la version exacte de `.nvmrc`
(24.19.0), avec laquelle les goldens ont été enregistrés bit à bit (par exemple avec `nvm` ou `fnm` : voir
[`CONTRIBUTING.md`](../CONTRIBUTING.md)).

## Premier lancement

1. Le programme génère la vallée, la forêt et les sons sur l'ordinateur (quelques secondes), puis affiche le menu.
2. Choisissez un mode et ses options, puis **Démarrer** : la souris est capturée.
3. **Échap** libère la souris et ouvre la pause (Reprendre, Recommencer, Changer de mode, Réglages).

Si la capture de la souris est refusée, l'exercice démarre en **manche virtuel** : écartez la souris de sa position
de départ pour tourner, ramenez-la pour revenir au neutre ; **X** recentre. La capture reste préférable.

La qualité graphique (haute, moyenne, basse : Réglages › Affichage) s'applique au prochain chargement.

## Réglages et profils

- **Application Windows** : réglages et touches sont gardés dans `%APPDATA%\LittleBird Trainer` (le même dossier pour
  l'installateur et le zip portable).
- **Version navigateur** : ils sont gardés par le navigateur, pour ce fichier à cet emplacement. Les pages ouvertes
  depuis des fichiers de l'ordinateur (`file://`) partagent ce stockage dans le navigateur.
- Les deux versions ne partagent pas leurs réglages. Pour passer de l'une à l'autre : **Exporter le profil** dans
  l'une, puis **Importer un profil** dans l'autre (Réglages).
- **Réglages initiaux** remet toutes les valeurs et les touches par défaut (voir [`REGLAGES.md`](REGLAGES.md)).
- **Importer les réglages du jeu** (onglet Commandes) lit, dans le fichier de réglages du jeu que vous choisissez,
  les sensibilités de la souris pour l'hélicoptère, le multiplicateur, l'inversion, l'isolation et les champs de vision.
  Sous Windows, le jeu range ce fichier dans
  `%LOCALAPPDATA%\Wardogs\Saved\Config\WindowsClient\GameUserSettings.ini`. Rien n'est écrit dans le jeu, et le texte du
  fichier n'est pas conservé.

## Mise à jour

**Quelle version est installée ?** Le numéro complet (par exemple `v0.10.0`) est affiché en haut à droite du menu du
jeu, et dans l'onglet **À propos**, qui donne aussi l'adresse de la page **Releases** du dépôt (un clic l'ouvre dans
votre navigateur). Le raccourci garde toujours le même nom, **LittleBird Trainer**, sans numéro.

L'application ne cherche pas de mises à jour (elle n'a aucun code réseau) : comparez le numéro affiché avec la
dernière version de la page **Releases**. Pour être prévenu des nouvelles versions : sur GitHub, **Watch › Custom ›
Releases** sur le dépôt.

- **Installateur** : installez la nouvelle version par-dessus l'ancienne ; vos réglages sont conservés.
- **Zip portable** : remplacez le dossier ; les réglages sont dans `%APPDATA%\LittleBird Trainer`.
- **Version navigateur** : remplacez `index.html` au même emplacement, puis rechargez la page.

Un avis s'affiche si une nouvelle version fait évoluer une valeur enregistrée. Par précaution, exportez le profil avant.

## Désinstallation

- **Installateur** : Paramètres Windows › Applications › Applications installées › LittleBird Trainer ›
  Désinstaller. Les raccourcis et les fichiers du programme sont supprimés ; vos réglages restent dans
  `%APPDATA%\LittleBird Trainer`, comme une sauvegarde de jeu. Supprimez ce dossier pour tout effacer.
- **Version navigateur** : supprimez le fichier ; les réglages restent dans le navigateur jusqu'à ce que vous effaciez
  les données de site.

## Ordinateur avec deux cartes graphiques

Si le jeu est saccadé sur un portable ou un PC avec un processeur graphique intégré : Paramètres Windows › Système ›
Écran › **Graphiques**, ajoutez `LittleBirdTrainer.exe` et choisissez **Hautes performances**.

## Confidentialité

Le programme n'a aucun code réseau : il ne télécharge rien et n'envoie rien, sans télémétrie ni vérification de mise à
jour. L'application Windows bloque en plus toute requête réseau de sa page. Voir [`SECURITY.md`](../SECURITY.md).
