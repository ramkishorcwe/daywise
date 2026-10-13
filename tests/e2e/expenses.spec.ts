import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function saveAmount(page: Page, category: string, status: string, amount: string) {
  await page.getByRole('combobox', { name: 'Expense category', exact: true }).selectOption(category);
  await page.getByRole('combobox', { name: 'Cost status', exact: true }).selectOption(status);
  await page.getByRole('textbox', { name: /Whole-category amount/ }).fill(amount);
  await page.getByRole('button', { name: 'Save category amount', exact: true }).click();
}
test('phone expense totals replace estimates, survive offline reload and export a private local copy', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 }); await page.goto('/');
  await page.getByRole('button', { name: 'Trip budget', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirm a day to track costs.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review my itinerary', exact: true }).click(); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click();
  await page.getByRole('button', { name: 'Trip budget', exact: true }).click();
  const original = await page.locator('.budget-total').textContent();
  await saveAmount(page, 'tickets', 'booked', '100'); await expect(page.getByTestId('booked-total')).toHaveText('₹100.00');
  await saveAmount(page, 'tickets', 'actual', '0'); await expect(page.getByTestId('actual-total')).toHaveText('₹0.00'); await expect(page.getByTestId('booked-total')).toHaveText('₹0.00');
  await expect(page.getByText('Retained; actual takes precedence', { exact: false })).toBeVisible();
  const projection = await page.getByTestId('projected-total').textContent(); expect(projection).not.toBe(original);
  expect(await page.locator('.budget-total').textContent()).toBe(original);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.route('**/api/**', route => route.abort()); await page.reload();
  await page.getByRole('button', { name: 'Trip budget', exact: true }).click(); await expect(page.getByTestId('projected-total')).toHaveText(projection!);
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export this budget', exact: true }).click(); const download = await downloading;
  const data = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(data.scope).toBe('browser-budget'); expect(data.expenses.records).toHaveLength(2); expect(data.confirmed.plan.dataMode).toBe('fixture'); expect(JSON.stringify(data)).not.toContain('token');
  await page.getByRole('button', { name: 'Remove Tickets & activities actual', exact: true }).click(); await expect(page.getByTestId('booked-total')).toHaveText('₹100.00');
  await page.getByRole('button', { name: 'Remove Tickets & activities booked', exact: true }).click(); await expect(page.getByTestId('projected-total')).toHaveText(original!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('drafts keep reported costs; accepting a revision requires individual expense review', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click(); await page.getByRole('button', { name: 'Trip budget', exact: true }).click();
  await saveAmount(page, 'food', 'actual', '200'); const before = await page.getByTestId('projected-total').textContent();
  await page.getByRole('button', { name: 'My day plan', exact: false }).click(); await page.getByRole('button', { name: 'Remove Heritage Gallery', exact: true }).click();
  await page.getByRole('button', { name: 'Trip budget', exact: true }).click(); await expect(page.getByTestId('projected-total')).toHaveText(before!);
  await page.getByRole('button', { name: 'My day plan', exact: false }).click(); await page.getByRole('button', { name: 'Review changes', exact: true }).click(); await page.getByRole('button', { name: 'Accept changes', exact: true }).click();
  await page.getByRole('button', { name: 'Trip budget', exact: true }).click(); await expect(page.getByText('1 record(s) need review.', { exact: true })).toBeVisible(); await expect(page.getByTestId('actual-total')).toHaveText('₹0.00');
  await page.getByRole('button', { name: 'Edit Food & drinks actual', exact: true }).click(); await expect(page.getByRole('textbox', { name: /Whole-category amount/ })).toHaveValue('200.00');
  await page.getByRole('button', { name: 'Save category amount', exact: true }).click(); await expect(page.getByTestId('actual-total')).toHaveText('₹200.00'); await expect(page.getByText('1 record(s) need review.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'My day plan', exact: false }).click(); await page.getByRole('button', { name: 'Remove Corner Café', exact: true }).click(); await expect(page.getByRole('heading', { name: 'This day needs a small adjustment.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Trip budget', exact: true }).click(); await expect(page.getByTestId('actual-total')).toHaveText('₹200.00');
});
test('new cities and separate days start without old amounts; precision and overruns are explicit', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click(); await page.getByRole('button', { name: 'Trip budget', exact: true }).click(); await saveAmount(page, 'tickets', 'actual', '300');
  await page.getByRole('combobox', { name: 'Destination city', exact: true }).selectOption('harbor-test'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click(); await page.getByRole('button', { name: 'Trip budget', exact: true }).click();
  await expect(page.getByTestId('actual-total')).toHaveText('$0.00'); await expect(page.locator('.expense-records')).toHaveCount(0);
  await saveAmount(page, 'transport', 'actual', '1.234'); await expect(page.getByRole('alert')).toContainText('up to 2 decimal places');
  await saveAmount(page, 'transport', 'actual', '-1'); await expect(page.getByRole('alert')).toContainText('nonnegative');
  await saveAmount(page, 'transport', 'actual', '100000'); await expect(page.getByText(/over budget at the upper projection/)).toBeVisible(); await expect(page.getByTestId('actual-total')).toHaveText('$100,000.00');
  await page.getByRole('button', { name: 'Plan another day', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Trip budget', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Confirm a day to track costs.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Saved plans', exact: true }).click(); await page.locator('.saved-card').filter({ hasText: 'A day in Harbor City' }).filter({ hasText: 'CONFIRMED + DRAFT' }).getByRole('button', { name: 'Open plan', exact: true }).click(); await page.getByRole('button', { name: 'Trip budget', exact: true }).click(); await expect(page.getByTestId('actual-total')).toHaveText('$100,000.00');
  await page.getByRole('button', { name: 'Saved plans', exact: true }).click(); await page.locator('.saved-card').filter({ hasText: 'A day in Jaipur' }).getByRole('button', { name: 'Open plan', exact: true }).click(); await page.getByRole('button', { name: 'Trip budget', exact: true }).click(); await expect(page.getByTestId('actual-total')).toHaveText('₹300.00');
});

test('storage failures are visible and preserve reported amounts in memory when starting another day is blocked', async ({ page }) => {
  await page.addInitScript(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(value, key) { if (value.expenses) throw new DOMException('Simulated storage exhaustion', 'QuotaExceededError'); return original.call(this, value, key); }; });
  await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click(); await page.getByRole('button', { name: 'Trip budget', exact: true }).click(); await saveAmount(page, 'food', 'actual', '200');
  await expect(page.getByText('Not saved · storage unavailable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Plan another day', exact: true }).click(); await expect(page.getByText('Your current day could not be saved. Retry saving before starting another day.', { exact: true })).toBeVisible(); await expect(page.getByTestId('actual-total')).toHaveText('₹200.00');
  await page.getByRole('combobox', { name: 'Destination city', exact: true }).selectOption('harbor-test'); await expect(page.getByText('Your current day could not be saved. Retry saving before changing cities.', { exact: true })).toBeVisible(); await expect(page.getByRole('combobox', { name: 'Destination city', exact: true })).toHaveValue('jaipur-test');
});
