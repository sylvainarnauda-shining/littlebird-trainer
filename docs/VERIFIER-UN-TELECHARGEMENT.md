# Vérifier un téléchargement

Les fichiers d'une version sont construits par GitHub Actions à partir de ce dépôt, à l'étiquette de la version
(workflow `.github/workflows/release.yml`), puis publiés par le mainteneur. Trois vérifications, de la plus simple à la
plus complète.

## 1. L'empreinte SHA-256

Chaque version publie `SHA256SUMS.txt`, une ligne par fichier. Comparez avec l'empreinte du fichier téléchargé :

- Windows (PowerShell) : `Get-FileHash -Algorithm SHA256 .\LittleBird-Trainer-Setup-X.Y.Z.exe`
- macOS ou Linux : `shasum -a 256 <fichier>` ou, dans le dossier des fichiers, `sha256sum --check SHA256SUMS.txt`

Les deux valeurs doivent être identiques, caractère pour caractère.

## 2. La provenance (attestation)

Chaque fichier porte une attestation de provenance signée (Sigstore) qui dit quel workflow, à quelle étiquette et
depuis quel dépôt l'a construit. Avec l'outil GitHub CLI (`gh`) :

```
gh attestation verify .\LittleBird-Trainer-Setup-X.Y.Z.exe --repo sylvainarnauda-shining/littlebird-trainer --signer-workflow sylvainarnauda-shining/littlebird-trainer/.github/workflows/release.yml
```

La commande doit répondre que la vérification a réussi. L'installateur porte aussi une attestation de sa liste de
composants (SBOM, fichier `LittleBird-Trainer-X.Y.Z.sbom.cdx.json`).

## 3. Reconstruire la page

La page de la version navigateur est reproductible : la reconstruire depuis les sources de la même étiquette redonne le
même fichier, octet pour octet. Les notes de version donnent son empreinte SHA-256 (le workflow de publication vérifie
que la page construite sous Linux, celle construite sous Windows et celle des notes sont la même).

```
git clone https://github.com/sylvainarnauda-shining/littlebird-trainer.git
cd littlebird-trainer
git checkout vX.Y.Z
npm ci
npm run build
```

Comparez ensuite l'empreinte de `dist/web/index.html` avec celle des notes de version, ou avec le `index.html` du zip
navigateur. La même page se trouve, inchangée, dans l'application Windows (fichier `resources\app.asar`).

## Ce que ces vérifications ne disent pas

Les exécutables ne sont pas signés par un certificat d'éditeur : Windows affiche donc l'avertissement SmartScreen
décrit dans [`INSTALLATION.md`](INSTALLATION.md). Les vérifications ci-dessus remplacent cette signature pour ce qui
compte : le fichier est celui que le workflow du dépôt a construit à partir du code public.
