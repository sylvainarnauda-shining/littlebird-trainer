#!/usr/bin/env node
// Release gate and notes (release workflow, job preflight). Fails unless the tag is vX.Y.Z, equals package.json's
// version and CHANGELOG.md has a "## [X.Y.Z] — AAAA-MM-JJ" section (a real release must be dated; a dry run accepts the
// undated "non publiée" heading). Writes that section, then the download and verification notes for players (French),
// including the sha256 of the browser page so that anyone can rebuild it from the tag and compare.
//   node scripts/release-notes.mjs <tag|--dry-run> <out.md> [--page dist/web/index.html]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'sylvainarnauda-shining/littlebird-trainer';

export function releaseNotes({ tag, dryRun = false, pkg, changelog, pageSha256 = null }) {
  const version = dryRun ? pkg.version : /^v(\d+\.\d+\.\d+)$/.exec(tag || '')?.[1];
  if (!version) throw new Error(`tag "${tag}" is not vX.Y.Z`);
  if (version !== pkg.version) throw new Error(`tag ${tag} does not match package.json version ${pkg.version}`);
  const esc = version.replace(/\./g, '\\.');
  const start = changelog.search(new RegExp(`^## \\[${esc}\\]`, 'm'));
  if (start < 0) throw new Error(`CHANGELOG.md has no "## [${version}]" section`);
  const next = changelog.slice(start + 1).search(/^## \[/m);
  const section = (next < 0 ? changelog.slice(start) : changelog.slice(start, start + 1 + next)).trim();
  const heading = section.split('\n')[0];
  if (!dryRun && !/— \d{4}-\d{2}-\d{2}\s*$/.test(heading))
    throw new Error(
      `the CHANGELOG.md heading of ${version} must carry the release date ("## [${version}] — AAAA-MM-JJ")`,
    );
  const body = section.replace(/^## .*\n/, '').trim();
  if (!body) throw new Error(`the CHANGELOG.md section of ${version} is empty`);
  const page = pageSha256
    ? `\n- Page de la version navigateur (\`index.html\`) : SHA-256 \`${pageSha256}\`. ` +
      `\`npm ci\` puis \`npm run build\` sur l'étiquette \`v${version}\` redonnent la même page, octet pour octet.`
    : '';
  return `${body}

---

### Télécharger

| Fichier | Pour qui |
| --- | --- |
| \`LittleBird-Trainer-Setup-${version}.exe\` | Installation en un clic pour votre compte Windows (10 ou 11, 64 bits), sans droits administrateur ; raccourcis Bureau et menu Démarrer |
| \`LittleBird-Trainer-${version}-win-x64.zip\` | Version portable : extraire, puis lancer \`LittleBirdTrainer.exe\` |
| \`LittleBird-Trainer-${version}-navigateur.zip\` | Sans rien installer : ouvrir \`index.html\` dans Chrome ou Edge |

Les exécutables ne sont pas signés : au premier lancement, Windows SmartScreen affiche « Windows a protégé votre
ordinateur » ; cliquez sur **Informations complémentaires**, puis **Exécuter quand même**. Si le Contrôle intelligent des
applications de Windows 11 est activé, il peut bloquer l'installateur sans proposer de le lancer : utilisez alors la
version navigateur. Détails : [docs/INSTALLATION.md](https://github.com/${REPO}/blob/v${version}/docs/INSTALLATION.md).

### Vérifier les fichiers

- Empreintes : \`SHA256SUMS.txt\` (PowerShell : \`Get-FileHash -Algorithm SHA256 <fichier>\`).
- Provenance (fichiers construits par GitHub Actions depuis ce dépôt, à cette étiquette) :
  \`gh attestation verify <fichier> --repo ${REPO} --signer-workflow ${REPO}/.github/workflows/release.yml\`.${page}

Guide : [docs/VERIFIER-UN-TELECHARGEMENT.md](https://github.com/${REPO}/blob/v${version}/docs/VERIFIER-UN-TELECHARGEMENT.md).
`;
}

function main() {
  const argv = process.argv.slice(2);
  const [tag, out] = argv;
  if (!tag || !out) {
    console.error('usage: node scripts/release-notes.mjs <vX.Y.Z|--dry-run> <out.md> [--page <index.html>]');
    process.exit(2);
  }
  const i = argv.indexOf('--page');
  const page = i > 0 ? fs.readFileSync(path.resolve(argv[i + 1])) : null;
  try {
    const notes = releaseNotes({
      tag,
      dryRun: tag === '--dry-run',
      pkg: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')),
      changelog: fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'),
      pageSha256: page ? crypto.createHash('sha256').update(page).digest('hex') : null,
    });
    fs.writeFileSync(out, notes);
    console.log(`release-notes: ${out} written`);
  } catch (e) {
    console.error('release gate: ' + e.message);
    process.exit(1);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
