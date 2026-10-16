import { expect, test, type Page, type Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { zonedTime } from '../../packages/domain/src/time';
import type { GuideCandidate, GuidePlanRequest } from '../../packages/contracts/src/guide';
import type { SelectedLocation, LiveItinerary, LiveRouteInput } from '../../packages/contracts/src/locations';
import { savedAcceptedTrips } from './helpers/accepted-trips';

// Mock responses exist only in this test. Production has no location fixtures.
const coordinates = { latitude: 51.5, longitude: -0.12 }, outsideCoordinates = { latitude: 48.85, longitude: 2.35 };
const identity = { placeId: 'provider-city-id', name: 'Provider city', countryCode: 'GB' };
function location(placeId: string, name: string, extra: Partial<SelectedLocation> = {}): SelectedLocation { return { id: randomUUID(), provider: 'google', source: 'search', placeId, name, address: `${name}, provider supplied address`, coordinates, city: identity, types: ['lodging'], fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1800000).toISOString(), persistence: 'memory_only', ...extra }; }
const facts = () => ({ categories: ['history'] as const, environment: 'unknown' as const, rating: 4, reviews: 100, hours: { status: 'unknown' as const, windows: [], description: [] }, admission: null, accessible: null, goodForChildren: null, vegetarianOptions: null, website: null, providerUri: null, description: null, checkedAt: new Date().toISOString() });
async function fulfillGuide(route: Route, itinerary: LiveItinerary) {
  await route.fulfill({ json: { itinerary, orderMode: (route.request().postDataJSON() as GuidePlanRequest).orderMode, assistantMode: 'local', stops: itinerary.stops.map(stop => ({ locationId: stop.location.id, facts: facts(), cost: null, reasons: ['Test provider-backed candidate'], bufferMinutes: 10, travelMinutes: 10, waitingMinutes: 0, hoursStatus: 'unknown' })), budget: { currency: (route.request().postDataJSON() as GuidePlanRequest).preferences.currency, groupKnownMinimum: 0, groupKnownMaximum: 0, perPersonKnownMinimum: 0, perPersonKnownMaximum: 0, groupLimit: null, unknowns: ['Admission unknown'], status: 'unknown' }, breaks: [], assumptions: ['Test-only provider responses'], excluded: [], comparison: { originalTravelMinutes: 30, selectedTravelMinutes: itinerary.route.durationSeconds / 60, evaluatedSequences: 2 } } });
}
async function acceptGuide(page: Page) { await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check(); await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click(); }
async function mocks(page: Page, outside = false) {
  const selections = new Map<string, SelectedLocation>(), routeInputs: LiveRouteInput[] = [], reverses: unknown[] = [];
  await page.route('**/api/locations/config', route => route.fulfill({ json: { autocomplete: true, reverseGeocode: true, timezone: true, routing: true, guideDiscovery: true, guideRouting: true, guideAssistant: 'local' } }));
  await page.route('**/api/locations/autocomplete', async route => { const body = route.request().postDataJSON(); await route.fulfill({ json: { provider: 'google', suggestions: body.input === 'nothing' ? [] : [{ placeId: `provider-${body.input.replace(/\W/g, '')}-id`, text: `Google result ${body.input}` }] } }); });
  await page.route('**/api/locations/resolve', async route => { const body = route.request().postDataJSON(); const value = location(body.placeId, body.destinationCity ? 'Provider city' : `Chosen ${body.placeId}`, body.destinationCity ? { placeId: identity.placeId, timezone: 'Europe/London', types: ['locality'] } : {}); selections.set(value.id, value); await route.fulfill({ json: value }); });
  await page.route('**/api/locations/reverse', async route => { const body = route.request().postDataJSON(); reverses.push(body); const value = location('provider-gps-address', 'Resolved browser address', { coordinates: body.coordinates, source: body.source, ...(body.source === 'gps' ? { accuracyMeters: body.accuracyMeters, observedAt: body.observedAt } : {}), ...(outside ? { city: { ...identity, placeId: 'provider-other-city-id', name: 'Other provider city' } } : {}) }); selections.set(value.id, value); await route.fulfill({ json: value }); });
  await page.route('**/api/guide/discover', async route => { const value = location('provider-landmark-id', 'Chosen provider-landmark-id', { types: ['tourist_attraction'] }); selections.set(value.id, value); await route.fulfill({ json: { candidates: [{ location: value, facts: facts(), suggestedMinutes: 60, score: 20, reasons: ['Provider attraction'] }], warnings: [], assistantMode: 'local' } }); });
  await page.route('**/api/guide/plan', async route => { const body = route.request().postDataJSON() as LiveRouteInput; routeInputs.push(body); const start = selections.get(body.startId)!, destination = selections.get(body.destinationId)!, end = body.returnToStart ? start : selections.get(body.endId!)!, departure = zonedTime(body.date, body.startTime, destination.timezone!), deadline = zonedTime(body.date, body.endTime, destination.timezone!); let cursor = departure;
    const stops = body.stops.map(stop => { cursor += 600000; const arrivalAt = new Date(cursor).toISOString(); cursor += stop.durationMinutes * 60000; return { location: selections.get(stop.locationId)!, durationMinutes: stop.durationMinutes, arrivalAt, departureAt: new Date(cursor).toISOString() }; }); cursor += 600000;
    const itinerary: LiveItinerary = { start, destination, end, stops, finishAt: new Date(cursor).toISOString(), deadlineAt: new Date(deadline).toISOString(), withinTime: cursor <= deadline, warnings: ['Provider test response; budget and venue requirements are unverified.'], route: { provider: 'google_routes', mode: 'DRIVE', durationSeconds: 600 * (stops.length + 1), distanceMeters: 4000, encodedPolyline: 'provider-encoded-route', departureTime: new Date(departure).toISOString(), fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(), trafficBasis: 'prediction_for_departure', persistence: 'memory_only', legs: Array.from({ length: stops.length + 1 }, () => ({ durationSeconds: 600, distanceMeters: 2000 })), optimizedOrder: stops.map((_, index) => index) } };
    await fulfillGuide(route, itinerary);
  });
  return { selections, routeInputs, reverses };
}
async function choose(page: Page, label: string, text: string) { await page.getByRole('combobox', { name: label, exact: true }).fill(text); const options = page.getByRole('listbox', { name: `${label} suggestions`, exact: true }); await expect(options.getByRole('option')).toHaveCount(1); await page.getByRole('combobox', { name: label, exact: true }).press('Enter'); await expect(page.getByRole('region', { name: `${label} picker`, exact: true }).locator('.validated-location')).toBeVisible(); }
async function essentials(page: Page, gps = false) { await choose(page, 'Destination city', 'city'); if (!gps) await choose(page, 'Starting location', 'hotel'); await page.getByLabel('Travel date', { exact: true }).fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10)); }
async function stubMap(page: Page) {
  await page.addInitScript(() => {
    const state = window as unknown as { mapCreations: number; polylines: number; clickMap: (event: unknown) => void; google: unknown; camera: { latitude: number; longitude: number; zoom: number } | null; lastZoom: number; markers: { title: string; label: string; active: boolean }[] }; state.mapCreations = 0; state.polylines = 0; state.camera = null; state.markers = [];
    class LatLng { constructor(private latitude: number, private longitude: number) {} lat() { return this.latitude; } lng() { return this.longitude; } }
    class Map { constructor(_root: unknown, options: { center: { lat(): number; lng(): number }; zoom: number }) { state.mapCreations++; state.camera = { latitude: options.center.lat(), longitude: options.center.lng(), zoom: options.zoom }; } setCenter() {} setZoom(zoom: number) { state.lastZoom = zoom; } fitBounds() {} addListener(_name: string, callback: (event: unknown) => void) { state.clickMap = callback; return { remove() {} }; } }
    class Marker { record?: { title: string; label: string; active: boolean }; constructor(options: { position?: unknown; title?: string; label?: string }) { if (options.position) { this.record = { title: options.title ?? '', label: options.label ?? '', active: true }; state.markers.push(this.record); } } setMap(map: unknown) { if (!map && this.record) this.record.active = false; } }
    class Polyline extends Marker { constructor(options: { position?: unknown; title?: string; label?: string }) { super(options); state.polylines++; } } class Bounds { extend() {} }
    state.google = { maps: { Map, Marker, Polyline, LatLng, LatLngBounds: Bounds, geometry: { encoding: { decodePath: () => [new LatLng(51.5, -0.12), new LatLng(51.51, -0.13)] } } } };
  });
}

