import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('phone travel copy follows acceptance rather than a draft and downloads without private costs', async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 760 }); await page.route('**/api/**', route => route.abort()); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Create travel copy', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click();
  await page.getByRole('button', { name: 'Trip budget', exact: true }).click();
  await page.getByRole('combobox', { name: 'Cost status', exact: true }).selectOption('actual'); await page.getByRole('textbox', { name: /Whole-category amount/ }).fill('6789.01'); await page.getByRole('button', { name: 'Save category amount', exact: true }).click();
  await page.getByRole('button', { name: 'My day plan', exact: false }).click(); await page.getByRole('button', { name: 'Remove Heritage Gallery', exact: true }).click();
  await page.getByRole('button', { name: 'Create travel copy', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Your unaccepted edits are excluded. This copy uses the accepted day.', { exact: true })).toBeVisible();
  const preview = page.getByRole('article', { name: 'Travel copy preview', exact: true }); await expect(preview.getByRole('heading', { name: 'Heritage Gallery', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Include estimated group budget', exact: true })).not.toBeChecked(); await expect(preview.locator('.travel-copy-budget')).toHaveCount(0);
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download travel copy', exact: true }).click(); const file = await downloading;
  expect(file.suggestedFilename()).toMatch(/^daywise-travel-copy-\d{4}-\d{2}-\d{2}\.html$/);
  const html = await readFile((await file.path())!, 'utf8'); expect(html).not.toContain('6789'); expect(html).not.toContain('dietaryRules'); expect(html).not.toContain('tripId'); expect(html).not.toContain('₹');
  const downloaded = await context.newPage(); const requests: string[] = []; downloaded.on('request', request => requests.push(request.url())); await downloaded.setContent(html);
  await expect(downloaded.getByRole('heading', { name: 'Heritage Gallery', exact: true })).toBeVisible();
  expect((await downloaded.locator('main').innerText()).replace(/\s+/g, ' ').trim()).toBe((await preview.innerText()).replace(/\s+/g, ' ').trim()); expect(requests).toEqual([]); await downloaded.close();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Review changes', exact: true }).click(); await page.getByRole('button', { name: 'Accept changes', exact: true }).click();
  await page.getByRole('button', { name: 'Create travel copy', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('article', { name: 'Travel copy preview' }).getByRole('heading', { name: 'Heritage Gallery', exact: true })).toHaveCount(0);
});
test('USD copy includes estimates only with consent, and printing isolates the preview', async ({ page, context }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).waitFor(); await page.getByRole('combobox', { name: 'Destination city', exact: true }).selectOption('harbor-test');
  await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click(); await page.getByRole('button', { name: 'Create travel copy', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('checkbox', { name: 'Include estimated group budget', exact: true }).check();
  const preview = page.getByRole('article', { name: 'Travel copy preview', exact: true }); await expect(preview).toContainText('America/New_York'); await expect(preview.locator('.travel-copy-budget')).toContainText('$');
  await page.evaluate(() => { window.print = () => { document.documentElement.dataset.printRequested = 'yes'; }; }); await page.getByRole('button', { name: 'Print travel copy', exact: true }).click(); expect(await page.evaluate(() => document.documentElement.dataset.printRequested)).toBe('yes');
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download travel copy', exact: true }).click(); const html = await readFile((await (await downloading).path())!, 'utf8');
  await page.emulateMedia({ media: 'print' }); await expect(preview).toBeVisible(); await expect(page.locator('.workspace')).toBeHidden(); await expect(page.locator('.sidebar')).toBeHidden(); await expect(page.getByRole('button', { name: 'Print travel copy', exact: true })).toBeHidden();
  expect(await page.getByRole('dialog').evaluate(element => getComputedStyle(element).overflow)).toBe('visible');
  const downloaded = await context.newPage(); await downloaded.setContent(html); await expect(downloaded.locator('.travel-copy-budget')).toContainText('$'); await downloaded.emulateMedia({ media: 'print' }); await expect(downloaded.locator('.travel-copy-anchor').last()).toContainText('Return'); await downloaded.close();
  await page.emulateMedia({ media: 'screen' }); await page.getByRole('checkbox', { name: 'Include estimated group budget', exact: true }).uncheck(); await expect(preview.locator('.travel-copy-budget')).toHaveCount(0);
  await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('Simulated file preparation failure'); }; window.print = () => { throw new Error('Simulated print failure'); }; });
  await page.getByRole('button', { name: 'Download travel copy', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('file could not be prepared'); await expect(preview).toContainText('A day in Harbor City');
  await page.getByRole('button', { name: 'Print travel copy', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Printing is unavailable'); await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled();
});
test('saved-day copies do not replace a separate active draft and budget consent resets', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click(); await page.getByRole('button', { name: 'Create travel copy', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Include estimated group budget', exact: true }).check(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Plan another day', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Create travel copy', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Saved plans', exact: true }).click(); const card = page.locator('.saved-card').filter({ hasText: 'CONFIRMED + DRAFT' }); await card.getByRole('button', { name: 'Travel copy for A day in Jaipur', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('checkbox', { name: 'Include estimated group budget', exact: true })).not.toBeChecked(); await expect(page.getByRole('article', { name: 'Travel copy preview' })).toContainText('Heritage Gallery');
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Create travel copy', exact: true })).toBeDisabled(); await page.getByRole('button', { name: 'Follow my day', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Confirm your day first', exact: true })).toBeVisible();
});
