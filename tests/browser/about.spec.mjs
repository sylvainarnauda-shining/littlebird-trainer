// The version and the "À propos" tab in a real browser (the maintainer's request: the version shown in the game's
// menu, so that whoever downloads or follows the project sees whether they have the latest one). The menu header shows
// package.json's full version; the tab shows it again, with the releases page as text and as a link that opens a new
// tab without opener or referrer. The link is never followed (a test contacts nothing), and Start is never clicked;
// openTrainer() asserts the emulated pointer lock before anything is clicked, and again at the end.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, openTrainer, assertEmulatedPointerLock } from './fixtures.mjs';
import TEXT from '../helpers/ui-text.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const RELEASES = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '') + '/releases';

test('the menu shows the full version; À propos: version, how to compare, releases link (not followed)', async ({
  page,
}) => {
  await openTrainer(page, { manualClock: true });
  await expect(page.locator('#appVersion'), 'the menu header').toHaveText('v' + pkg.version);
  await expect(page.locator('#appVersion')).toBeVisible();
  await expect(page.locator('#about')).toBeHidden();

  await page.locator('[data-tab="about"]').click();
  await expect(page.locator('#about')).toBeVisible();
  await expect(page.locator('#modes')).toBeHidden();
  await expect(page.locator('#pageTitle')).toHaveText(TEXT.aboutTab);
  await expect(page.locator('[data-tab="about"]')).toHaveClass(/\bactive\b/);
  await expect(page.locator('#about h2')).toHaveText(pkg.productName);
  await expect(page.locator('#aboutVersion')).toHaveText(pkg.version);
  await expect(page.locator('#about p', { hasText: TEXT.aboutHowToCheck })).toBeVisible();
  await expect(page.locator('#about')).toContainText(TEXT.aboutLicence);
  await expect(page.locator('#about')).toContainText(TEXT.aboutUnofficial);
  const link = page.locator('#releasesLink');
  await expect(link).toBeVisible();
  await expect(link).toHaveText(RELEASES);
  expect(await link.evaluate((a) => ({ href: a.href, target: a.target, rel: [...a.relList].sort() }))).toEqual({
    href: RELEASES,
    target: '_blank',
    rel: ['noopener', 'noreferrer'],
  });

  await page.locator('[data-tab="modes"]').click();
  await expect(page.locator('#modes')).toBeVisible();
  await expect(page.locator('#about')).toBeHidden();
  expect(page.context().pages().length, 'no other tab was opened').toBe(1);
  await assertEmulatedPointerLock(page);
});