test('a GPS fix survives backend address failure and retries its exact point without a second GPS read', async ({ page, context }) => {
  const state = await mocks(page); await context.grantPermissions(['geolocation']); await context.setGeolocation({ ...coordinates, accuracy: 18 });
  await page.addInitScript(() => { const state = window as unknown as { reads: number }; state.reads = 0; const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation); navigator.geolocation.getCurrentPosition = (...args) => { state.reads++; original(...args); }; });
  let calls = 0;
  await page.route('**/api/locations/reverse', async route => {
    const body = route.request().postDataJSON(); state.reverses.push(body);
    if (++calls === 1) { await route.fulfill({ status: 502, json: { error: { code: 'UNAVAILABLE', message: 'Address service unavailable. Retry.' } } }); return; }
    const result = location('unused-test-id', 'Captured browser location', { provider: 'device', placeId: null, address: null, city: null, types: [], addressStatus: 'unresolved', receiptStatus: 'registered', source: 'gps', coordinates: body.coordinates, accuracyMeters: body.accuracyMeters, observedAt: body.observedAt }); state.selections.set(result.id, result); await route.fulfill({ json: result });
  });
  await page.goto('/?live=1'); await essentials(page, true); await page.getByRole('button', { name: 'Use my current location', exact: true }).click();
  const field = page.getByRole('region', { name: 'Starting location picker', exact: true }); await expect(field).toContainText('your point is preserved'); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeDisabled();
  const precise = field.getByText('51.50000, -0.12000', { exact: true }); await expect(precise).toBeHidden(); await field.getByText('Show coordinates', { exact: true }).click(); await expect(precise).toBeVisible();
  await field.getByRole('button', { name: 'Retry address lookup', exact: true }).click(); await expect(field).toContainText('You can still use this location'); expect(await page.evaluate(() => (window as unknown as { reads: number }).reads)).toBe(1); expect(state.reverses).toHaveLength(2);
  await page.getByRole('checkbox', { name: 'Travel from this starting location to my destination', exact: true }).check(); await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  const input = state.routeInputs[0], chosen = state.selections.get(input.startId)!; expect(chosen.coordinates).toEqual(coordinates); expect(input.returnToStart).toBe(true); expect(chosen.address).toBeNull();
});

