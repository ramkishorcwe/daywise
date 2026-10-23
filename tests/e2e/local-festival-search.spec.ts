import { expect, test, type Route } from '@playwright/test';
import { setup } from './helpers/live-guide';
function response(input: any, name = 'Published local procession') {
  return { city: input.city, month: input.month, checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), incomplete: false, sources: [{ title: 'Test-only organiser calendar', url: 'https://organiser.example/calendar' }], searchSuggestions: '<a href="https://www.google.com/search?q=local+festivals">Google Search</a>', events: [{ name, startsOn: `${input.month}-09`, endsOn: `${input.month}-10`, city: input.city.name, countryCode: input.city.countryCode, area: 'Published procession area', sourceUrl: 'https://organiser.example/calendar' }] };
}
for (const width of [390, 1440]) test(`any city uses sourced month results and compares dates locally at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 950 });
  const lookups: any[] = [];
  await page.route('**/api/festivals/search', async r => { const input = r.request().postDataJSON(); lookups.push(input); await r.fulfill({ json: response(input) }); });
  const state = await setup(page, false, false, true);
  await page.getByLabel('Travel date', { exact: true }).fill('2027-04-09');
  const check = page.locator('.local-festival-check');
  await expect(check).toContainText('Published local procession');
  expect(lookups).toHaveLength(1); expect(lookups[0]).toMatchObject({ city: { name: 'Provider city', countryCode: 'GB' }, month: '2027-04' });
  await expect(check.getByRole('link', { name: 'Date source', exact: true })).toHaveAttribute('href', 'https://organiser.example/calendar');
  const frame = check.getByTitle('Google Search suggestions for local festivals'); await expect(frame).toHaveAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox');
  await page.getByLabel('Travel date', { exact: true }).fill('2027-04-10'); await expect(check).toContainText('Published local procession');
  await page.getByLabel('Travel date', { exact: true }).fill('2027-04-11'); await expect(check).not.toContainText('Published local procession'); await expect(check).toContainText('Other events or traffic restrictions may still occur');
  await page.waitForTimeout(1400); expect(lookups).toHaveLength(1); expect(state.inputs).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem('daywise-live-active-v1'))).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('a stale month response cannot overwrite a newer selected month', async ({ page }) => {
  let first: Route | undefined;
  await page.route('**/api/festivals/search', async r => { const input = r.request().postDataJSON(); if (input.month === '2027-04') { first = r; return; } await r.fulfill({ json: response(input, 'New month celebration') }); });
  await setup(page, false, false, true);
  await page.getByLabel('Travel date', { exact: true }).fill('2027-04-09'); await expect.poll(() => !!first).toBe(true);
  await page.getByLabel('Travel date', { exact: true }).fill('2027-05-09'); await expect(page.locator('.local-festival-check')).toContainText('New month celebration');
  await first!.fulfill({ json: response(first!.request().postDataJSON(), 'Old month celebration') });
  await page.waitForTimeout(300); await expect(page.locator('.local-festival-check')).not.toContainText('Old month celebration');
});
test('quota failure is nonblocking, retries only on request, and does not interfere with itinerary planning', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/festivals/search', async r => { calls++; if (calls === 1) await r.fulfill({ status: 429, json: { error: { code: 'PROVIDER_QUOTA', message: 'Local festival search reached its quota. Your itinerary is unchanged.' } } }); else await r.fulfill({ json: { ...response(r.request().postDataJSON()), events: [] } }); });
  const state = await setup(page, false, false, true);
  const check = page.locator('.local-festival-check'); await expect(check).toContainText('reached its quota');
  await page.waitForTimeout(1500); expect(calls).toBe(1); expect(state.inputs).toHaveLength(0);
  await check.getByRole('button', { name: 'Retry festival check', exact: true }).click();
  await expect(check).toContainText('No additional source-backed festival dates'); expect(calls).toBe(2);
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  expect(state.inputs).toHaveLength(1); expect(calls).toBe(2);
});
