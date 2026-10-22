import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { setup } from './helpers/live-guide';
import type { SelectedLocation } from '../../packages/contracts/src/locations';
const key = 'daywise-live-active-v1';
async function source(page: Page, text = 'hotel') {
  await page.getByRole('combobox', { name: 'Starting location', exact: true }).fill(text);
  await page.getByRole('listbox', { name: 'Starting location suggestions', exact: true }).getByRole('button').first().click();
  await expect(page.getByRole('region', { name: 'Starting location picker', exact: true }).locator('.validated-location')).toBeVisible();
}
const cityPanel = (page: Page) => page.getByRole('region', { name: 'City to explore', exact: true });

for (const width of [390, 1440]) test(`one starting field detects a visible city and preserves exact routing coordinates at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const lookups: { destinationCity: boolean }[] = [];
  page.on('request', r => { if (r.url().endsWith('/api/locations/resolve')) lookups.push(r.postDataJSON()); });
  const state = await setup(page, false, false, false, 'empty');
  await expect(page.getByRole('combobox', { name: 'Destination city', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Starting location', exact: true })).toBeVisible();
  expect(lookups).toHaveLength(0); await source(page);
  await expect(cityPanel(page)).toContainText('Exploring: Provider city'); await expect(cityPanel(page)).toContainText('DETECTED FROM YOUR STARTING POINT');
  expect(lookups.filter(r => r.destinationCity)).toHaveLength(1); expect(state.inputs).toHaveLength(0);
  await page.screenshot({ path: `.tmp/starting-city-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  const input = state.inputs[0], start = state.places.get(input.startId)!, destination = state.places.get(input.destinationId)!;
  expect(start.coordinates).toEqual({ latitude: 51.5, longitude: 0 }); expect(destination.coordinates).toEqual({ latitude: 51.7, longitude: .2 }); expect(input.startId).not.toBe(input.destinationId); expect(input.returnToStart).toBe(true); expect(input.endId).toBeNull();
  expect(await page.evaluate(k => localStorage.getItem(k), key)).toBeNull();
});

test('replacing a hotel in the same city reuses valid city evidence and never replans automatically', async ({ page }) => {
  let cityLookups = 0; page.on('request', r => { if (r.url().endsWith('/api/locations/resolve') && r.postDataJSON().destinationCity) cityLookups++; });
  const state = await setup(page, false, false, false, true); expect(cityLookups).toBe(1);
  await source(page, 'different hotel'); await expect(cityPanel(page)).toContainText('Exploring: Provider city'); expect(cityLookups).toBe(1); expect(state.inputs).toHaveLength(0);
  await page.getByRole('button', { name: 'Compare three plans', exact: true }).click(); await expect(page.getByRole('region', { name: 'Compare three plans', exact: true })).toBeVisible(); expect(state.comparisons).toHaveLength(1);
  await source(page, 'third hotel'); await expect(page.getByRole('region', { name: 'Compare three plans', exact: true })).toHaveCount(0); expect(cityLookups).toBe(1); expect(state.comparisons).toHaveLength(1);
});

test('GPS is requested only on click and its captured point remains the start after city detection', async ({ page }) => {
  await page.addInitScript(() => { const w = window as unknown as { gpsCalls: number }; w.gpsCalls = 0; Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success: PositionCallback) => { w.gpsCalls++; success({ coords: { latitude: 51.5017, longitude: -.1419, accuracy: 17 }, timestamp: Date.now() } as GeolocationPosition); } } }); });
  const state = await setup(page, false, false, false, 'empty');
  await page.route('**/api/locations/reverse', async r => { const body = r.request().postDataJSON(); const point: SelectedLocation = { ...state.bank[0].location, id: randomUUID(), name: 'Captured test GPS address', source: 'gps', types: ['street_address'], coordinates: body.coordinates, accuracyMeters: body.accuracyMeters, observedAt: body.observedAt, receiptStatus: 'registered' }; state.places.set(point.id, point); await r.fulfill({ json: point }); });
  expect(await page.evaluate(() => (window as unknown as { gpsCalls: number }).gpsCalls)).toBe(0);
  await page.getByRole('button', { name: 'Use my current location', exact: true }).click(); await expect(cityPanel(page)).toContainText('Exploring: Provider city');
  expect(await page.evaluate(() => (window as unknown as { gpsCalls: number }).gpsCalls)).toBe(1);
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  const actual = state.places.get(state.inputs[0].startId)!; expect(actual.source).toBe('gps'); expect(actual.coordinates).toEqual({ latitude: 51.5017, longitude: -.1419 }); expect(actual.accuracyMeters).toBe(17);
});

