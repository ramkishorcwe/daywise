import { activeAcceptedTrip } from './helpers/accepted-trips';
import { expect, test } from '@playwright/test';
import { setup } from './helpers/live-guide';

test('rounded admission and meal prices agree across review, budget, share and refresh on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page, true, true);
  await expect(page.getByLabel('Budget currency', { exact: true })).toHaveValue('INR');
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  const review = page.getByRole('region', { name: 'Guided itinerary review', exact: true }); await expect(review).toBeVisible();
  await expect(review).toContainText('Admission: ₹100.00 – ₹100.00 per person'); await expect(review).toContainText('Admission: ₹400.00 – ₹400.00 per person');
  await expect(review).toContainText('Food per person: ₹300.00 – ₹600.00'); await expect(review).toContainText('₹450 midpoint allowance');
  await expect(review).toContainText('Food for your group: ₹600.00 – ₹1,200.00');
  const price = page.getByRole('region', { name: 'Trip price summary', exact: true });
  await expect(price).toContainText('Included tickets & activities'); await expect(price).toContainText('₹1,000.00 – ₹1,000.00');
  await expect(price).toContainText('Included food & drinks'); await expect(price).toContainText('Per-person trip estimate');
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check(); await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  const before = await page.getByTestId('trip-price-range').textContent();
  await page.getByRole('button', { name: 'Share trip', exact: true }).click();
  const copy = page.getByRole('textbox', { name: 'Trip sharing preview', exact: true }); await expect(copy).toHaveValue(/Food per person: ₹300\.00 – ₹600\.00/); await expect(copy).toHaveValue(/foreign INR 1200/);
  await page.getByRole('checkbox', { name: 'Include price summary', exact: true }).uncheck(); await expect(copy).not.toHaveValue(/Food per person:|Admission:|Group price estimate:|foreign INR/);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect.poll(() => activeAcceptedTrip(page).then(trip => trip.acceptedGuide.budget.breakdown.food.maximum)).toBe(1200);
  await page.route('**/api/**', r => r.abort()); await page.reload(); await expect(review).toContainText('₹450 midpoint allowance'); await expect(page.getByTestId('trip-price-range')).toHaveText(before!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: 'artifacts/pricing-mobile.png', fullPage: true });
});
test('currency suggests foreign tariffs and compact converted prices respect the Indian override', async ({ page }) => {
  const state = await setup(page, false, true); await page.getByText('Group, budget and food preferences', { exact: true }).click();
  await page.getByLabel('Budget currency', { exact: true }).selectOption('USD'); await expect(page.getByText('Using foreign admission prices from USD.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); const review = page.getByRole('region', { name: 'Guided itinerary review', exact: true });
  await expect(review).toContainText('Admission: $7.00 – $7.00 per person'); await expect(review).toContainText('Admission: $13.00 – $13.00 per person'); await expect(review.locator('.guide-timeline')).not.toContainText('reference rate; rounded upward');
  await page.getByLabel('Admission visitor category', { exact: true }).selectOption('indian'); await page.getByRole('button', { name: 'Recalculate my day', exact: true }).click();
  await expect(review).toContainText('Admission: $2.00 – $2.00 per person'); await expect(review).toContainText('Admission: $5.00 – $5.00 per person');
  expect(state.inputs.at(-1)!.preferences).toMatchObject({ visitorPricing: 'indian', currency: 'USD' }); await expect(page.getByLabel('Budget currency', { exact: true })).toHaveValue('USD');
});
test('meal tier edits update food allowances and disabling meals removes their cost only', async ({ page }) => {
  await setup(page, true, true); await page.getByLabel('Meal price preference', { exact: true }).selectOption('budget');
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); const review = page.getByRole('region', { name: 'Guided itinerary review', exact: true });
  await expect(review).toContainText('Food per person: ₹150.00 – ₹300.00'); await expect(review).toContainText('₹230 midpoint allowance');
  await page.getByRole('checkbox', { name: 'Include meal', exact: true }).uncheck(); await page.getByRole('button', { name: 'Recalculate my day', exact: true }).click();
  await expect(review).not.toContainText('Food per person:'); await expect(review).toContainText('Nahargarh Fort');
  await expect(page.getByRole('region', { name: 'Trip price summary' }).locator('dl div').filter({ hasText: 'Included food & drinks' })).toContainText('₹0.00 – ₹0.00');
});
