import { expect, test } from '@playwright/test';
import { setup } from './helpers/live-guide';
import { localTripKey } from '../../apps/web/src/live-session';

test('acceptance works when deferred view files become unavailable and survives reload', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  const lateLoads: string[] = [];
  await page.route(/\/(?:src\/components\/(?:LiveProgress|JourneyMap)|src\/journey-links|assets\/(?:LiveProgress|JourneyMap|journey-links)).*\.(?:tsx?|js)(?:\?.*)?$/, route => { lateLoads.push(route.request().url()); return route.fulfill({ status: 404, body: 'Unavailable previous release' }); });
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check();
  await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Whole journey map', exact: true })).toBeVisible();
  expect(lateLoads).toEqual([]);
  const accepted = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).acceptedId, localTripKey);
  expect(accepted).toBeTruthy();
  await page.unrouteAll({ behavior: 'wait' }); await page.reload();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).acceptedId, localTripKey)).toBe(accepted);
});

test('missing sharing module shows recovery and preserves the accepted trip', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check();
  await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
  const accepted = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).acceptedId, localTripKey);
  await page.route('**/src/components/ShareTrip.tsx*', route => route.fulfill({ status: 404, body: 'Unavailable previous release' }));
  await page.getByRole('button', { name: 'Share trip', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reload Daywise to continue', exact: true })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).acceptedId, localTripKey)).toBe(accepted);
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByRole('button', { name: 'Reload Daywise', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
});
