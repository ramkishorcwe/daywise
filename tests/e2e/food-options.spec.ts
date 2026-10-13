import { expect, test } from '@playwright/test';

test('meal replacement is a reviewed draft, and accepting it survives reload', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click();
  await page.getByRole('button', { name: 'Food options', exact: true }).click();
  const meal = page.getByRole('article', { name: 'Food option Garden Table', exact: true });
  await expect(meal.getByText('Fits this draft', { exact: true })).toBeVisible(); await expect(meal.getByText('Unknown', { exact: true })).toBeVisible();
  await meal.getByRole('button', { name: 'Use Garden Table in draft', exact: true }).click();
  await expect(page.getByText('Your confirmed plan is safe.', { exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Garden Table', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review changes', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Keep confirmed plan', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Corner Café', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Food options', exact: true }).click(); await meal.getByRole('button', { name: 'Use Garden Table in draft', exact: true }).click(); await page.getByRole('button', { name: 'Review changes', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Accept changes', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click(); await expect(page.getByText('Your draft and confirmed plan are saved on this device.', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled(); await expect(page.getByRole('heading', { name: 'Garden Table', exact: true })).toBeVisible();
});

test('conflicting dietary rules remain strict even without a feasible draft', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).waitFor(); await page.getByRole('button', { name: 'Edit preferences', exact: true }).last().click();
  await page.getByRole('button', { name: 'Vegan', exact: true }).click(); await page.getByRole('button', { name: 'No onion', exact: true }).click(); await page.getByRole('button', { name: 'Your preferences', exact: true }).click(); await page.getByRole('button', { name: 'Build my day', exact: true }).click();
  await expect(page.getByText(/No test meal has evidence/)).toBeVisible(); await page.getByRole('button', { name: 'Food options', exact: true }).click();
  await expect(page.getByText(/Vegan: evidence is unknown/)).toBeVisible(); await expect(page.getByText(/No onion: evidence is unknown/)).toBeVisible();
  for (const name of ['Garden Table', 'Corner Café']) await expect(page.getByRole('button', { name: `Use ${name} in draft`, exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(page.getByText(/No test meal has evidence/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Confirm this plan', exact: true })).toHaveCount(0);
});

test('USD food comparison works on a phone and can retry a failed worker locally', async ({ page }) => {
  await page.addInitScript(() => { const OriginalWorker = window.Worker; window.Worker = class extends OriginalWorker { constructor(url: string | URL, options?: WorkerOptions) { if (String(url).includes('food-worker') && !(window as Window & { foodWorkerAvailable?: boolean }).foodWorkerAvailable) throw new Error('Simulated worker failure'); super(url, options); } }; });
  await page.setViewportSize({ width: 320, height: 760 }); await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).waitFor(); await page.getByRole('combobox', { name: 'Destination city', exact: true }).selectOption('harbor-test'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).waitFor();
  const apiRequests: string[] = []; page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  await page.getByRole('button', { name: 'Food options', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('unavailable'); await page.evaluate(() => Object.assign(window, { foodWorkerAvailable: true })); await page.getByRole('button', { name: 'Retry food comparison', exact: true }).click(); await expect(page.getByText('Fits this draft', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('America/New_York'); await expect(page.getByRole('dialog')).toContainText('$30.00–$40.00');
  expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); expect(apiRequests).toEqual([]);
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Confirm this plan', exact: true })).toBeVisible();
});

test('reported progress cannot be replaced through food comparisons', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click(); await page.getByRole('button', { name: 'Travel assistant', exact: true }).click(); await page.getByRole('button', { name: 'Use my confirmed plan', exact: true }).click(); await page.getByRole('combobox', { name: 'Completed stops', exact: true }).selectOption('1'); await page.getByRole('button', { name: 'Record progress', exact: true }).click(); await page.keyboard.press('Escape');
  const before = await page.locator('.stop-time').allTextContents(); await page.getByRole('button', { name: 'Food options', exact: true }).click(); await expect(page.getByText(/Meal changes are locked/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Use Garden Table in draft', exact: true })).toBeDisabled(); await page.keyboard.press('Escape'); expect(await page.locator('.stop-time').allTextContents()).toEqual(before);
});
