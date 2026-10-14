import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { guidePreferencesSchema } from '../../../packages/contracts/src/guide';
import { pricedCandidate, groupCost } from '../../../packages/domain/src/travel-pricing';
import { budgetFor } from '../../../packages/domain/src/guide-planner';
import type { GuideCandidate, GuidePlan, GuidePlanRequest, GuideStop } from '../../../packages/contracts/src/guide';
import type { SelectedLocation } from '../../../packages/contracts/src/locations';
const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const identity = { placeId: 'provider-city-id', name: 'Provider city', countryCode: 'GB' };
const location = (name: string, city = false): SelectedLocation => ({ id: randomUUID(), placeId: name.replaceAll(' ', '-'), name, address: `${name}, provider address`, provider: 'google', source: 'search', coordinates: { latitude: 51.5, longitude: 0 }, city: identity, types: [city ? 'locality' : 'tourist_attraction'], ...(city ? { timezone: 'UTC' } : {}), fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1800000).toISOString(), persistence: 'memory_only', receiptStatus: 'registered' });
export async function setup(page: Page, withMeals = false, withPrices = false) {
  const createLocation = (name: string, city = false) => { const l = location(name, city); if (withPrices) l.city = { ...identity, name: 'Jaipur', countryCode: 'IN' }; return l; };
  const rates = { quote: async () => ({ rate: .01048, date, sourceUrl: 'https://api.frankfurter.dev/v2/rate/inr/usd' }) };
  const places = new Map<string, SelectedLocation>(), inputs: GuidePlanRequest[] = [], museum = createLocation(withPrices ? 'Nahargarh Fort' : 'Provider Museum'), garden = createLocation(withPrices ? 'City Palace' : 'Provider Garden');
  const bank: GuideCandidate[] = [museum, garden].map((l, i) => ({ location: l, score: 20, reasons: ['Fits your interests.'], suggestedMinutes: 30, facts: { categories: [i ? 'gardens' : 'museums'], environment: i ? 'outdoor' : 'indoor', rating: 4, reviews: 100, hours: { status: 'unknown', windows: [], description: [] }, admission: null, accessible: null, goodForChildren: null, vegetarianOptions: null, website: null, providerUri: null, description: null, checkedAt: new Date().toISOString() } }));
  const foodBank: GuideCandidate[] = ['Provider Lunch'].map(name => ({ ...bank[0], location: createLocation(name), facts: { ...bank[0].facts, categories: ['food'], hours: { status: 'date_specific', windows: [{ opens: `${date}T09:00:00Z`, closes: `${date}T22:00:00Z` }], description: [] } } }));
  for (const c of [...bank, ...foodBank]) places.set(c.location.id, c.location);
  await page.addInitScript(() => {
    class LatLng { constructor(private latitude: number, private longitude: number) {} lat() { return this.latitude; } lng() { return this.longitude; } }
    class Map { constructor(root: HTMLElement) { root.dataset.mapRendered = 'true'; } fitBounds() {} setCenter() {} setZoom() {} panTo() {} addListener() { return { remove() {} }; } }
    class Marker { constructor(private options: { position: { lat: number; lng: number } }) {} setMap() {} setAnimation() {} getPosition() { return this.options.position; } addListener() { return { remove() {} }; } }
    Object.assign(window, { google: { maps: { Map, Marker, LatLng, LatLngBounds: class { extend() {} }, Polyline: class { setMap() {} }, Animation: { BOUNCE: 1 }, geometry: { encoding: { decodePath: () => [new LatLng(51.5, 0), new LatLng(51.51, 0)] } } } } });
  });
  await page.route('**/api/locations/config', r => r.fulfill({ json: { autocomplete: true, reverseGeocode: true, timezone: true, routing: true, guideDiscovery: true, guideRouting: true, guideAssistant: 'local' } }));
  await page.route('**/api/locations/autocomplete', r => r.fulfill({ json: { provider: 'google', suggestions: [{ placeId: 'provider-search-id', text: 'Provider selected place' }] } }));
  await page.route('**/api/locations/resolve', async r => { const body = r.request().postDataJSON(); const l = createLocation(body.destinationCity ? withPrices ? 'Jaipur' : 'Provider city' : 'Provider start', body.destinationCity); places.set(l.id, l); await r.fulfill({ json: l }); });
  await page.route('**/api/guide/discover', async r => { const p = guidePreferencesSchema.parse(r.request().postDataJSON().preferences); await r.fulfill({ json: { candidates: withPrices ? await Promise.all(bank.map(c => pricedCandidate(c, p, rates))) : bank, warnings: ['Admission costs are unverified.'], assistantMode: 'local' } }); });
  await page.route('**/api/guide/plan', async r => {
    const body = r.request().postDataJSON() as GuidePlanRequest; inputs.push(body);
    let rows: GuideStop[] = body.orderMode === 'smart' && !body.stops.some(s => s.locked) ? [...body.stops].reverse() : body.stops;
    if (withMeals) {
      rows = rows.flatMap((row, i) => [row, ...(i === 0 && body.preferences.meals?.lunch.enabled ? [{ ...row, locationId: foodBank[0].location.id, durationMinutes: body.preferences.meals.lunch.durationMinutes, mealKind: 'lunch' as const }] : []), ]);
    }
    const destination = places.get(body.destinationId)!, start = places.get(body.startId)!, departure = Date.parse(`${body.date}T${body.startTime}:00Z`);
    let cursor = departure;
    const stops = rows.map(row => { cursor += 20 * 60000; if (row.mealKind === 'lunch') cursor = Math.max(cursor, Date.parse(`${body.date}T${body.preferences.meals!.lunch.startTime}:00Z`)); const arrivalAt = new Date(cursor).toISOString(); cursor += row.durationMinutes * 60000; return { location: places.get(row.locationId)!, durationMinutes: row.durationMinutes, arrivalAt, departureAt: new Date(cursor).toISOString() }; });
    const plan: GuidePlan = { orderMode: body.orderMode, assistantMode: 'local', itinerary: { destination, start, end: body.returnToStart ? start : places.get(body.endId!)!, stops, route: { provider: 'google_routes', mode: body.preferences.travelMode, durationSeconds: (rows.length + 1) * 600, distanceMeters: (rows.length + 1) * 3000, encodedPolyline: 'test-only-route', departureTime: new Date(departure).toISOString(), fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(), trafficBasis: 'prediction_for_departure', persistence: 'memory_only', legs: Array.from({ length: rows.length + 1 }, () => ({ durationSeconds: 600, distanceMeters: 3000 })), optimizedOrder: rows.map((_row, i) => i) }, finishAt: new Date(cursor + 600000).toISOString(), deadlineAt: `${body.date}T${body.endTime}:00Z`, withinTime: true, warnings: ['Confirm unverified venue facts.'] }, stops: rows.map(row => ({ locationId: row.locationId, ...(row.mealKind ? { mealKind: row.mealKind, mealDetour: { extraMinutes: 2, extraMeters: 500, fromPreviousMeters: 600 } } : {}), facts: [...bank, ...foodBank].find(c => c.location.id === row.locationId)!.facts, cost: null, reasons: ['Selected from verified IDs.'], bufferMinutes: 10, travelMinutes: 10, waitingMinutes: 0, hoursStatus: 'unknown' })), budget: { currency: body.preferences.currency, groupKnownMinimum: 0, groupKnownMaximum: 0, perPersonKnownMinimum: 0, perPersonKnownMaximum: 0, groupLimit: body.preferences.groupBudget, unknowns: ['Admission unknown; not free.'], status: 'unknown' }, assumptions: ['Durations are estimates.'], excluded: [], breaks: [], comparison: { evaluatedSequences: body.orderMode === 'smart' ? 4 : 1, originalTravelMinutes: 60, selectedTravelMinutes: 30 } };
    if (withPrices) {
      const p = guidePreferencesSchema.parse(body.preferences), priced = await Promise.all([...bank, ...foodBank].map(c => pricedCandidate(c, p, rates)));
      plan.budget = budgetFor(rows, priced, p, plan.itinerary.route.distanceMeters);
      plan.stops.forEach(row => { const facts = priced.find(c => c.location.id === row.locationId)!.facts; row.facts = facts; row.cost = facts.admission; if (row.cost) row.groupCost = { ...groupCost(row.cost, p), currency: row.cost.currency, basis: 'group' }; if (row.mealKind && facts.mealCost) row.mealCost = facts.mealCost; });
    }
    await r.fulfill({ json: plan });
  });
  await page.goto('/?live=1');
  for (const label of ['Destination city', 'Starting location']) { await page.getByRole('combobox', { name: label, exact: true }).fill('search'); await page.getByRole('listbox', { name: `${label} suggestions` }).getByRole('button').first().click(); await expect(page.getByRole('region', { name: `${label} picker` }).locator('.validated-location')).toBeVisible(); }
  await page.getByLabel('Travel date', { exact: true }).fill(date);
  return { inputs, bank };
}
