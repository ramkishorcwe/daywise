import { expect, test } from '@playwright/test';
import { setup } from './helpers/live-guide';

for (const width of [390, 1440]) test(`clean initial preferences keep multiple selection, help and explicit planning at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await setup(page);
  await expect(page.getByText('Tell us your preferences. The guide selects real attractions', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Choose as many as you like.', { exact: false })).toHaveCount(0);
  const help = page.locator('.guide-help'); await expect(help).not.toHaveAttribute('open');
  await expect(page.getByRole('combobox', { name: 'Preferred pace', exact: true })).toBeVisible();
  const interests = page.getByRole('group', { name: 'Your interests', exact: true });
  for (const name of ['history', 'culture']) await interests.getByRole('button', { name, exact: true }).click();
  for (const name of ['temples', 'gardens', 'museums', 'food']) await interests.getByRole('button', { name, exact: true }).click();
  await page.getByRole('combobox', { name: 'Indoor or outdoor', exact: true }).selectOption('indoor');
  await page.waitForTimeout(1200); expect(state.inputs).toHaveLength(0);
  await help.getByText('Planning help', { exact: true }).click(); await expect(help).toContainText('Each visit must match a selected interest'); await expect(help).toContainText('prioritizes covering all selected interests when feasible');
  await help.getByText('Planning help', { exact: true }).click();
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  expect(state.inputs[0].preferences).toMatchObject({ interests: ['temples', 'gardens', 'museums', 'food'], environment: 'indoor' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('region', { name: 'Automatic tour planner', exact: true }).screenshot({ path: `.tmp/clean-preferences-${width}.png` });
});

test('strict no-match errors leave preferences editable and retain the accepted trip', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check();
  await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await page.getByRole('button', { name: /My day plan/ }).click();
  await page.getByRole('button', { name: 'temples', exact: true }).click();
  await page.route('**/api/guide/discover', r => r.fulfill({ status: 422, json: { error: { code: 'NO_GUIDE_CANDIDATES', message: 'No verified places match your selected interests. Your preferences were not relaxed.' } } }));
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('preferences were not relaxed');
  await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'temples', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Follow my day', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toContainText('Provider Garden');
});
