import { expect, test } from '@playwright/test';
import { setup } from './helpers/live-guide';
test('WhatsApp draft carries schedule and a public route, and map preview follows endpoint privacy choices', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page, true, true);
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Share trip', exact: true }).click();
  const dialog = page.getByRole('dialog'), link = dialog.getByRole('link', { name: 'Share itinerary on WhatsApp', exact: true });
  const first = new URL((await link.getAttribute('href'))!).searchParams.get('text')!;
  expect(first).toContain('Daywise itinerary'); expect(first).toContain('Meal · Provider Lunch'); expect(first).toContain('https://www.google.com/maps/dir/?'); expect(first).not.toContain('Provider start'); expect(first).not.toContain('127.0.0.1'); expect(first).toContain('Group estimate:');
  await dialog.getByText('WhatsApp message preview', { exact: true }).click(); await expect(dialog.getByRole('textbox', { name: 'WhatsApp message preview', exact: true })).toHaveValue(first);
  await dialog.getByRole('button', { name: 'Preview shared map', exact: true }).click(); const publicMap = dialog.getByRole('region', { name: 'Shared visit map', exact: true });
  await expect(publicMap.locator('[data-map-rendered=true]')).toBeVisible(); await expect(publicMap).not.toContainText('Provider start'); await expect(publicMap).toContainText('Nahargarh Fort');
  await dialog.getByRole('checkbox', { name: 'Include starting and return locations', exact: true }).check(); const fullMap = dialog.getByRole('region', { name: 'Whole journey map', exact: true }); await expect(fullMap).toContainText('Start · Provider start'); await expect(fullMap).toContainText('Return · Provider start');
  const full = new URL((await link.getAttribute('href'))!).searchParams.get('text')!; expect(full).toContain('Provider start'); expect(full).toContain('Whole journey map');
  await dialog.getByRole('checkbox', { name: 'Include price summary', exact: true }).uncheck(); expect(new URL((await link.getAttribute('href'))!).searchParams.get('text')).not.toContain('Group estimate:');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: 'artifacts/whatsapp-share-mobile.png', fullPage: true });
});
test('accepted whole-journey map, return point and highlight remain synchronized after refresh', async ({ page }) => {
  await setup(page, true); await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check(); await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  const journey = page.getByRole('region', { name: 'Whole journey map', exact: true }); await expect(journey.locator('[data-map-rendered=true]')).toBeVisible(); await expect(journey).toContainText('Provider Lunch');
  await journey.getByRole('button', { name: /Provider Lunch/ }).click(); await expect(page.locator('.guide-highlight')).toContainText('Provider Lunch');
  const url = await journey.getByRole('link', { name: 'Open whole journey in Google Maps', exact: true }).getAttribute('href'); const q = new URL(url!).searchParams; expect(q.get('origin')).toBe(q.get('destination')); expect(q.get('waypoints')?.split('|')).toHaveLength(3);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('daywise-live-active-v1')!).acceptedId)).toBeTruthy();
  await page.route('**/api/**', r => r.abort()); await page.reload(); await expect(journey).toContainText('Provider Lunch'); await expect(journey.getByRole('link', { name: 'Open whole journey in Google Maps', exact: true })).toHaveAttribute('href', url!);
});
