import { expect, test } from '@playwright/test';
import { setup } from './helpers/live-guide';
import { savedAcceptedTrips } from './helpers/accepted-trips';
const advisory = 'Festival traffic advisories';

for (const width of [390, 1440]) test(`festival notices follow draft dates without planning or saving at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await setup(page, false, true);
  let discoveries = 0;
  page.on('request', r => { if (r.url().endsWith('/api/guide/discover')) discoveries++; });
  await page.getByLabel('Travel date', { exact: true }).fill('2027-04-09');
  const notice = page.getByRole('complementary', { name: advisory });
  await expect(notice).toContainText('Possible festival traffic');
  await expect(notice).toContainText('Gangaur');
  await expect(notice).toContainText('Tripolia Bazaar');
  await expect(notice).toContainText('not a confirmed road closure');
  await expect(notice.getByRole('link', { name: 'Rajasthan Tourism calendar', exact: true })).toHaveAttribute('href', /tourism\.rajasthan\.gov\.in/);
  await expect(notice.locator('details')).not.toHaveAttribute('open');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await notice.screenshot({ path: `.tmp/festival-traffic-${width}.png` });
  await page.getByLabel('Travel date', { exact: true }).fill('2027-04-10'); await expect(notice).toContainText('Gangaur');
  await page.getByLabel('Travel date', { exact: true }).fill('2027-04-11'); await expect(notice).not.toContainText('Possible festival traffic');
  await notice.getByText('Festival coverage', { exact: true }).click(); await expect(notice).toContainText('even when no notice appears');
  await page.getByLabel('Travel date', { exact: true }).fill('2027-08-04'); await expect(notice).toContainText('Teej');
  await page.getByRole('combobox', { name: 'Destination city', exact: true }).fill('another city');
  await expect(notice).toHaveCount(0);
  await page.waitForTimeout(1300);
  expect(state.inputs).toHaveLength(0); expect(discoveries).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('daywise-live-active-v1'))).toBeNull();
  expect(await savedAcceptedTrips(page)).toHaveLength(0);
});

test('no Indian event is inferred for a destination in another country', async ({ page }) => {
  await setup(page);
  await page.getByLabel('Travel date', { exact: true }).fill('2026-10-20');
  const notice = page.getByRole('complementary', { name: advisory });
  await expect(notice).not.toContainText('Dussehra');
  await expect(notice).not.toContainText('Possible festival traffic');
  await notice.getByText('Festival coverage', { exact: true }).click();
  await expect(notice).toContainText('Reviewed calendar coverage is limited');
});

test('festival warning survives acceptance and reload, without following unrelated draft edits', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T00:00:00Z'));
  const state = await setup(page, false, true);
  await page.getByLabel('Travel date', { exact: true }).fill('2026-10-20');
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  const review = page.getByRole('region', { name: 'Guided itinerary review', exact: true });
  await expect(review.getByRole('complementary', { name: advisory })).toContainText('Dussehra');
  await expect(review).toContainText('No extra delay has been added to your schedule');
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check();
  await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(review).toBeVisible();
  await expect.poll(async () => (await savedAcceptedTrips(page)).length).toBe(1);
  const accepted = await page.evaluate(() => localStorage.getItem('daywise-live-active-v1'));
  await page.getByRole('button', { name: 'Plan a trip', exact: true }).click();
  await page.getByLabel('Travel date', { exact: true }).fill('2026-10-21');
  await expect(page.getByRole('complementary', { name: advisory })).not.toContainText('Possible festival traffic');
  await page.waitForTimeout(1300); expect(state.inputs).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('daywise-live-active-v1'))).toBe(accepted);
  await page.getByRole('button', { name: 'Open accepted trip', exact: true }).click();
  await expect(review.getByRole('complementary', { name: advisory })).toContainText('Dussehra');
  await expect(page.getByRole('region', { name: 'Whole journey map', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Trip price summary', exact: true })).toBeVisible();
  await page.reload();
  await expect(review.getByRole('complementary', { name: advisory })).toContainText('Dussehra');
  expect(state.inputs).toHaveLength(1);
});