test('pending GPS callbacks after leaving the planner cannot update a new form or submit an address lookup', async ({ page }) => {
  const state = await mocks(page); await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = callback => { (window as unknown as { deliver: PositionCallback }).deliver = callback; }; });
  await page.goto('/?live=1'); await page.getByRole('button', { name: 'Use my current location', exact: true }).click(); await page.getByRole('button', { name: 'Saved plans', exact: true }).click();
  await page.evaluate(() => (window as unknown as { deliver: PositionCallback }).deliver({ coords: { latitude: 51.5, longitude: -0.12, accuracy: 20 }, timestamp: Date.now() } as GeolocationPosition));
  await page.getByRole('button', { name: 'My day plan', exact: true }).click(); await expect(page.getByRole('combobox', { name: 'Starting location', exact: true })).toHaveValue(''); expect(state.reverses).toHaveLength(0);
});

test('map pins preserve an unknown address and require confirmation while cancellation preserves the previous source', async ({ page }) => {
  const state = await mocks(page); await stubMap(page);
  await page.route('**/api/locations/reverse', async route => { const body = route.request().postDataJSON(); const result = location('unused-test-id', 'Selected map point', { provider: 'device', placeId: null, address: null, city: null, types: [], addressStatus: 'unresolved', receiptStatus: 'registered', source: 'pin', coordinates: body.coordinates }); state.selections.set(result.id, result); await route.fulfill({ json: result }); });
  await page.goto('/?live=1'); await essentials(page); const field = page.getByRole('combobox', { name: 'Starting location', exact: true });
  await page.getByRole('button', { name: 'Select start with a map pin', exact: true }).click(); await page.evaluate(() => (window as unknown as { clickMap: (event: unknown) => void }).clickMap({ latLng: { lat: () => 51.51, lng: () => -0.13 } }));
  await expect(page.getByRole('region', { name: 'Map pin review', exact: true })).toContainText('address unavailable'); await expect(field).toHaveValue('Chosen provider-hotel-id'); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel map selection', exact: true }).click(); await expect(field).toHaveValue('Chosen provider-hotel-id'); await expect(page.getByRole('region', { name: 'Map pin review', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Select start with a map pin', exact: true }).click(); await page.evaluate(() => (window as unknown as { clickMap: (event: unknown) => void }).clickMap({ latLng: { lat: () => 51.51, lng: () => -0.13 } }));
  await page.getByRole('button', { name: 'Use this starting point', exact: true }).click(); await expect(field).toHaveValue('Selected map point'); await page.getByRole('checkbox', { name: 'Travel from this starting location to my destination', exact: true }).check();
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible(); expect(state.selections.get(state.routeInputs[0].startId)!.coordinates).toEqual({ latitude: 51.51, longitude: -0.13 });
});

test('map instances survive preference edits and failed route requests never draw fabricated geometry', async ({ page }) => {
  await mocks(page); await stubMap(page); await page.route('**/api/guide/plan', route => route.fulfill({ status: 502, json: { error: { code: 'UNAVAILABLE', message: 'Google driving routes unavailable. Retry.' } } }));
  await page.goto('/?live=1'); await essentials(page); await expect.poll(() => page.evaluate(() => (window as unknown as { mapCreations: number }).mapCreations)).toBe(1);
  await page.getByLabel('Private day name', { exact: true }).fill('My user preference'); await page.getByRole('combobox', { name: 'Preferred pace', exact: true }).selectOption('relaxed');
  expect(await page.evaluate(() => (window as unknown as { mapCreations: number }).mapCreations)).toBe(1); await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Google driving routes unavailable');
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toHaveCount(0); expect(await page.evaluate(() => (window as unknown as { polylines: number }).polylines)).toBe(0); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeEnabled();
});

