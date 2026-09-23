import { expect, test } from '@playwright/test';

test('the sign-in screen never causes horizontal page scroll', async ({
  page,
}) => {
  await page.goto('/');
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});

test('the registration form never causes horizontal page scroll', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer un espace' }).click();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});
