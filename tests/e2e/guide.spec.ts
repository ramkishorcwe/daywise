import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { GuideCandidate, GuidePlan, GuidePlanRequest } from '../../packages/contracts/src/guide';
import type { SelectedLocation } from '../../packages/contracts/src/locations';
const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const identity = { placeId: 'provider-city-id', name: 'Provider city', countryCode: 'GB' };
const location = (name: string, city = false): SelectedLocation => ({ id: randomUUID(), placeId: name.replaceAll(' ', '-'), name, address: `${name}, provider address`, provider: 'google', source: 'search', coordinates: { latitude: 51.5, longitude: 0 }, city: identity, types: [city ? 'locality' : 'tourist_attraction'], ...(city ? { timezone: 'UTC' } : {}), fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1800000).toISOString(), persistence: 'memory_only', receiptStatus: 'registered' });
async function setup(page: Page) {
  const places = new Map<string, SelectedLocation>(), inputs: GuidePlanRequest[] = [], museum = location('Provider Museum'), garden = location('Provider Garden');
  const bank: GuideCandidate[] = [museum, garden].map((l, i) => ({ location: l, score: 20, reasons: ['Fits your interests.'], suggestedMinutes: 30, facts: { categories: [i ? 'gardens' : 'museums'], environment: i ? 'outdoor' : 'indoor', rating: 4, reviews: 100, hours: { status: 'unknown', windows: [], description: [] }, admission: null, accessible: null, goodForChildren: null, vegetarianOptions: null, website: null, providerUri: null, description: null, checkedAt: new Date().toISOString() } }));
  for (const c of bank) places.set(c.location.id, c.location);
  await page.addInitScript(() => {
    class LatLng { constructor(private latitude: number, private longitude: number) {} lat() { return this.latitude; } lng() { return this.longitude; } }
    class Map { constructor(root: HTMLElement) { root.dataset.mapRendered = 'true'; } fitBounds() {} setCenter() {} setZoom() {} panTo() {} addListener() { return { remove() {} }; } }
    class Marker { constructor(private options: { position: { lat: number; lng: number } }) {} setMap() {} setAnimation() {} getPosition() { return this.options.position; } addListener() { return { remove() {} }; } }
    Object.assign(window, { google: { maps: { Map, Marker, LatLng, LatLngBounds: class { extend() {} }, Polyline: class { setMap() {} }, Animation: { BOUNCE: 1 }, geometry: { encoding: { decodePath: () => [new LatLng(51.5, 0), new LatLng(51.51, 0)] } } } } });
  });
  await page.route('**/api/locations/config', r => r.fulfill({ json: { autocomplete: true, reverseGeocode: true, timezone: true, routing: true, guideDiscovery: true, guideRouting: true, guideAssistant: 'local' } }));
  await page.route('**/api/locations/autocomplete', r => r.fulfill({ json: { provider: 'google', suggestions: [{ placeId: 'provider-search-id', text: 'Provider selected place' }] } }));
  await page.route('**/api/locations/resolve', async r => { const body = r.request().postDataJSON(); const l = location(body.destinationCity ? 'Provider city' : 'Provider start', body.destinationCity); places.set(l.id, l); await r.fulfill({ json: l }); });
  await page.route('**/api/guide/discover', r => r.fulfill({ json: { candidates: bank, warnings: ['Admission costs are unverified.'], assistantMode: 'local' } }));
  await page.route('**/api/guide/plan', async r => {
    const body = r.request().postDataJSON() as GuidePlanRequest; inputs.push(body);
    const rows = body.orderMode === 'smart' && !body.stops.some(s => s.locked) ? [...body.stops].reverse() : body.stops;
    const destination = places.get(body.destinationId)!, start = places.get(body.startId)!, departure = Date.parse(`${body.date}T${body.startTime}:00Z`);
    let cursor = departure;
    const stops = rows.map(row => { cursor += 20 * 60000; const arrivalAt = new Date(cursor).toISOString(); cursor += row.durationMinutes * 60000; return { location: places.get(row.locationId)!, durationMinutes: row.durationMinutes, arrivalAt, departureAt: new Date(cursor).toISOString() }; });
    const plan: GuidePlan = { orderMode: body.orderMode, assistantMode: 'local', itinerary: { destination, start, end: body.returnToStart ? start : places.get(body.endId!)!, stops, route: { provider: 'google_routes', mode: body.preferences.travelMode, durationSeconds: (rows.length + 1) * 600, distanceMeters: (rows.length + 1) * 3000, encodedPolyline: 'test-only-route', departureTime: new Date(departure).toISOString(), fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(), trafficBasis: 'prediction_for_departure', persistence: 'memory_only', legs: Array.from({ length: rows.length + 1 }, () => ({ durationSeconds: 600, distanceMeters: 3000 })), optimizedOrder: rows.map((_row, i) => i) }, finishAt: new Date(cursor + 600000).toISOString(), deadlineAt: `${body.date}T${body.endTime}:00Z`, withinTime: true, warnings: ['Confirm unverified venue facts.'] }, stops: rows.map(row => ({ locationId: row.locationId, facts: bank.find(c => c.location.id === row.locationId)!.facts, cost: null, reasons: ['Selected from verified IDs.'], bufferMinutes: 10, travelMinutes: 10, waitingMinutes: 0, hoursStatus: 'unknown' })), budget: { currency: null, groupKnownMinimum: 0, groupKnownMaximum: 0, perPersonKnownMinimum: 0, perPersonKnownMaximum: 0, groupLimit: null, unknowns: ['Admission unknown; not free.'], status: 'unknown' }, assumptions: ['Durations are estimates.'], excluded: [], breaks: [], comparison: { evaluatedSequences: body.orderMode === 'smart' ? 4 : 1, originalTravelMinutes: 60, selectedTravelMinutes: 30 } };
    await r.fulfill({ json: plan });
  });
  await page.goto('/?live=1');
  for (const label of ['Destination city', 'Starting location']) { await page.getByRole('combobox', { name: label, exact: true }).fill('search'); await page.getByRole('listbox', { name: `${label} suggestions` }).getByRole('button').first().click(); await expect(page.getByRole('region', { name: `${label} picker` }).locator('.validated-location')).toBeVisible(); }
  await page.getByLabel('Travel date', { exact: true }).fill(date);
  return { inputs, bank };
}
test('guide discovers real candidates, reviews unknown costs, keeps numbering synchronized and requires review before acceptance', async ({ page }) => {
  await setup(page); await expect(page.getByRole('combobox', { name: 'Visit 1', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Add another visit', exact: true })).toHaveCount(0); await expect(page.getByRole('combobox', { name: 'Guide attraction', exact: true })).toHaveCount(0); await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  const review = page.getByRole('region', { name: 'Guided itinerary review', exact: true }); await expect(review).toBeVisible(); await expect(review).toContainText('Full cost is unknown');
  await expect(page.getByRole('button', { name: 'Accept this guided itinerary', exact: true })).toBeDisabled();
  await review.getByRole('button', { name: 'Highlight Provider Garden on map', exact: true }).click(); await expect(review.locator('.guide-highlight')).toContainText('Provider Garden');
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check(); await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
});
test('manual rearrangement recalculates but preserves order until explicit optimization', async ({ page }) => {
  const state = await setup(page); await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  await page.getByText('Adjust the planned visits', { exact: true }).click(); await page.getByRole('button', { name: 'Move Provider Museum up', exact: true }).click();
  await expect.poll(() => state.inputs.length).toBe(2); expect(state.inputs[1].orderMode).toBe('manual'); expect(state.inputs[1].stops[0].locationId).toBe(state.bank[0].location.id);
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toContainText('Your order was preserved');
  await page.getByRole('button', { name: 'Optimize route', exact: true }).click(); await expect.poll(() => state.inputs.length).toBe(3); expect(state.inputs[2].orderMode).toBe('smart');
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
