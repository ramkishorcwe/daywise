import { expect, test } from '@playwright/test';
import { setup } from './helpers/live-guide';
import { savedAcceptedTrips } from './helpers/accepted-trips';

test('guide discovers real candidates, reviews unknown costs, keeps numbering synchronized and requires review before acceptance', async ({ page }) => {
  await setup(page); await expect(page.getByRole('combobox', { name: 'Visit 1', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Add another visit', exact: true })).toHaveCount(0); await expect(page.getByRole('combobox', { name: 'Guide attraction', exact: true })).toHaveCount(0); await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  const review = page.getByRole('region', { name: 'Guided itinerary review', exact: true }); await expect(review).toBeVisible(); await expect(review).toContainText('Full cost is unknown');
  await expect(page.getByRole('button', { name: 'Accept this guided itinerary', exact: true })).toBeDisabled();
  await review.getByRole('button', { name: 'Highlight Provider Garden on map', exact: true }).click(); await expect(review.locator('.guide-highlight')).toContainText('Provider Garden');
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check(); await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
});
test('manual rearrangement waits for recalculation and preserves order until explicit optimization', async ({ page }) => {
  const state = await setup(page); await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  await page.getByText('Adjust the planned visits', { exact: true }).click(); await page.getByRole('button', { name: 'Move Provider Museum up', exact: true }).click();
  await page.waitForTimeout(1400); // Exceeds the former automatic recalculation delay.
  expect(state.inputs).toHaveLength(1);
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Recalculate my day', exact: true }).click();
  await expect.poll(() => state.inputs.length).toBe(2); expect(state.inputs[1].orderMode).toBe('manual'); expect(state.inputs[1].stops[0].locationId).toBe(state.bank[0].location.id);
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toContainText('Your order was preserved');
  await page.getByRole('button', { name: 'Optimize route', exact: true }).click(); await expect.poll(() => state.inputs.length).toBe(3); expect(state.inputs[2].orderMode).toBe('smart');
});

test('form edits never plan automatically before or after a generated day', async ({ page }) => {
  const state = await setup(page);
  let discoveries = 0;
  page.on('request', request => { if (request.url().endsWith('/api/guide/discover')) discoveries++; });
  await page.getByRole('combobox', { name: 'Preferred pace', exact: true }).selectOption('relaxed');
  await page.getByRole('button', { name: 'gardens', exact: true }).click();
  await page.waitForTimeout(1400);
  expect(state.inputs).toHaveLength(0); expect(discoveries).toBe(0);
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  const review = page.getByRole('region', { name: 'Guided itinerary review', exact: true });
  await expect(review).toBeVisible();
  await page.getByLabel('Return by', { exact: true }).fill('19:30');
  await page.getByRole('combobox', { name: 'Preferred pace', exact: true }).selectOption('packed');
  await page.getByRole('button', { name: 'museums', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Include meal', exact: true }).uncheck();
  await page.getByText('Adjust the planned visits', { exact: true }).click();
  await page.getByLabel('Visit duration for Provider Garden', { exact: true }).fill('45');
  await page.waitForTimeout(1400);
  expect(state.inputs).toHaveLength(1); expect(discoveries).toBe(1);
  await expect(review).toHaveCount(0);
  await page.getByRole('button', { name: 'Recalculate my day', exact: true }).click();
  await expect(review).toBeVisible();
  expect(state.inputs).toHaveLength(2);
  expect(state.inputs[1]).toMatchObject({ endTime: '19:30', preferences: { pace: 'packed', mealBreak: false } });
  expect(state.inputs[1].preferences.interests).toEqual(expect.arrayContaining(['gardens', 'museums']));
  expect(state.inputs[1].stops.find(row => row.locationId === state.bank[1].location.id)?.durationMinutes).toBe(45);
  await page.waitForTimeout(1400);
  expect(state.inputs).toHaveLength(2); expect(discoveries).toBe(1);
});
test('guide route failures remove stale previews and leave edits and retry available', async ({ page }) => {
  await setup(page); await page.route('**/api/guide/plan', r => r.fulfill({ status: 502, json: { error: { code: 'PROVIDER_UNAVAILABLE', message: 'Google comparison unavailable. Retry.' } } }));
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Google comparison unavailable'); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeEnabled();
});
test('guide locks, preferred times, exclusion and phone layout remain editable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const state = await setup(page);
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible(); await page.getByText('Adjust the planned visits', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Lock Provider Museum in this position', exact: true }).check(); await expect(page.getByRole('button', { name: 'Move Provider Museum down', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Must visit Provider Museum', exact: true }).check(); await page.getByLabel('Preferred arrival at Provider Museum', { exact: true }).fill('11:00'); await page.getByRole('button', { name: 'Recalculate my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  expect(state.inputs.at(-1)!.stops.find(s => s.locationId === state.bank[0].location.id)).toMatchObject({ mustVisit: true, locked: true, preferredTime: '11:00' }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('optional meals, Any food, map highlights, saved preferences and manual edits work on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await setup(page, true);
  await page.getByText('Group, budget and food preferences', { exact: true }).click();
  await page.getByRole('button', { name: 'Vegetarian options', exact: true }).click();
  await page.getByRole('button', { name: 'Any food', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Any food', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Vegetarian options', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('Departure time', { exact: true }).fill('12:00');
  await page.getByLabel('Return by', { exact: true }).fill('21:00');
  await expect(page.getByRole('checkbox', { name: 'Include meal', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Include lunch', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Include dinner', exact: true })).toHaveCount(0);
  await page.getByText('Meal duration and detour limits', { exact: true }).click();
  await page.getByLabel('Meal duration (minutes)', { exact: true }).fill('50');
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  const review = page.getByRole('region', { name: 'Guided itinerary review', exact: true });
  await expect(review).toContainText('50 min meal'); await expect(review).not.toContainText('Dinner');
  await expect(review.locator('.guide-stop-title').filter({ hasText: 'Meal · Provider Lunch' })).toHaveCount(1);
  expect(state.inputs[0].preferences.dietaryRules).toEqual([]);
  expect(state.inputs[0].stops).toHaveLength(2); // Restaurants never become attraction-edit constraints.
  await review.getByRole('button', { name: 'Highlight Provider Lunch on map', exact: true }).click();
  await expect(review.locator('.guide-highlight')).toContainText('Provider Lunch');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Private day name', { exact: true }).fill('My day with meals');
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check();
  await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Completed visits', exact: true }).selectOption('3');
  await page.getByRole('button', { name: /Plan a trip/ }).click();
  await expect.poll(async () => (await savedAcceptedTrips(page)).length).toBe(1);
  const saved = await savedAcceptedTrips(page);
  expect(saved[0].guideSaved.preferences.meals.lunch.durationMinutes).toBe(50);
  expect(saved[0].guideSaved.preferences.mealBreak).toBe(true); expect(saved[0].guideSaved.preferences.meals).not.toHaveProperty('dinner');
  expect(saved[0].guideSaved.stops).toHaveLength(2); expect(saved[0].stops).toHaveLength(3);
  expect(JSON.stringify(saved)).not.toContain('"receipt":');
  await page.getByText('Adjust the planned visits', { exact: true }).click();
  await expect(page.getByLabel('Visit duration for Provider Lunch', { exact: true })).toHaveCount(0);
  await page.getByLabel('Visit duration for Provider Garden', { exact: true }).fill('40');
  await page.getByRole('button', { name: 'Recalculate my day', exact: true }).click();
  await expect.poll(() => state.inputs.length).toBe(2);
  expect(state.inputs[1].orderMode).toBe('manual'); expect(state.inputs[1].stops).toHaveLength(2);
  await expect(review).toContainText('50 min meal'); await expect(review).not.toContainText('Dinner');
});

test('an infeasible requested meal preserves the accepted itinerary and offers an actionable retry', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check();
  await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await page.getByRole('button', { name: /Plan a trip/ }).click();
  await page.getByRole('checkbox', { name: 'Include meal', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Recalculate my day', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  await page.route('**/api/guide/plan', r => r.fulfill({ status: 422, json: { error: { code: 'MEAL_INFEASIBLE', message: 'No nearby meal fits the detour limit. Adjust the duration or uncheck Include meal.' } } }));
  await page.getByRole('checkbox', { name: 'Include meal', exact: true }).check();
  await page.getByRole('button', { name: 'Recalculate my day', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No nearby meal fits');
  await page.getByRole('button', { name: 'Open accepted trip', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toContainText('Provider Museum');
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
});

test('unchecking Include meal removes the restaurant and saves the exclusion preference', async ({ page }) => {
  const state = await setup(page, true);
  await page.getByLabel('Departure time', { exact: true }).fill('12:00');
  await expect(page.getByRole('checkbox', { name: 'Include meal', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Include meal time', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  const review = page.getByRole('region', { name: 'Guided itinerary review', exact: true });
  await expect(review.locator('.guide-stop-title').filter({ hasText: 'Meal · Provider Lunch' })).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'Include meal', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Recalculate my day', exact: true }).click();
  await expect.poll(() => state.inputs.length).toBe(2);
  await expect(review.locator('.guide-stop-title').filter({ hasText: 'Meal · Provider Lunch' })).toHaveCount(0);
  await expect(review).not.toContainText('Provider Lunch');
  expect(state.inputs[1].preferences.mealBreak).toBe(false);
  expect(state.inputs[1].preferences.meals.lunch.enabled).toBe(false);
  await page.getByLabel('Private day name', { exact: true }).fill('Day without a meal');
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check();
  await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect.poll(async () => (await savedAcceptedTrips(page)).length).toBe(1);
  const saved = await savedAcceptedTrips(page);
  expect(saved[0].guideSaved.preferences.mealBreak).toBe(false);
  expect(saved[0].guideSaved.preferences.meals).not.toHaveProperty('dinner');
  expect(saved[0].stops).toHaveLength(2);
});