test('cancelling a map pin during lookup prevents its late response from replacing the selected source', async ({ page }) => {
  await mocks(page); await stubMap(page); let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/locations/reverse', async route => { const body = route.request().postDataJSON(); await held; try { await route.fulfill({ json: location('late-pin-id', 'Late pin result', { source: 'pin', coordinates: body.coordinates }) }); } catch { /* The canceled request cannot update the form. */ } });
  await page.goto('/?live=1'); await essentials(page); await page.getByRole('button', { name: 'Select start with a map pin', exact: true }).click(); await page.evaluate(() => (window as unknown as { clickMap: (event: unknown) => void }).clickMap({ latLng: { lat: () => 51.51, lng: () => -0.13 } }));
  await expect(page.getByRole('button', { name: 'Use this starting point', exact: true })).toBeDisabled(); await page.getByRole('button', { name: 'Cancel map selection', exact: true }).click(); release();
  await expect(page.getByRole('combobox', { name: 'Starting location', exact: true })).toHaveValue('Chosen provider-hotel-id'); await expect(page.getByRole('region', { name: 'Map pin review', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeEnabled(); await expect(page.getByText('Late pin result', { exact: true })).toHaveCount(0);
});

test('failed on-demand schedule validation blocks generation and offers an explicit reload', async ({ page }) => {
  await mocks(page); await page.route('**/packages/domain/src/live-itinerary.ts*', route => route.fulfill({ status: 503, body: 'Controlled validation download failure' }));
  await page.goto('/?live=1'); await essentials(page); const alert = page.getByRole('alert').filter({ hasText: 'Schedule validation could not load' }); await expect(alert).toContainText('Unsaved choices'); await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeDisabled();
});

test('map initialization uses the selected point and same-place returns share a marker at a sensible zoom', async ({ page }) => {
  await mocks(page); await stubMap(page); await page.goto('/?live=1'); await choose(page, 'Starting location', 'hotel');
  await expect.poll(() => page.evaluate(() => (window as unknown as { camera: unknown }).camera)).toEqual({ latitude: 51.5, longitude: -0.12, zoom: 12 });
  const markers = await page.evaluate(() => (window as unknown as { markers: { active: boolean; label: string }[] }).markers.filter(marker => marker.active)); expect(markers).toHaveLength(1); expect(markers[0].label).toBe('1/2'); expect(await page.evaluate(() => (window as unknown as { lastZoom: number }).lastZoom)).toBe(12);
});

test('optimized preview marker numbers follow the accepted route order rather than the original form order', async ({ page }) => {
  const state = await mocks(page); await stubMap(page);
  await page.route('**/api/locations/resolve', async route => { const body = route.request().postDataJSON(), latitude = body.placeId.includes('firstvisit') ? 51.51 : body.placeId.includes('secondvisit') ? 51.52 : 51.5; const result = location(body.placeId, body.destinationCity ? 'Provider city' : `Chosen ${body.placeId}`, { coordinates: { latitude, longitude: -0.12 }, ...(body.destinationCity ? { placeId: identity.placeId, types: ['locality'], timezone: 'Europe/London' } : {}) }); state.selections.set(result.id, result); await route.fulfill({ json: result }); });
  await page.route('**/api/guide/plan', async route => {
    const body = route.request().postDataJSON() as LiveRouteInput, destination = state.selections.get(body.destinationId)!, start = state.selections.get(body.startId)!, departure = zonedTime(body.date, body.startTime, destination.timezone!);
    const stops = [...body.stops].reverse().map((stop, index) => ({ location: state.selections.get(stop.locationId)!, durationMinutes: stop.durationMinutes, arrivalAt: new Date(departure + (index + 1) * 600000).toISOString(), departureAt: new Date(departure + (index + 1) * 1200000).toISOString() }));
    await fulfillGuide(route, { destination, start, end: start, stops, finishAt: new Date(departure + 3600000).toISOString(), deadlineAt: new Date(zonedTime(body.date, body.endTime, destination.timezone!)).toISOString(), withinTime: true, warnings: [], route: { provider: 'google_routes', mode: 'DRIVE', durationSeconds: 1800, distanceMeters: 6000, encodedPolyline: 'test-route', departureTime: new Date(departure).toISOString(), fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(), trafficBasis: 'prediction_for_departure', persistence: 'memory_only', legs: [0, 1, 2].map(() => ({ durationSeconds: 600, distanceMeters: 2000 })), optimizedOrder: [1, 0] } });
  });
  await page.route('**/api/guide/discover', async route => { const candidates = [1, 2].map(i => { const value = location(`provider-${i === 1 ? 'firstvisit' : 'secondvisit'}-id`, `Chosen provider-${i === 1 ? 'firstvisit' : 'secondvisit'}-id`, { coordinates: { latitude: 51.5 + i / 100, longitude: -0.12 }, types: ['tourist_attraction'] }); state.selections.set(value.id, value); return { location: value, facts: facts(), suggestedMinutes: 60, score: 20, reasons: ['Provider attraction'] }; }); await route.fulfill({ json: { candidates, warnings: [], assistantMode: 'local' } }); });
  await page.goto('/?live=1'); await essentials(page); await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { markers: { title: string; label: string; active: boolean }[] }).markers.filter(marker => marker.active).map(marker => ({ title: marker.title, label: marker.label })))).toEqual([{ title: 'Chosen provider-hotel-id', label: '1/4' }, { title: 'Chosen provider-secondvisit-id', label: '2' }, { title: 'Chosen provider-firstvisit-id', label: '3' }]);
});

