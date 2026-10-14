import { expect, test } from '@playwright/test';
import { setup } from './helpers/live-guide';
test('a 23-second itinerary response completes once instead of showing backend unavailable at 20 seconds', async ({ page }) => {
  test.setTimeout(45000); const state = await setup(page, true);
  await page.route('**/api/guide/plan', async route => { await new Promise(resolve => setTimeout(resolve, 23000)); await route.fallback(); });
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible({ timeout: 30000 });
  expect(state.inputs).toHaveLength(1); await expect(page.getByRole('alert').filter({ hasText: 'backend is unavailable' })).toHaveCount(0);
});
test('planning timeout shows retry, sends no duplicate request and preserves the accepted day', async ({ page }) => {
  await page.addInitScript(() => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = ms => timeout(ms === 80000 && (window as any).shortPlanTimeout ? 350 : ms);
  });
  await setup(page); await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check(); await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('daywise-live-active-v1')!).acceptedId)).toBeTruthy();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('daywise-live-active-v1')!).acceptedGuide);
  await page.getByRole('button', { name: /My day plan/ }).click(); await page.evaluate(() => { (window as any).shortPlanTimeout = true; });
  let calls = 0; await page.route('**/api/guide/plan', async route => { calls++; await new Promise(resolve => setTimeout(resolve, 1000)); await route.abort().catch(() => {}); });
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Itinerary planning took longer than 80 seconds'); await expect(page.getByRole('alert')).not.toContainText('backend is unavailable');
  await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeEnabled(); expect(calls).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('daywise-live-active-v1')!).acceptedGuide)).toEqual(before);
});
