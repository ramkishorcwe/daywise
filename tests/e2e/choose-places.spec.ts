import { expect, test } from '@playwright/test';
import { setup } from './helpers/live-guide';

const key = 'daywise-live-active-v1';
async function open(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Choose my places', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose your places', exact: true })).toBeVisible();
}

test('category browsing and edits never plan; chosen visits optimize explicitly and only acceptance saves', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { inputs } = await setup(page, true);
  const discoveries: string[][] = [];
  page.on('request', r => { if (r.url().endsWith('/guide/discover')) { expect(r.postDataJSON().chosenPlaces).toBe(true); discoveries.push(r.postDataJSON().preferences.interests); } });
  await open(page); expect(discoveries).toHaveLength(0);
  await page.getByRole('button', { name: 'museums', exact: true }).click();
  await page.getByRole('button', { name: 'Add Provider Museum', exact: true }).click();
  await page.getByRole('button', { name: 'gardens', exact: true }).click();
  await page.getByRole('button', { name: 'Add Provider Garden', exact: true }).click();
  await page.getByLabel('Minutes at Provider Museum', { exact: true }).fill('55');
  await expect(page.getByRole('button', { name: 'Added', exact: true })).toHaveCount(2);
  expect(discoveries).toEqual([['museums'], ['gardens']]); expect(inputs).toHaveLength(0);
  await page.locator('.choose-places-page').screenshot({ path: '.tmp/choose-places-1440.png' });
  expect(await page.evaluate(k => localStorage.getItem(k), key)).toBeNull();
  await page.getByRole('button', { name: 'Back to day planner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your day starts here.', exact: true })).toBeVisible();
  await open(page); await expect(page.getByLabel('Minutes at Provider Museum', { exact: true })).toHaveValue('55');
  await page.getByRole('button', { name: 'Optimize route', exact: true }).click();
  const review = page.getByRole('region', { name: 'Guided itinerary review', exact: true }); await expect(review).toBeVisible();
  expect(inputs).toHaveLength(1); expect(inputs[0]).toMatchObject({ chosenPlaces: true, returnToStart: true, endId: null, preferences: { interests: [], useAI: false, mealBreak: true } });
  expect(inputs[0].stops).toHaveLength(2); expect(inputs[0].stops.every(row => row.mustVisit && row.durationSource === 'user')).toBe(true); expect(inputs[0].stops[0].durationMinutes).toBe(55);
  await expect(review).toContainText('Provider Museum'); await expect(review).toContainText('Provider Garden'); await expect(review).toContainText('Provider Lunch');
  await review.getByRole('button', { name: 'Highlight Provider Museum on map', exact: true }).click(); await expect(review.locator('.guide-highlight')).toContainText('Provider Museum');
  await expect(page.locator('.choose-route-review [data-map-rendered=true]')).toHaveCount(1);
  expect(await page.evaluate(k => localStorage.getItem(k), key)).toBeNull();
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check();
  await page.getByRole('button', { name: 'Accept my chosen itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
  const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!), key);
  expect(saved.acceptedGuide.itinerary.stops).toHaveLength(3); expect(saved.guideSaved.stops).toHaveLength(2); expect(saved.guideSaved.stops.every((s: { mustVisit: boolean }) => s.mustVisit)).toBe(true);
  await page.reload(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toContainText('Provider Museum');
});

