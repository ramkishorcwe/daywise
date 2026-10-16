import { expect, test } from '@playwright/test';
import { setup } from './helpers/live-guide';

for (const width of [390, 1440]) test(`compact itinerary keeps essential stop details, photos and map navigation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const state = await setup(page, true, true);
  await page.route('**/api/guide/photo', route => route.fulfill({ json: { photo: { uri: 'https://lh3.googleusercontent.com/test-only-photo', authors: [{ name: 'Provider photographer', uri: 'https://maps.google.com/maps/contrib/123' }] } } }));
  await page.route('https://lh3.googleusercontent.com/test-only-photo', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480"><rect width="720" height="480" fill="#aac7b7"/><path d="M80 400V200h100v-80h120v80h120V100h100v300" fill="#587562"/></svg>' }));
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  const review = page.getByRole('region', { name: 'Guided itinerary review', exact: true });
  const card = review.locator('.guide-timeline > li').filter({ has: page.getByRole('button', { name: 'Highlight Nahargarh Fort on map', exact: true }) });
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole('img', { name: 'Nahargarh Fort', exact: true })).toBeVisible();
  await expect(card).toContainText('provider address'); await expect(card).toContainText('min visit'); await expect(card).toContainText('min from previous stop'); await expect(card).toContainText('min arrival buffer');
  await expect(card).toContainText('Admission: ₹100.00 – ₹100.00 per person');
  await expect(card).toContainText('Admission for your group: ₹200.00 – ₹200.00');
  await expect(card.getByRole('link', { name: 'Provider photographer', exact: true })).toHaveAttribute('href', 'https://maps.google.com/maps/contrib/123');
  await expect(card.getByRole('link', { name: 'Navigate this leg in Google Maps', exact: true })).toHaveAttribute('href', /google\.com\/maps/);
  for (const clutter of ['Evidence checked', 'Hours:', 'Selected from verified IDs', 'Accessibility unknown', 'Standard adult tariffs', 'reference rate', 'Suggested morning']) await expect(card).not.toContainText(clutter);
  await card.getByRole('button', { name: 'Highlight Nahargarh Fort on map', exact: true }).click(); await expect(card).toHaveClass('guide-highlight');
  await page.waitForTimeout(1200); expect(state.inputs).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card.screenshot({ path: `.tmp/compact-stop-${width}.png` });
});

test('unavailable photos leave the itinerary and acceptance usable', async ({ page }) => {
  await setup(page);
  await page.route('**/api/guide/photo', route => route.fulfill({ status: 502, json: { error: { code: 'PROVIDER_UNAVAILABLE', message: 'Photo unavailable' } } }));
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  const photo = page.getByRole('figure', { name: 'Photo of Provider Garden', exact: true }); await photo.scrollIntoViewIfNeeded(); await expect(photo).toContainText('Photo unavailable');
  await expect(page.locator('.guide-timeline')).toContainText('Admission: unknown; not assumed free.');
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check();
  await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toContainText('Provider Garden');
});
