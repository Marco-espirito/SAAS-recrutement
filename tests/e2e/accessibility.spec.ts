import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('the sign-in screen has no serious or critical WCAG violations', async ({
  page,
}) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const seriousOrWorse = results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact ?? ''),
  );
  expect(
    seriousOrWorse,
    seriousOrWorse
      .map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`)
      .join('\n'),
  ).toEqual([]);
});

test('the registration form has no serious or critical WCAG violations', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer un espace' }).click();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const seriousOrWorse = results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact ?? ''),
  );
  expect(
    seriousOrWorse,
    seriousOrWorse
      .map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`)
      .join('\n'),
  ).toEqual([]);
});