test('normal real-location screen starts empty and missing APIs return errors without suggestions or coordinates', async ({ page }) => {
  await page.goto('/?live=1'); await expect(page.getByRole('heading', { name: 'Your day starts here.', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Destination city', exact: true })).toHaveValue(''); await expect(page.getByRole('combobox', { name: 'Starting location', exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeDisabled(); await expect(page.getByText(/Demo stay|jaipur-test|Harbor City/)).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Starting location', exact: true }).fill('hotel'); await expect(page.getByRole('region', { name: 'Starting location picker', exact: true }).getByRole('alert')).toContainText('Configure');
  await expect(page.getByRole('listbox', { name: 'Starting location suggestions', exact: true }).getByRole('option')).toHaveCount(0); await expect(page.locator('.validated-location')).toHaveCount(0);
});

test('localhost preview reaches destination and GPS endpoints without an origin rejection', async ({ page, context, baseURL }) => {
  const url = new URL('/?live=1', baseURL); url.hostname = 'localhost';
  await context.grantPermissions(['geolocation']); await context.setGeolocation({ ...coordinates, accuracy: 18 });
  await page.goto(url.href);
  const lookup = page.waitForResponse(response => response.url().endsWith('/api/locations/autocomplete'));
  await page.getByRole('combobox', { name: 'Destination city', exact: true }).fill('Jaipur');
  expect((await lookup).status()).toBe(503);
  await expect(page.getByRole('region', { name: 'Destination city picker', exact: true }).getByRole('alert')).toContainText('Configure');
  const reverse = page.waitForResponse(response => response.url().endsWith('/api/locations/reverse'));
  await page.getByRole('button', { name: 'Use my current location', exact: true }).click();
  expect((await reverse).status()).toBe(200);
  await expect(page.getByRole('region', { name: 'Starting location picker', exact: true })).toContainText('address could not be resolved');
  await expect(page.getByText(/This browser origin is not allowed/)).toHaveCount(0);
  await expect(page.locator('.validated-location')).toHaveCount(1);
});

test('one explicit GPS read resolves an address and flows unchanged through itinerary return and navigation', async ({ page, context }) => {
  const state = await mocks(page); await context.grantPermissions(['geolocation']); await context.setGeolocation({ ...coordinates, accuracy: 18 });
  await page.addInitScript(() => { const state = window as unknown as { gpsReads: number }; state.gpsReads = 0; const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation); navigator.geolocation.getCurrentPosition = (...args) => { state.gpsReads++; original(...args); }; });
  await page.goto('/?live=1'); await essentials(page, true); expect(await page.evaluate(() => (window as unknown as { gpsReads: number }).gpsReads)).toBe(0);
  await page.getByRole('button', { name: 'Use my current location', exact: true }).click(); await expect(page.getByText('Resolved browser address, provider supplied address', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { gpsReads: number }).gpsReads)).toBe(1); expect(state.reverses).toHaveLength(1); expect((state.reverses[0] as { coordinates: unknown }).coordinates).toEqual(coordinates);
  await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeEnabled(); await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  expect(state.routeInputs[0].returnToStart).toBe(true); expect(state.routeInputs[0].endId).toBeNull(); expect(state.selections.get(state.routeInputs[0].startId)!.coordinates).toEqual(coordinates);
  const href = await page.getByRole('link', { name: 'Navigate this leg in Google Maps', exact: true }).getAttribute('href'); expect(new URL(href!).searchParams.get('origin')).toBe('51.5,-0.12');
  await acceptGuide(page); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toContainText('Return to Resolved browser address');
});

