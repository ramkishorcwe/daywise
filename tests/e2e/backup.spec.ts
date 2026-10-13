import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function panel(page: Page) { await page.getByRole('button', { name: 'Saved plans', exact: true }).click(); await page.getByRole('button', { name: 'Backup & restore', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); }
async function backup(page: Page) { const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download private backup', exact: true }).click(); return readFile((await (await downloading).path())!, 'utf8'); }
async function choose(page: Page, text: string) { await page.getByLabel('Private backup file', { exact: true }).setInputFiles({ name: 'private-day.json', mimeType: 'application/json', buffer: Buffer.from(text) }); }

test('phone restore previews the draft and expenses before adding a separate durable copy', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 }); await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click();
  await page.getByRole('button', { name: 'Trip budget', exact: true }).click(); await page.getByRole('combobox', { name: 'Cost status', exact: true }).selectOption('actual'); await page.getByRole('textbox', { name: /Whole-category amount/ }).fill('200'); await page.getByRole('button', { name: 'Save category amount', exact: true }).click();
  await page.getByRole('button', { name: 'My day plan', exact: false }).click(); await page.getByRole('button', { name: 'Remove Heritage Gallery', exact: true }).click(); await panel(page);
  const text = await backup(page), value = JSON.parse(text); expect(value.kind).toBe('daywise-private-day'); expect(value.session.expenses.records[0].amountMinor).toBe(20000);
  await choose(page, text); await expect(page.getByRole('region', { name: 'Backup preview', exact: true }).getByRole('heading', { name: 'A day in Jaipur', exact: true })).toBeVisible();
  await expect(page.getByText('1 category records', { exact: true })).toBeVisible(); expect(await page.locator('.saved-card').count()).toBe(1);
  expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Restore as separate day', exact: true }).click(); await expect(page.getByText(/A restored copy was added to Saved plans/)).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.locator('.saved-card')).toHaveCount(2);
  await page.locator('.saved-card').filter({ hasText: '(restored)' }).getByRole('button', { name: 'Open plan', exact: true }).click(); await expect(page.getByText('Your confirmed plan is safe.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Trip budget', exact: true }).click(); await expect(page.getByTestId('actual-total')).toHaveText('₹200.00');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click(); await page.reload(); await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Follow my day', exact: true }).click(); await expect(page.locator('.day-next h2')).toHaveText('Heritage Gallery');
  await page.getByRole('button', { name: 'Saved plans', exact: true }).click(); await expect(page.locator('.saved-card')).toHaveCount(2); await page.locator('.saved-card').filter({ hasText: '(restored)' }).getByRole('button', { name: 'Delete A day in Jaipur (restored)', exact: true }).click(); await page.getByRole('button', { name: 'Delete saved copy', exact: true }).click(); await expect(page.locator('.saved-card')).toHaveCount(1);
  await page.locator('.saved-card').getByRole('button', { name: 'Open plan', exact: true }).click(); await page.getByRole('button', { name: 'Trip budget', exact: true }).click(); await expect(page.getByTestId('actual-total')).toHaveText('₹200.00');
});
test('a delayed-day backup preserves accepted times and progress without reconnecting its old backend', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click(); await page.getByRole('button', { name: 'Travel assistant', exact: true }).click(); await page.getByRole('button', { name: 'Use my confirmed plan', exact: true }).click();
  await page.getByRole('combobox', { name: 'Completed stops', exact: true }).selectOption('1'); await page.getByRole('button', { name: 'Record progress', exact: true }).click(); await page.getByRole('button', { name: 'Delay 30 minutes', exact: true }).click(); await page.getByRole('button', { name: 'Accept revision', exact: true }).click(); await page.keyboard.press('Escape');
  const times = await page.locator('.stop-time').allTextContents(); await panel(page); const text = await backup(page); const value = JSON.parse(text); expect(value.session.assistant.tripId).toBeNull();
  await choose(page, text); await expect(page.getByText('1 stops · offline snapshot', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Restore as separate day', exact: true }).click(); await expect(page.getByText(/A restored copy was added/)).toBeVisible(); await page.keyboard.press('Escape');
  await page.locator('.saved-card').filter({ hasText: '(restored)' }).getByRole('button', { name: 'Open plan', exact: true }).click(); expect(await page.locator('.stop-time').allTextContents()).toEqual(times);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click(); await page.reload(); await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled(); expect(await page.locator('.stop-time').allTextContents()).toEqual(times);
  await page.getByRole('button', { name: 'Follow my day', exact: true }).click(); await expect(page.getByText('1 of 6', { exact: true })).toBeVisible(); await expect(page.getByText(/Progress stays on this device/)).toBeVisible();
  const requests: string[] = []; page.on('request', request => { if (request.url().includes('/api/')) requests.push(request.url()); });
  await page.getByRole('button', { name: 'Report progress or a delay', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('No backend connection is attached'); await expect(page.getByRole('button', { name: 'Use my confirmed plan', exact: true })).toBeDisabled(); expect(requests).toEqual([]);
});
test('unsupported, connected, oversized and unrelated files cannot add or replace saved days', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click(); await panel(page); const text = await backup(page), value = JSON.parse(text);
  for (const file of ['<html>travel copy</html>', JSON.stringify({ ...value, formatVersion: 2 }), JSON.stringify({ ...value, session: { ...value.session, input: { ...value.session.input, cityId: 'unsupported-city' }, confirmed: null } }), JSON.stringify({ ...value, session: { ...value.session, assistant: { tripId: '00000000-0000-4000-8000-000000000001', baseId: value.session.confirmed.id } } })]) {
    await choose(page, file); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByRole('button', { name: 'Restore as separate day', exact: true })).toHaveCount(0); expect(await page.locator('.saved-card').count()).toBe(1);
  }
  await choose(page, 'x'.repeat(1_048_577)); await expect(page.getByRole('alert')).toContainText('no larger than 1 MiB');
  await choose(page, text); await expect(page.getByRole('button', { name: 'Restore as separate day', exact: true })).toBeVisible();
  await page.evaluate(id => { crypto.randomUUID = () => id as ReturnType<Crypto['randomUUID']>; }, value.session.id);
  await page.getByRole('button', { name: 'Restore as separate day', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('could not be saved'); expect(await page.locator('.saved-card').filter({ hasText: '(restored)' }).count()).toBe(0);
  await page.keyboard.press('Escape'); await page.reload(); await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled(); await page.getByRole('button', { name: 'Saved plans', exact: true }).click(); await expect(page.locator('.saved-card')).toHaveCount(1); await expect(page.locator('.saved-card h2')).toHaveText('A day in Jaipur');
});
test('USD draft backups work, and a failed restore leaves a valid preview for retry', async ({ page }) => {
  await page.addInitScript(() => { const original = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function(value, key) { if (value.title?.endsWith('(restored)')) throw new DOMException('Simulated exhausted storage', 'QuotaExceededError'); return original.call(this, value, key); }; });
  await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).waitFor(); await page.getByRole('combobox', { name: 'Destination city', exact: true }).selectOption('harbor-test'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).waitFor(); await panel(page);
  const text = await backup(page); expect(JSON.parse(text).session.input.currency).toBe('USD'); await choose(page, text); await expect(page.getByText('No accepted plan · draft only', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore as separate day', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('could not be saved'); await expect(page.getByRole('button', { name: 'Restore as separate day', exact: true })).toBeEnabled(); expect(await page.locator('.saved-card').filter({ hasText: '(restored)' }).count()).toBe(0);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'My day plan', exact: false }).click(); await expect(page.getByRole('button', { name: 'Confirm this plan', exact: true })).toBeVisible(); await expect(page.locator('.budget-total')).toContainText('$');
});
