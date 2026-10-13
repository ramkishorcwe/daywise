import { expect, test } from '@playwright/test';

test('connect, save private preferences, confirm a server plan, restore and delete it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Confirm this plan', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Data connections', exact: true }).click();
  await page.getByRole('button', { name: 'Connect backend', exact: true }).click();
  await expect(page.getByText('Authenticated session', { exact: true })).toBeVisible();
  await expect(page.getByText('Routing not configured', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save current preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Review server plan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review before confirming' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm backend plan', exact: true }).click();
  await expect(page.getByText(/revision 1 · confirmed snapshot/)).toBeVisible();
  await page.getByRole('button', { name: 'Open preferences', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const calculation = page.waitForResponse(response => response.url().includes('/api/plans/preview') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Replan draft', exact: true }).click();
  expect((await calculation).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Confirm this plan', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Data connections', exact: true }).click();
  await page.getByRole('button', { name: 'Connect backend', exact: true }).click();
  await expect(page.getByText(/revision 1 · confirmed snapshot/)).toBeVisible();
  await page.getByRole('button', { name: /^Delete backend trip / }).click();
  await page.getByRole('button', { name: 'Delete backend trip', exact: true }).click();
  await expect(page.getByText('No backend trips in this session.', { exact: true })).toBeVisible();
});

test('phone connection dialog and backend failure retain the local confirmed plan', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click();
  await page.getByRole('button', { name: 'Data connections', exact: true }).click();
  await page.getByRole('button', { name: 'Connect backend', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.route('**/api/plans/preview', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Simulated backend interruption.' } }) }));
  await page.getByRole('button', { name: 'Replan draft', exact: true }).click();
  await expect(page.getByText('Simulated backend interruption.', { exact: true })).toBeVisible();
  await expect(page.getByText('Your confirmed plan is safe.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep confirmed plan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled();
});