test('permission denial and timeout expose retry and manual selection without a default source', async ({ page }) => {
  await mocks(page); await page.addInitScript(() => { let count = 0; navigator.geolocation.getCurrentPosition = (_success, error) => error!({ code: ++count === 1 ? 1 : 3 } as GeolocationPositionError); });
  await page.goto('/?live=1'); await page.getByRole('button', { name: 'Use my current location', exact: true }).click(); await expect(page.getByRole('region', { name: 'Starting location picker', exact: true }).getByRole('alert')).toContainText('permission was denied');
  await expect(page.getByRole('button', { name: 'Use my current location', exact: true })).toBeEnabled(); await page.getByRole('button', { name: 'Retry current location', exact: true }).click(); await expect(page.getByRole('region', { name: 'Starting location picker', exact: true }).getByRole('alert')).toContainText('took too long');
  await choose(page, 'Starting location', 'manualhotel'); await expect(page.getByRole('region', { name: 'Starting location picker', exact: true }).getByRole('alert')).toHaveCount(0);
});

test('GPS button is disabled during reverse geocoding and duplicate activation does not submit another request', async ({ page, context }) => {
  await mocks(page); await context.grantPermissions(['geolocation']); await context.setGeolocation({ ...coordinates, accuracy: 10 });
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); let count = 0;
  await page.route('**/api/locations/reverse', async route => { count++; const body = route.request().postDataJSON(); await held; await route.fulfill({ json: location('provider-gps-id', 'GPS address', { source: 'gps', coordinates: body.coordinates, accuracyMeters: body.accuracyMeters, observedAt: body.observedAt }) }); });
  await page.goto('/?live=1'); await choose(page, 'Starting location', 'previousmanualsource'); await page.getByRole('button', { name: 'Use my current location', exact: true }).click(); await expect(page.getByRole('button', { name: 'Finding and resolving your location…', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Finding and resolving your location…', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(() => count).toBe(1); release(); await expect(page.getByText('GPS address, provider supplied address', { exact: true })).toBeVisible(); expect(count).toBe(1);
});

test('autocomplete uses keyboard selection, invalidates edited text and handles empty and failed queries on a phone', async ({ page }) => {
  await mocks(page); await page.setViewportSize({ width: 320, height: 760 }); await page.goto('/?live=1'); await essentials(page);
  await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeEnabled(); await page.getByRole('combobox', { name: 'Starting location', exact: true }).fill('unselected'); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Starting location', exact: true }).press('Escape'); await page.getByRole('combobox', { name: 'Starting location', exact: true }).fill('nothing'); await expect(page.getByText('No suggestions returned. Try a fuller address or another spelling.', { exact: true })).toBeVisible();
  await page.route('**/api/locations/autocomplete', route => route.fulfill({ status: 502, json: { error: { code: 'PROVIDER_UNAVAILABLE', message: 'Provider temporarily unavailable. Retry.' } } }));
  await page.getByRole('combobox', { name: 'Starting location', exact: true }).fill('failure'); await expect(page.getByRole('region', { name: 'Starting location picker', exact: true }).getByRole('alert')).toContainText('Provider temporarily unavailable');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('late GPS and autocomplete callbacks cannot replace a newer searched selection', async ({ page }) => {
  const state = await mocks(page); await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = callback => { (window as unknown as { deliverGPS: PositionCallback }).deliverGPS = callback; }; });
  await page.goto('/?live=1'); await page.getByRole('button', { name: 'Use my current location', exact: true }).click(); await choose(page, 'Starting location', 'newhotel');
  await page.evaluate(() => (window as unknown as { deliverGPS: PositionCallback }).deliverGPS({ coords: { latitude: 48.85, longitude: 2.35, accuracy: 20 }, timestamp: Date.now() } as GeolocationPosition));
  await expect(page.getByRole('region', { name: 'Starting location picker', exact: true }).locator('.validated-location')).toContainText('Chosen provider-newhotel-id'); expect(state.reverses).toHaveLength(0);
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/locations/autocomplete', async route => { const body = route.request().postDataJSON(); if (body.input === 'olderquery') { await held; try { await route.fulfill({ json: { provider: 'google', suggestions: [{ placeId: 'provider-old-id', text: 'Older wrong result' }] } }); } catch { /* aborted browser request */ } } else await route.fulfill({ json: { provider: 'google', suggestions: [{ placeId: 'provider-newest-id', text: 'Newest provider result' }] } }); });
  const observed = page.waitForRequest(request => request.url().endsWith('/locations/autocomplete') && request.postDataJSON().input === 'olderquery'); await page.getByRole('combobox', { name: 'Starting location', exact: true }).fill('olderquery'); await observed;
  await page.getByRole('combobox', { name: 'Starting location', exact: true }).fill('newestquery'); await expect(page.getByRole('option', { name: 'Newest provider result', exact: true })).toBeVisible(); release(); await page.getByRole('combobox', { name: 'Starting location', exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Starting location picker', exact: true }).locator('.validated-location')).toContainText('Chosen provider-newest-id'); await expect(page.getByText('Older wrong result', { exact: true })).toHaveCount(0);
});

test('different starting city requires consent and selecting an in-city start never changes the trip destination', async ({ page, context }) => {
  await mocks(page, true); await context.grantPermissions(['geolocation']); await context.setGeolocation({ ...outsideCoordinates, accuracy: 20 }); await page.goto('/?live=1'); await essentials(page, true); await page.getByRole('button', { name: 'Use my current location', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Starting city review', exact: true })).toContainText('Other provider city'); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Travel from this starting location to my destination', exact: true }).check(); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Select a start within the destination city', exact: true }).click(); await expect(page.getByRole('combobox', { name: 'Starting location', exact: true })).toHaveValue(''); await expect(page.getByRole('combobox', { name: 'Destination city', exact: true })).toHaveValue('Provider city');
  await choose(page, 'Starting location', 'destinationhotel'); await expect(page.getByRole('region', { name: 'Starting city review', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeEnabled();
});

test('return selection, saved provider references and accepted routes remain independent from later source edits', async ({ page }) => {
  const state = await mocks(page); await page.goto('/?live=1'); await essentials(page);
  await page.getByRole('checkbox', { name: 'Return to the same place', exact: true }).uncheck(); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeDisabled(); await choose(page, 'Return location', 'returnstation');
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible(); expect(state.routeInputs[0].returnToStart).toBe(false); expect(state.routeInputs[0].endId).not.toBe(state.routeInputs[0].startId);
  await acceptGuide(page); await page.getByRole('button', { name: 'My day plan', exact: true }).click(); await choose(page, 'Starting location', 'replacementhotel'); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Follow my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toContainText('Start: Chosen provider-hotel-id'); await page.getByRole('button', { name: 'My day plan', exact: true }).click();
  await page.getByLabel('Private day name', { exact: true }).fill('Private saved day'); await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', {name:'Guided itinerary review',exact:true})).toBeVisible(); await acceptGuide(page);
  await expect.poll(async () => (await savedAcceptedTrips(page)).length).toBe(2);
  const saved = await savedAcceptedTrips(page); expect(JSON.stringify(saved)).toContain('provider-replacementhotel-id'); expect(JSON.stringify(saved)).not.toContain('"receipt":');
  await page.getByRole('button', { name: 'Saved plans', exact: true }).click(); await page.locator('.saved-card').filter({ hasText: 'Private saved day' }).getByRole('button', { name: 'Open saved itinerary', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toContainText('Start: Chosen provider-replacementhotel-id');
});

test('Google map pin resolves a real selected point instead of using a default map center as the source', async ({ page }) => {
  const state = await mocks(page);
  await page.addInitScript(() => {
    class LatLng { constructor(private latitude: number, private longitude: number) {} lat() { return this.latitude; } lng() { return this.longitude; } }
    class Map { constructor(_element: HTMLElement, _options: unknown) {} setCenter() {} setZoom() {} fitBounds() {} addListener(_name: string, callback: (event: unknown) => void) { (window as unknown as { clickMap: (event: unknown) => void }).clickMap = callback; return { remove() {} }; } }
    class Marker { constructor(_options: unknown) {} setMap() {} }
    class Polyline extends Marker {} class Bounds { extend() {} }
    (window as unknown as { google: unknown }).google = { maps: { Map, Marker, Polyline, LatLng, LatLngBounds: Bounds, geometry: { encoding: { decodePath: () => [new LatLng(51.5, -0.12), new LatLng(51.51, -0.13)] } } } };
  });
  await page.goto('/?live=1'); await choose(page, 'Destination city', 'city'); await page.getByRole('button', { name: 'Select start with a map pin', exact: true }).click();
  await page.evaluate(() => (window as unknown as { clickMap: (event: unknown) => void }).clickMap({ latLng: { lat: () => 51.51, lng: () => -0.13 } }));
  await expect(page.getByRole('region', { name: 'Map pin review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use this starting point', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Starting location picker', exact: true }).locator('.validated-location')).toContainText('Selected map pin'); expect((state.reverses[0] as { coordinates: unknown }).coordinates).toEqual({ latitude: 51.51, longitude: -0.13 });
});
test('a late route preview cannot overwrite newer source edits', async ({ page }) => {
  await mocks(page); let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/guide/plan', async route => { await held; try { await route.fallback(); } catch { /* request was canceled by editing */ } });
  await page.goto('/?live=1'); await essentials(page); const started = page.waitForRequest(request => request.url().endsWith('/guide/plan')); await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await started;
  await choose(page, 'Starting location', 'newersource'); release(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toHaveCount(0); await expect(page.getByRole('combobox', { name: 'Starting location', exact: true })).toHaveValue('Chosen provider-newersource-id');
});
test('accepted price summaries stay with saved itineraries without a separate budget tab', async ({ page }) => {
  await mocks(page); await page.goto('/?live=1'); await essentials(page); await page.locator('.live-preferences summary').click(); await page.getByLabel('Budget currency', { exact: true }).selectOption('GBP');
  await page.getByLabel('Private day name', { exact: true }).fill('First priced trip');
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await acceptGuide(page);
  await expect(page.getByRole('button', { name: 'Trip budget', exact: true })).toHaveCount(0);
  await page.getByText('Add missing cost ranges', { exact: true }).click();
  await page.getByLabel('Additional food & drinks minimum', { exact: true }).fill('30'); await page.getByLabel('Additional food & drinks maximum', { exact: true }).fill('40');
  await page.getByRole('button', { name: 'Apply price ranges', exact: true }).click(); await expect(page.getByTestId('trip-price-range')).toHaveText('£30.00 – £40.00');
  await page.getByRole('button', { name: 'My day plan', exact: true }).click(); await page.getByLabel('Private day name', { exact: true }).fill('Second priced trip');
  await page.getByText('Adjust the planned visits', { exact: true }).click(); await page.getByLabel('Visit duration for Chosen provider-landmark-id', { exact: true }).fill('45');
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await acceptGuide(page);
  await page.getByRole('button', { name: 'Saved plans', exact: true }).click(); await expect(page.locator('.saved-card')).toHaveCount(2);
  await page.locator('.saved-card').filter({ hasText: 'First priced trip' }).getByRole('button', { name: 'Open saved itinerary', exact: true }).click();
  await expect(page.getByTestId('trip-price-range')).toHaveText('£30.00 – £40.00');
});
test('an invalid selected-place response never confirms typed text or substitutes coordinates', async ({ page }) => {
  await mocks(page); await page.route('**/api/locations/resolve', route => route.fulfill({ json: { ...location('provider-invalid-id', 'Invalid result'), coordinates: { latitude: 91, longitude: 0 } } }));
  await page.goto('/?live=1'); await page.getByRole('combobox', { name: 'Starting location', exact: true }).fill('invalid'); await expect(page.getByRole('listbox', { name: 'Starting location suggestions', exact: true }).getByRole('option')).toHaveCount(1); await page.getByRole('combobox', { name: 'Starting location', exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Starting location picker', exact: true }).getByRole('alert')).toContainText('invalid address or coordinates'); await expect(page.locator('.validated-location')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeDisabled();
});
test('manual progress and return reports are bound to the accepted real-location route', async ({ page }) => {
  await mocks(page); await page.clock.install(); await page.goto('/?live=1'); await essentials(page); await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await acceptGuide(page);
  await page.getByLabel('Completed visits', { exact: true }).selectOption('1'); await page.getByRole('button', { name: 'Record visit progress', exact: true }).click(); await expect(page.getByRole('alert').filter({ hasText: 'departs in the future' })).toBeVisible();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10); await page.clock.setSystemTime(new Date(zonedTime(tomorrow, '12:00', 'Europe/London')));
  await page.getByRole('button', { name: 'Record visit progress', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Return journey remains', exact: true })).toBeVisible();
  await page.getByLabel('Actual return arrival (Europe/London)', { exact: true }).fill(`${tomorrow}T11:59`); await page.getByRole('button', { name: 'Report return arrival', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Return reported', exact: true })).toBeVisible();
});
test('a completed autocomplete request remains available for selection after its timeout period', async ({ page }) => {
  await mocks(page); await page.clock.install(); await page.goto('/?live=1'); await page.getByRole('combobox', { name: 'Starting location', exact: true }).fill('waitingchoice'); const picker = page.getByRole('region', { name: 'Starting location picker', exact: true });
  await expect(picker.getByRole('option')).toHaveCount(1); await page.clock.fastForward(30000); await expect(picker.getByRole('alert')).toHaveCount(0); await expect(picker.getByRole('option')).toHaveCount(1); await expect(picker.locator('.validated-location')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Starting location', exact: true }).press('Enter'); await expect(picker.locator('.validated-location')).toBeVisible();
});
