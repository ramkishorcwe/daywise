import { expect, test } from '@playwright/test';

test('build, edit, preserve a confirmed plan, and restore it after reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your day, thoughtfully planned.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm this plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm this plan' }).click();
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled();
  const remove = page.getByRole('button', { name: /^Remove / }).first();
  await remove.click();
  await expect(page.getByText('Your confirmed plan is safe.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Review changes' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep confirmed plan' }).click();
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Saved plans', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open plan' })).toBeVisible();
});

test('progressive preferences explain unsupported food evidence', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Confirm this plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit preferences', exact: true }).last().click();
  await page.getByRole('button', { name: 'Vegan', exact: true }).click();
  await page.getByRole('button', { name: 'No onion', exact: true }).click();
  await page.getByRole('button', { name: 'Your preferences' }).click();
  await page.getByRole('button', { name: 'Build my day' }).click();
  await expect(page.getByRole('heading', { name: 'This day needs a small adjustment.' })).toBeVisible();
  await expect(page.getByText(/No test meal has evidence/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm this plan' })).toHaveCount(0);
});

test('accepting reviewed changes persists the new confirmed snapshot', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Confirm this plan' }).click();
  await page.getByRole('button', { name: 'Remove Heritage Gallery', exact: true }).click();
  await page.getByRole('button', { name: 'Review changes' }).click();
  await expect(page.getByRole('dialog').getByText('Remove Heritage Gallery', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Accept changes' }).click();
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Heritage Gallery', exact: true })).toHaveCount(0);
});

test('a rejected lunch removal can be undone without changing confirmation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Confirm this plan' }).click();
  await page.getByRole('button', { name: 'Remove Corner Café', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'This day needs a small adjustment.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review changes' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Corner Café', exact: true })).toBeVisible();
});

test('switches city currency and remains usable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Confirm this plan' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Destination city' }).selectOption('harbor-test');
  await expect(page.getByRole('button', { name: 'Confirm this plan' })).toBeVisible();
  await expect(page.getByText(/America\/New_York/)).toBeVisible();
  await expect(page.locator('.budget-total')).toContainText('$');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Edit preferences', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