test('GPS permission denial invents no city or starting point', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => error({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError) } }); });
  const state = await setup(page, false, false, false, 'empty'); await page.getByRole('button', { name: 'Use my current location', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Starting location picker', exact: true }).getByRole('alert')).toContainText(/permission/i);
  await expect(cityPanel(page)).not.toContainText('Exploring:'); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeDisabled(); expect(state.inputs).toHaveLength(0);
});

test('city detection failure preserves the start and waits for an explicit retry', async ({ page }) => {
  const state = await setup(page, false, false, false, 'empty'); let attempts = 0;
  await page.route('**/api/locations/resolve', async r => { if (!r.request().postDataJSON().destinationCity) return r.fallback(); attempts++; if (attempts === 1) return r.fulfill({ status: 503, json: { error: { code: 'PROVIDER_UNAVAILABLE', message: 'City lookup unavailable. Retry.' } } }); return r.fallback(); });
  await source(page); await expect(cityPanel(page).getByRole('alert')).toContainText('City lookup unavailable'); await expect(page.getByRole('combobox', { name: 'Starting location', exact: true })).toHaveValue('Provider start');
  expect(attempts).toBe(1); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry city detection', exact: true }).click(); await expect(cityPanel(page)).toContainText('Exploring: Provider city'); expect(attempts).toBe(2); expect(state.inputs).toHaveLength(0);
});

test('an asynchronous city result cannot overwrite a currency the user selected while it was loading', async ({ page }) => {
  const state = await setup(page, false, false, false, 'empty');
  let finishCity = () => {}; const pendingCity = new Promise<void>(resolve => { finishCity = resolve; });
  const identity = { ...state.bank[0].location.city!, countryCode: 'IN' };
  await page.route('**/api/locations/resolve', async r => {
    const body = r.request().postDataJSON();
    const value = { ...state.bank[0].location, id: randomUUID(), city: identity, ...(body.destinationCity ? { name: 'Detected city', timezone: 'Asia/Kolkata', types: ['locality'] } : { name: 'Selected hotel', types: ['lodging'] }) };
    if (body.destinationCity) await pendingCity; await r.fulfill({ json: value });
  });
  await source(page); await page.getByText('Group, budget and food preferences', { exact: true }).click(); await page.getByLabel('Budget currency', { exact: true }).selectOption('USD');
  await expect(cityPanel(page)).toContainText('Verifying your starting city'); finishCity();
  await expect(cityPanel(page)).toContainText('Exploring: Detected city'); await expect(page.getByLabel('Budget currency', { exact: true })).toHaveValue('USD'); expect(state.inputs).toHaveLength(0);
});

test('a late city lookup cannot overwrite the city of a newer starting point', async ({ page }) => {
  const state = await setup(page, false, false, false, 'empty'); let sourceNumber = 0, firstFinished = false;
  const original = state.bank[0].location.city!, second = { ...original, placeId: 'test-second-city-id', name: 'Second city' };
  await page.route('**/api/locations/resolve', async r => {
    const body = r.request().postDataJSON();
    if (!body.destinationCity) { sourceNumber++; const place = { ...state.bank[0].location, id: randomUUID(), placeId: `test-start-${sourceNumber}`, name: `Hotel ${sourceNumber}`, city: sourceNumber === 1 ? original : second }; state.places.set(place.id, place); return r.fulfill({ json: place }); }
    const isFirst = body.placeId === original.placeId;
    const city = { ...state.bank[0].location, id: randomUUID(), placeId: body.placeId, city: isFirst ? original : second, name: isFirst ? 'First city' : 'Second city', types: ['locality'], timezone: 'UTC' };
    state.places.set(city.id, city); if (isFirst) await new Promise(resolve => setTimeout(resolve, 900)); await r.fulfill({ json: city }).catch(() => {}); if (isFirst) firstFinished = true;
  });
  await source(page, 'first hotel'); await expect(cityPanel(page)).toContainText('Verifying your starting city'); await source(page, 'second hotel');
  await expect(cityPanel(page)).toContainText('Exploring: Second city'); await expect.poll(() => firstFinished).toBe(true); await expect(cityPanel(page)).not.toContainText('First city'); await expect(page.getByRole('combobox', { name: 'Starting location', exact: true })).toHaveValue('Hotel 2'); expect(state.inputs).toHaveLength(0);
});

