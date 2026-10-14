import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { guidePreferencesSchema, type GuidePlan } from '../packages/contracts/src/guide';
import type { SelectedLocation } from '../packages/contracts/src/locations';
import { localTripKey, readLocalTrip, writeLocalTrip, removeLocalTrip, type LocalTrip } from '../apps/web/src/live-session';
import { priceAllowancesSchema, pricePlanKey, tripPrice } from '../apps/web/src/trip-price';
import { tripShareText } from '../apps/web/src/trip-share';

// Mock provider evidence is confined to tests.
const now = new Date().toISOString();
function plan(): GuidePlan {
  const l = (name: string): SelectedLocation => ({ id: randomUUID(), placeId: `provider-${name}`, provider: 'google', source: 'search', name, address: `${name} address`, coordinates: { latitude: 51.5, longitude: 0 }, city: { placeId: 'provider-city', name: 'Provider city', countryCode: 'GB' }, types: ['locality'], timezone: 'UTC', fetchedAt: now, expiresAt: new Date(Date.now() + 1800000).toISOString(), persistence: 'memory_only' });
  const destination = l('city'), start = l('private-start'), end = l('private-return'), stop = l('museum');
  start.coordinates = { latitude: 51.123456, longitude: -0.654321 }; end.coordinates = { latitude: 51.987654, longitude: -0.112233 };
  return { orderMode: 'smart', assistantMode: 'local', itinerary: { destination, start, end, route: { provider: 'google_routes', mode: 'DRIVE', durationSeconds: 1200, distanceMeters: 4000, encodedPolyline: 'test-only-polyline', departureTime: now, fetchedAt: now, expiresAt: new Date(Date.now() + 300000).toISOString(), persistence: 'memory_only', trafficBasis: 'prediction_for_departure', optimizedOrder: [0], legs: [{ durationSeconds: 600, distanceMeters: 2000 }, { durationSeconds: 600, distanceMeters: 2000 }] }, stops: [{ location: stop, durationMinutes: 60, arrivalAt: now, departureAt: now }], finishAt: now, deadlineAt: now, withinTime: true, warnings: [] }, stops: [{ locationId: stop.id, facts: { categories: ['museums'], environment: 'indoor', rating: null, reviews: null, hours: { status: 'unknown', windows: [], description: [] }, admission: null, accessible: null, goodForChildren: null, vegetarianOptions: null, website: null, providerUri: null, description: null, checkedAt: now }, cost: null, reasons: [], bufferMinutes: 10, travelMinutes: 10, waitingMinutes: 0, hoursStatus: 'unknown' }], budget: { currency: 'USD', groupKnownMinimum: 100, groupKnownMaximum: 180, perPersonKnownMinimum: 50, perPersonKnownMaximum: 90, groupLimit: 300, unknowns: ['Parking unknown'], status: 'unknown' }, assumptions: [], excluded: [], breaks: [], comparison: { originalTravelMinutes: null, selectedTravelMinutes: 20, evaluatedSequences: 1 } };
}
function trip(): LocalTrip {
  const p = plan();
  return { version: 1, updatedAt: now, destination: p.itinerary.destination, start: p.itinerary.start, end: p.itinerary.end, sameReturn: false, outsideConsent: false, stops: p.itinerary.stops.map(s => ({ key: randomUUID(), location: s.location, durationMinutes: s.durationMinutes })), date: now.slice(0, 10), startTime: '09:00', endTime: '18:00', optimize: false, adults: 2, children: [], budget: '300', currency: 'USD', diet: [], title: 'Test private trip', preview: p.itinerary, guideReview: p, accepted: structuredClone(p.itinerary), acceptedGuide: structuredClone(p), acceptedId: randomUUID(), guideSaved: { preferences: guidePreferencesSchema.parse({ adults: 2, childAges: [], groupBudget: 300, currency: 'USD', dietaryRules: [] }), stops: [] }, view: 'day' };
}
function storage() {
  const rows = new Map<string, string>();
  return { rows, getItem: (k: string) => rows.get(k) ?? null, setItem: (k: string, v: string) => { rows.set(k, v); }, removeItem: (k: string) => { rows.delete(k); } };
}
it('restores draft and accepted snapshots independently with their original identities and expiry', () => {
  const store = storage(), value = trip(); value.title = 'Edited draft'; value.startTime = '10:00';
  writeLocalTrip(store, value); const restored = readLocalTrip(store);
  expect(restored.error).toBe(''); expect(restored.trip).toEqual(value);
  expect(restored.trip?.accepted?.route.departureTime).toBe(now);
});
it('preserves unreadable and unsupported local records instead of deleting or guessing data', () => {
  for (const raw of ['{bad', JSON.stringify({ ...trip(), version: 2 }), JSON.stringify({ ...trip(), acceptedId: null })]) {
    const store = storage(); store.setItem(localTripKey, raw); expect(readLocalTrip(store).error).toContain('preserved'); expect(store.getItem(localTripKey)).toBe(raw);
  }
});
it('failed writes and invalid snapshots leave the last saved trip intact; deletion is scoped', () => {
  const store = storage(), value = trip(); writeLocalTrip(store, value); const previous = store.getItem(localTripKey);
  const full = { ...store, setItem: () => { throw new Error('QuotaExceeded'); } };
  expect(() => writeLocalTrip(full, { ...value, title: 'Not saved' })).toThrow(); expect(store.getItem(localTripKey)).toBe(previous);
  expect(() => writeLocalTrip(store, { ...value, adults: NaN })).toThrow(); expect(store.getItem(localTripKey)).toBe(previous);
  store.setItem('another-app', 'keep'); removeLocalTrip(store); expect(store.getItem(localTripKey)).toBeNull(); expect(store.getItem('another-app')).toBe('keep');
});
it('unavailable local storage returns an actionable error', () => { expect(readLocalTrip({ ...storage(), getItem: () => { throw new Error('denied'); } }).error).toContain('could not be read'); });
it('whole-group ranges add missing allowances once, preserve unknowns and flag overruns', () => {
  const p = plan(), extra = priceAllowancesSchema.parse({ planKey: pricePlanKey(p), currency: 'USD', ranges: { food: { minimum: 80, maximum: 120 }, transport: { minimum: 20, maximum: 60 } } });
  expect(tripPrice(p, extra)).toMatchObject({ minimum: 200, maximum: 360, partial: true, overBudget: true });
  expect(p.budget.groupKnownMaximum).toBe(180);
});
it('allowances from another route or currency never change the current range', () => {
  const p = plan(), extra = { planKey: pricePlanKey(p), currency: 'EUR', ranges: { food: { minimum: 100, maximum: 200 } } };
  expect(tripPrice(p, extra).maximum).toBe(180);
  expect(tripPrice(p, { ...extra, currency: 'USD', planKey: 'another-route' }).maximum).toBe(180);
});
it('rejects negative, reversed, nonfinite and incomplete price ranges', () => {
  for (const range of [{ minimum: -1, maximum: 10 }, { minimum: 30, maximum: 20 }, { minimum: NaN, maximum: Infinity }, { minimum: 10 }]) expect(priceAllowancesSchema.safeParse({ planKey: 'plan', currency: 'USD', ranges: { food: range } }).success).toBe(false);
});
it('sharing hides private points and server IDs by default while retaining schedule and public place links', () => {
  const p = plan(), copy = tripShareText(p, 'My day', false, true);
  expect(copy).toContain('museum'); expect(copy).toContain('query_place_id=provider-museum'); expect(copy).toContain('Group price estimate:');
  for (const secret of [p.itinerary.start.address!, p.itinerary.end.address!, '51.123456', '-0.112233', p.stops[0].locationId, p.itinerary.start.id, 'test-only-polyline']) expect(copy).not.toContain(secret);
  const disclosed = tripShareText(p, 'My day', true, false);
  expect(disclosed).toContain('private-start address'); expect(disclosed).toContain('51.987654'); expect(disclosed).not.toContain('Group price estimate:');
});
