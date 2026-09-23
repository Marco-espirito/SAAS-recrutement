import { expect, test } from '@playwright/test';

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

test('a candidate can create an account and land on their dashboard', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer un espace' }).click();

  await page.getByLabel('Nom complet').fill('Test E2E');
  await page.getByLabel('Nom de votre espace').fill(`Espace ${Date.now()}`);
  await page.getByLabel('Adresse e-mail').fill(uniqueEmail('e2e'));
  await page.getByLabel('Mot de passe').fill('CorrectHorseBattery9!');
  await page.getByRole('button', { name: 'Créer mon espace' }).click();

  await expect(page.getByText('Espace candidat')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('.logo')).toContainText('Nexora');
});
