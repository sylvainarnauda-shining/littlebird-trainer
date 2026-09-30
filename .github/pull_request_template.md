## Ce que change cette demande

<!-- En quelques lignes : quoi et pourquoi. -->

## Comportement du vol et du jeu

- [ ] **Goldens inchangés** (refactorisation, outils, documentation) : `npm test` passe sans toucher `tests/fixtures/golden/`.
- [ ] **Changement de comportement déclaré** : un commit à lui seul, avec le trailer `Golden-Update: <raison>`, une entrée
      « Comportement » dans `CHANGELOG.md` et la preuve que les goldens ne changent que là où il le dit (voir
      `CONTRIBUTING.md`).

## Vérifications

- [ ] `npm run verify` (scanner de confidentialité, lint, format, construction, politique de la page, tests Node)
- [ ] `npm run test:browser` si la page ou ses tests changent
- [ ] `npm run dist:dir` puis `npm run desktop:check` si l'application Windows ou son empaquetage changent

## Confidentialité

- [ ] Aucune image, vidéo ni capture du jeu, aucun fichier de réglages, aucun chemin ni nom personnel, aucune adresse
      électronique autre que noreply.
