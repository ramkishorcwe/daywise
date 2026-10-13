import { expect, test, type Page } from '@playwright/test';

async function library(page: Page) {
  await page.getByRole('button', { name: 'Saved plans', exact: true }).click();
  await expect(page.getByLabel('Search saved days', { exact: true })).toBeVisible();
  await expect(page.locator('.saved-results')).not.toContainText('Loading saved days');
}
async function createCopy(page: Page, source: string, title: string, date: string) {
  await page.getByRole('button', { name: `Reuse ${source}`, exact: true }).click();
  await page.getByLabel('New day name', { exact: true }).fill(title);
  await page.getByLabel('New travel date', { exact: true }).fill(date);
  await page.getByRole('button', { name: 'Create saved draft', exact: true }).click();
  await expect(page.getByText(/A separate draft was added/)).toBeVisible();
  await page.keyboard.press('Escape');
}
async function storedDays(page: Page) {
  return page.evaluate(() => new Promise<unknown[]>((resolve, reject) => {
    const opening = indexedDB.open('daywise-m1', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result, request = db.transaction('sessions').objectStore('sessions').getAll();
      request.onsuccess = () => { db.close(); resolve(request.result.sort((a, b) => a.id.localeCompare(b.id))); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  }));
}
async function pastDay(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit preferences', exact: true }).last().click();
  await page.getByLabel('Travel date', { exact: true }).fill('2026-10-11');
  await page.getByRole('button', { name: 'Your preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Build my day', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click();
}

test('combined search, city/status filters and travel-date sorting preserve every saved record', async ({ page }) => {
  await pastDay(page); await library(page);
  await createCopy(page, 'A day in Jaipur', 'Late family outing', '2026-10-18');
  await createCopy(page, 'A day in Jaipur', 'Early family outing', '2026-10-14');
  await page.getByRole('button', { name: 'My day plan', exact: false }).click();
  await page.getByRole('combobox', { name: 'Destination city' }).selectOption('harbor-test');
  await page.getByRole('button', { name: 'Confirm this plan', exact: true }).waitFor(); await library(page);
  await expect(page.locator('.saved-card')).toHaveCount(4);
  const before = await storedDays(page);
  await page.getByLabel('Search saved days', { exact: true }).fill('  FAMILY 2026-10  ');
  await page.getByLabel('Saved city', { exact: true }).selectOption('jaipur-test');
  await page.getByLabel('Saved day status', { exact: true }).selectOption('draft');
  await page.getByLabel('Sort saved days', { exact: true }).selectOption('date_asc');
  await expect(page.locator('.saved-results')).toContainText('Showing 2 of 4 saved days');
  await expect(page.locator('.saved-card h2')).toHaveText(['Early family outing', 'Late family outing']);
  await page.getByLabel('Sort saved days', { exact: true }).selectOption('date_desc');
  await expect(page.locator('.saved-card h2')).toHaveText(['Late family outing', 'Early family outing']);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('.saved-card')).toHaveCount(4);
  await expect(page.getByLabel('Sort saved days', { exact: true })).toHaveValue('date_desc');
  await page.getByLabel('Saved day status', { exact: true }).selectOption('confirmed');
  await expect(page.locator('.saved-card h2')).toHaveText(['A day in Jaipur']);
  await page.getByLabel('Search saved days', { exact: true }).fill('not in this collection');
  await expect(page.getByRole('heading', { name: 'No saved days match these filters', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No saved days yet', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show all saved days', exact: true }).click();
  await expect(page.locator('.saved-card')).toHaveCount(4);
  expect(await storedDays(page)).toEqual(before);
  await page.getByLabel('Saved city', { exact: true }).selectOption('harbor-test');
  await page.locator('.saved-card').getByRole('button', { name: 'Open plan', exact: true }).click();
  await expect(page.locator('.budget-total')).toContainText('$');
  await expect(page.getByRole('button', { name: 'Confirm this plan', exact: true })).toBeVisible();
});

test('manual progress/return filters stay distinct and deleting a filtered draft affects only that day', async ({ page }) => {
  await pastDay(page); await page.getByRole('button', { name: 'Follow my day', exact: true }).click();
  await page.getByRole('button', { name: 'Local day updates', exact: true }).click();
  await page.getByLabel('Completed stops locally', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Record local progress', exact: true }).click();
  await expect(page.getByText(/Local progress saved/)).toBeVisible(); await page.keyboard.press('Escape'); await library(page);
  await page.getByLabel('Saved day status', { exact: true }).selectOption('progress');
  await expect(page.locator('.saved-card')).toContainText('PROGRESS REPORTED');
  await page.getByLabel('Saved day status', { exact: true }).selectOption('confirmed');
  await expect(page.getByRole('heading', { name: 'No saved days match these filters', exact: true })).toBeVisible();
  await page.getByLabel('Saved day status', { exact: true }).selectOption('progress');
  await page.locator('.saved-card').getByRole('button', { name: 'Open plan', exact: true }).click();
  await page.getByRole('button', { name: 'Follow my day', exact: true }).click();
  await page.getByRole('button', { name: 'Local day updates', exact: true }).click();
  await page.getByLabel('Completed stops locally', { exact: true }).selectOption('6');
  await page.getByRole('button', { name: 'Record local progress', exact: true }).click();
  await expect(page.getByText(/Local progress saved/)).toBeVisible(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Report return arrival', exact: true }).click();
  await page.getByLabel('Return arrival time', { exact: true }).fill('17:00');
  await page.getByRole('button', { name: 'Save return report', exact: true }).click();
  await expect(page.getByText(/Return report saved on this device/)).toBeVisible(); await page.keyboard.press('Escape'); await library(page);
  await page.getByLabel('Saved day status', { exact: true }).selectOption('returned');
  await expect(page.locator('.saved-card')).toContainText('RETURN REPORTED');
  await createCopy(page, 'A day in Jaipur', 'A separate draft', '2026-10-15');
  await expect(page.locator('.saved-results')).toContainText('Showing 1 of 2 saved days');
  await page.getByLabel('Saved day status', { exact: true }).selectOption('draft');
  await expect(page.locator('.saved-card h2')).toHaveText(['A separate draft']);
  await page.getByRole('button', { name: 'Delete A separate draft', exact: true }).click();
  await page.getByRole('button', { name: 'Delete saved copy', exact: true }).click();
  await expect(page.locator('.saved-results')).toContainText('Showing 0 of 1 saved days');
  await page.getByRole('button', { name: 'Show all saved days', exact: true }).click();
  await expect(page.locator('.saved-card')).toContainText('RETURN REPORTED');
  const records = await storedDays(page) as { completion?: unknown }[];
  expect(records).toHaveLength(1); expect(records[0].completion).toBeDefined();
});

test('phone search supports Unicode names and city filters while failed refresh preserves loaded cards', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 }); await page.goto('/');
  await page.getByRole('button', { name: 'Confirm this plan', exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Destination city' }).selectOption('harbor-test');
  await page.getByRole('button', { name: 'Confirm this plan', exact: true }).waitFor(); await library(page);
  await createCopy(page, 'A day in Harbor City', `Café ${'S'.repeat(140)}`, '2026-10-15');
  await page.getByLabel('Search saved days', { exact: true }).fill('Cafe\u0301 harbor 2026-10-15');
  await page.getByLabel('Saved city', { exact: true }).selectOption('harbor-test');
  await page.getByLabel('Saved day status', { exact: true }).selectOption('draft');
  await expect(page.locator('.saved-results')).toContainText('Showing 1 of 3 saved days');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function() { IDBObjectStore.prototype.getAll = original; throw new DOMException('Simulated read failure', 'UnknownError'); };
  });
  await page.getByRole('button', { name: 'Refresh saved days', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Saved days could not be refreshed');
  await expect(page.locator('.saved-card')).toHaveCount(1);
  await expect(page.getByLabel('Saved city', { exact: true })).toHaveValue('harbor-test');
  await page.getByLabel('Search saved days', { exact: true }).fill('no matching name');
  await expect(page.getByRole('heading', { name: 'No saved days match these filters', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh saved days', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No saved days match these filters', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show all saved days', exact: true }).click();
  await expect(page.locator('.saved-card')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