test('changing city is optional, cancellation preserves the detected city and a confirmed different city keeps its own starting point', async ({ page }) => {
  const state = await setup(page, false, false, false, true);
  await page.getByRole('button', { name: 'Change city', exact: true }).click(); await page.getByRole('combobox', { name: 'Destination city', exact: true }).fill('unselected text'); await page.getByRole('button', { name: 'Cancel city change', exact: true }).click();
  await expect(cityPanel(page)).toContainText('Exploring: Provider city'); await expect(page.getByRole('combobox', { name: 'Starting location', exact: true })).toHaveValue('Provider start');
  const city: SelectedLocation = { ...state.bank[0].location, id: randomUUID(), placeId: 'test-other-city', name: 'Other destination city', city: { ...state.bank[0].location.city!, placeId: 'test-other-city-identity', name: 'Other city' }, types: ['locality'], timezone: 'UTC', coordinates: { latitude: 52.2, longitude: 1 } }; state.places.set(city.id, city);
  await page.route('**/api/locations/resolve', r => r.request().postDataJSON().destinationCity ? r.fulfill({ json: city }) : r.fallback());
  await page.getByRole('button', { name: 'Change city', exact: true }).click(); await page.getByRole('combobox', { name: 'Destination city', exact: true }).fill('other city'); await page.getByRole('listbox', { name: 'Destination city suggestions', exact: true }).getByRole('button').first().click();
  await expect(cityPanel(page)).toContainText('Exploring: Other destination city'); await expect(page.getByRole('region', { name: 'Starting city review', exact: true })).toBeVisible();
  await source(page, 'replacement hotel'); await expect(cityPanel(page)).toContainText('Exploring: Other destination city'); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Travel from this starting location to my destination', exact: true }).check(); await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible(); expect(state.inputs[0].destinationId).toBe(city.id); expect(state.inputs[0].allowOutsideStart).toBe(true);
});

test('a searched city alone cannot become an exact starting point', async ({ page }) => {
  const state = await setup(page, false, false, false, 'empty'); let cityLookups = 0;
  await page.route('**/api/locations/resolve', r => { const body = r.request().postDataJSON(); if (body.destinationCity) cityLookups++; return r.fulfill({ json: { ...state.bank[0].location, id: randomUUID(), name: 'A city-only search', types: ['locality', 'political'] } }); });
  await source(page, 'city'); await expect(page.getByRole('alert')).toContainText('city alone is not an exact starting point'); await expect(cityPanel(page)).not.toContainText('Exploring:'); expect(cityLookups).toBe(0); expect(state.inputs).toHaveLength(0); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeDisabled();
});

test('the detected-city flow works with chosen-place optimization and acceptance-only persistence', async ({ page }) => {
  const state = await setup(page, false, false, false, true); await page.getByRole('button', { name: 'Choose my places', exact: true }).click(); await page.getByRole('button', { name: 'museums', exact: true }).click(); await page.getByRole('button', { name: 'Add Provider Museum', exact: true }).click(); await page.getByRole('button', { name: 'Optimize route', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible(); expect(state.inputs[0].chosenPlaces).toBe(true); expect(state.places.get(state.inputs[0].startId)!.coordinates).not.toEqual(state.places.get(state.inputs[0].destinationId)!.coordinates); expect(await page.evaluate(k => localStorage.getItem(k), key)).toBeNull();
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check(); await page.getByRole('button', { name: 'Accept my chosen itinerary', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
  const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!), key); expect(saved.destinationMode).toBe('starting_city'); expect(saved.accepted.start.coordinates).toEqual({ latitude: 51.5, longitude: 0 });
  await page.reload(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'My day plan', exact: true }).click(); await expect(cityPanel(page)).toContainText('DETECTED FROM YOUR STARTING POINT'); await expect(page.getByRole('button', { name: 'Refresh saved locations', exact: true })).toBeVisible();
});