test('separate return, meal exclusion, removal and invalid duration keep the new route explicit', async ({ page }) => {
  const { inputs } = await setup(page, true);
  await page.getByRole('checkbox', { name: 'Return to the same place', exact: true }).uncheck();
  await page.getByRole('combobox', { name: 'Return location', exact: true }).fill('search'); await page.getByRole('listbox', { name: 'Return location suggestions' }).getByRole('button').first().click();
  await open(page); await page.getByRole('button', { name: 'museums', exact: true }).click();
  await page.getByRole('button', { name: 'Add Provider Museum', exact: true }).click(); await page.getByRole('button', { name: 'Add Provider Garden', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Provider Garden', exact: true }).click();
  await page.getByLabel('Minutes at Provider Museum', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Optimize route', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('10 to 240'); expect(inputs).toHaveLength(0);
  await page.getByLabel('Minutes at Provider Museum', { exact: true }).fill('45');
  await page.getByRole('checkbox', { name: 'Include a midday meal if the trip reaches 13:00–14:00', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Optimize route', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  expect(inputs).toHaveLength(1); expect(inputs[0]).toMatchObject({ returnToStart: false, preferences: { mealBreak: false } }); expect(inputs[0].endId).not.toBeNull(); expect(inputs[0].stops).toHaveLength(1);
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).not.toContainText('Provider Lunch');
  await page.getByLabel('Minutes at Provider Museum', { exact: true }).fill('50'); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toHaveCount(0); expect(inputs).toHaveLength(1);
});

test('provider failures are actionable and a failed optimization does not replace an accepted trip', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check(); await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
  const before = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!).acceptedId, key);
  await page.getByRole('button', { name: 'My day plan', exact: true }).click(); await open(page);
  await page.route('**/api/guide/discover', r => r.fulfill({ status: 502, json: { error: { code: 'PROVIDER_UNAVAILABLE', message: 'Google is unavailable. Retry category lookup.' } } }));
  await page.getByRole('button', { name: 'museums', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Retry category lookup');
  await page.unroute('**/api/guide/discover');
  // Restore only this provider mock; no paid requests are made by this test.
  const candidate = (await page.evaluate(k => JSON.parse(localStorage.getItem(k)!).acceptedGuide, key));
  await page.route('**/api/guide/discover', r => r.fulfill({ json: { candidates: candidate.itinerary.stops.map((s: { location: unknown; durationMinutes: number }, i: number) => ({ location: s.location, suggestedMinutes: s.durationMinutes, facts: candidate.stops[i].facts, score: 1, reasons: [] })), warnings: [], assistantMode: 'local' } }));
  await page.getByRole('button', { name: 'Refresh category', exact: true }).click(); await page.getByRole('button', { name: 'Add Provider Museum', exact: true }).click();
  await page.route('**/api/guide/plan', r => r.fulfill({ status: 422, json: { error: { code: 'GUIDE_INFEASIBLE', message: 'All chosen visits cannot fit. Extend your trip or remove a place.' } } }));
  await page.getByRole('button', { name: 'Optimize route', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('All chosen visits cannot fit');
  expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)!).acceptedId, key)).toBe(before); await expect(page.getByRole('button', { name: 'Accept my chosen itinerary', exact: true })).toHaveCount(0);
});

test('category switching ignores stale results, search needs a selection, and changing city clears chosen visits', async ({ page }) => {
  const { bank, inputs } = await setup(page); let requests = 0;
  await page.route('**/api/guide/discover', async r => { requests++; const museum = r.request().postDataJSON().preferences.interests.includes('museums'); if (museum) await new Promise(resolve => setTimeout(resolve, 700)); await r.fulfill({ json: { candidates: [bank[museum ? 0 : 1]], warnings: [], assistantMode: 'local' } }).catch(() => {}); });
  await open(page); await page.getByRole('button', { name: 'museums', exact: true }).click(); await page.getByRole('button', { name: 'gardens', exact: true }).click();
  await page.getByRole('button', { name: 'Add Provider Garden', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add Provider Museum', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Search another place', exact: true }).fill('unselected text'); await expect(page.getByRole('button', { name: 'Add searched place', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Back to day planner', exact: true }).click();
  await page.getByRole('combobox', { name: 'Destination city', exact: true }).fill('another'); await page.getByRole('listbox', { name: 'Destination city suggestions' }).getByRole('button').first().click();
  await open(page); await expect(page.getByRole('heading', { name: 'Your visits · 0/5', exact: true })).toBeVisible(); expect(inputs).toHaveLength(0); expect(requests).toBe(2);
});

test('mobile place selection has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page); await open(page);
  await page.getByRole('button', { name: 'museums', exact: true }).click(); await page.getByRole('button', { name: 'Add Provider Museum', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.choose-places-page').screenshot({ path: '.tmp/choose-places-390.png' });
});

test('specific-place search validates its provider candidate and prevents duplicates', async ({ page }) => {
  const { bank, inputs } = await setup(page); let additions = 0;
  await page.route('**/api/locations/resolve', r => r.fulfill({ json: bank[0].location }));
  await page.route('**/api/guide/candidate', r => { additions++; expect(r.request().postDataJSON()).toMatchObject({ locationId: bank[0].location.id, chosenPlaces: true }); return r.fulfill({ json: bank[0] }); });
  await open(page);
  const search = page.getByRole('combobox', { name: 'Search another place', exact: true });
  await search.fill('museum'); await expect(page.getByRole('button', { name: 'Add searched place', exact: true })).toBeDisabled();
  await page.getByRole('listbox', { name: 'Search another place suggestions' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Add searched place', exact: true }).click(); await expect(page.getByLabel('Minutes at Provider Museum', { exact: true })).toBeVisible();
  await search.fill('museum'); await page.getByRole('listbox', { name: 'Search another place suggestions' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Add searched place', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('already in your visits'); expect(additions).toBe(1); expect(inputs).toHaveLength(0);
  await page.getByRole('button', { name: 'Optimize route', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible(); expect(inputs[0].stops).toHaveLength(1);
});

test('five-visit limit is explicit and removing a visit makes room for another', async ({ page }) => {
  const { bank } = await setup(page);
  const candidates = Array.from({ length: 6 }, (_, i) => ({ ...bank[0], location: { ...bank[0].location, id: crypto.randomUUID(), placeId: `test-provider-place-${i}`, name: `Test place ${i + 1}` } }));
  await page.route('**/api/guide/discover', r => r.fulfill({ json: { candidates, warnings: [], assistantMode: 'local' } }));
  await open(page); await page.getByRole('button', { name: 'museums', exact: true }).click();
  for (let i = 1; i <= 5; i++) await page.getByRole('button', { name: `Add Test place ${i}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your visits · 5/5', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Add Test place 6', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove Test place 1', exact: true }).click(); await page.getByRole('button', { name: 'Add Test place 6', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your visits · 5/5', exact: true })).toBeVisible(); await expect(page.getByLabel('Minutes at Test place 1', { exact: true })).toHaveCount(0);
});

test('leaving the page cancels pending optimization and ignores its late response', async ({ page }) => {
  await setup(page); let completed = false;
  await page.route('**/api/guide/plan', async r => { await new Promise(resolve => setTimeout(resolve, 1000)); await r.fallback().catch(() => {}); completed = true; });
  await open(page); await page.getByRole('button', { name: 'museums', exact: true }).click(); await page.getByRole('button', { name: 'Add Provider Museum', exact: true }).click();
  await page.getByRole('button', { name: 'Optimize route', exact: true }).click(); await expect(page.getByRole('button', { name: 'Optimizing your route…', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Back to day planner', exact: true }).click(); await open(page);
  await expect(page.getByRole('button', { name: 'Optimize route', exact: true })).toBeEnabled();
  await expect.poll(() => completed, { timeout: 5000 }).toBe(true);
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toHaveCount(0); expect(await page.evaluate(k => localStorage.getItem(k), key)).toBeNull();
});

test('an old out-of-city choice gives a specific city error and remains removable without automatic retries', async ({ page }) => {
  const { inputs } = await setup(page); await open(page);
  await page.getByRole('button', { name: 'museums', exact: true }).click(); await page.getByRole('button', { name: 'Add Provider Museum', exact: true }).click();
  let attempts = 0;
  await page.route('**/api/guide/plan', r => { attempts++; return r.fulfill({ status: 422, json: { error: { code: 'CHOSEN_PLACE_CITY', message: 'Provider Museum (Another city) is outside the selected city area. Remove it and refresh the category.' } } }); });
  await page.getByRole('button', { name: 'Optimize route', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('outside the selected city area');
  await expect(page.getByLabel('Minutes at Provider Museum', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove Provider Museum', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Your visits · 0/5', exact: true })).toBeVisible();
  expect(attempts).toBe(1); expect(inputs).toHaveLength(0); expect(await page.evaluate(k => localStorage.getItem(k), key)).toBeNull();
});
