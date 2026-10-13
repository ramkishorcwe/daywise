import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { defaultMealPreferences, guidePreferencesSchema, type GuideCandidate, type GuidePlanRequest, type GuideStop, type TravelMatrix } from '../packages/contracts/src/guide';
import type { LiveRoute, SelectedLocation } from '../packages/contracts/src/locations';
import { chooseMealInsertion, validateMealDetours } from '../packages/domain/src/meal-planner';
import { budgetFor, scheduleGuide } from '../packages/domain/src/guide-planner';
import { GoogleGuidePlaces } from '../packages/data-adapters/src/google-guide';

// Provider fixtures are restricted to tests. Production meals require provider receipts.
const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const at = (clock: string) => `${date}T${clock}:00.000Z`;
function setup() {
  const place = (name: string, food = false): GuideCandidate => ({ location: { id: randomUUID(), placeId: `test-provider-${name}`, name, address: 'Test provider address', coordinates: { latitude: 51, longitude: 0 }, provider: 'google', source: 'search', city: { placeId: 'test-provider-city', name: 'Test city', countryCode: 'GB' }, types: [food ? 'restaurant' : 'museum'], timezone: 'UTC', fetchedAt: at('00:00'), expiresAt: at('23:59'), persistence: 'memory_only' }, facts: { categories: [food ? 'food' : 'museums'], environment: 'unknown', rating: 4, reviews: 100, hours: { status: 'date_specific', windows: [{ opens: at('09:00'), closes: at('22:00') }], description: [] }, admission: null, accessible: null, goodForChildren: null, vegetarianOptions: null, website: null, providerUri: null, description: null, checkedAt: at('00:00') }, suggestedMinutes: 30, reasons: [], score: 1 });
  const candidates = [place('museum'), place('gallery'), place('nearby-food', true), place('distant-food', true)];
  const choice = (c: GuideCandidate): GuideStop => ({ locationId: c.location.id, durationMinutes: 30, mustVisit: false, locked: false, preferredTime: null, costEstimate: null });
  const order = candidates.slice(0, 2).map(choice);
  const preferences = guidePreferencesSchema.parse({ adults: 2, childAges: [], groupBudget: null, currency: 'USD', dietaryRules: [], bufferMinutes: 0, mealBreak: true, restBreaks: false, meals: { ...structuredClone(defaultMealPreferences), lunch: { enabled: true, startTime: '12:00', endTime: '14:00', durationMinutes: 45 } } });
  const input: GuidePlanRequest = { destinationId: randomUUID(), startId: randomUUID(), endId: null, returnToStart: true, allowOutsideStart: false, date, startTime: '11:00', endTime: '21:00', preferences, orderMode: 'manual', stops: order };
  const matrix: TravelMatrix = Array.from({ length: candidates.length + 2 }, (_, i) => Array.from({ length: candidates.length + 2 }, (_, j) => ({ durationSeconds: i === j ? 0 : 120, distanceMeters: i === j ? 0 : 400 })));
  return { candidates, order, input, matrix, destination: candidates[0].location as SelectedLocation };
}

it('inserts a timed nearby lunch without changing attraction order or duplicating generic meal time', () => {
  const a = setup(), order = chooseMealInsertion(a.order, a.candidates, a.candidates.slice(2), a.input, a.destination, a.matrix, 'lunch');
  expect(order.filter(s => !s.mealKind)).toEqual(a.order);
  const indices = [0, ...order.map(s => a.candidates.findIndex(c => c.location.id === s.locationId) + 1), a.candidates.length + 1];
  const schedule = scheduleGuide(order, a.candidates, a.input, a.destination, indices.slice(1).map((to, i) => a.matrix[indices[i]][to]!), Date.parse(at('00:00')))!;
  const meal = schedule.rows.find(r => r.stop.mealKind)!;
  expect(meal.arrival).toBeGreaterThanOrEqual(Date.parse(at('12:00')));
  expect(meal.departure).toBeLessThanOrEqual(Date.parse(at('14:00')));
  expect(meal.stop.durationMinutes).toBe(45);
  expect(schedule.breaks.filter(b => b.kind === 'meal')).toEqual([]);
});

it('rejects a nearby restaurant whose onward road causes a large detour', () => {
  const a = setup();
  for (let next = 1; next < a.matrix.length; next++) a.matrix[3][next] = { durationSeconds: 3600, distanceMeters: 20000 };
  expect(() => chooseMealInsertion(a.order, a.candidates, [a.candidates[2]], a.input, a.destination, a.matrix, 'lunch')).toThrow('detour');
});

it('rejects distant, closed, unknown-hours and explicitly incompatible restaurants', () => {
  for (const failure of ['far', 'closed', 'unknown', 'food', 'missing', 'service'] as const) {
    const a = setup();
    if (failure === 'service') a.candidates[2].facts.mealServices = { lunch: false, dinner: true };
    if (failure === 'far') { a.matrix[1][3]!.distanceMeters = 4000; a.matrix[2][3]!.distanceMeters = 4000; }
    if (failure === 'closed' || failure === 'unknown') a.candidates[2].facts.hours.status = failure;
    if (failure === 'food') { a.input.preferences.dietaryRules = ['vegetarian']; a.candidates[2].facts.vegetarianOptions = false; }
    if (failure === 'missing') { a.matrix[1][3] = null; a.matrix[2][3] = null; }
    expect(() => chooseMealInsertion(a.order, a.candidates, [a.candidates[2]], a.input, a.destination, a.matrix, 'lunch')).toThrow('No lunch');
  }
});

it('respects the next visit closing time, explicit appointment and return deadline', () => {
  for (const failure of ['closing', 'appointment', 'deadline'] as const) {
    const a = setup(); a.input.preferences.meals!.lunch.startTime = '13:00';
    a.order[1].preferredTime = '12:30';
    if (failure === 'closing') a.candidates[2].facts.hours.windows[0].closes = at('13:30');
    if (failure === 'appointment') { a.candidates[1].facts.hours.windows[0].closes = at('13:00'); a.input.preferences.meals!.lunch.startTime = '12:00'; a.input.preferences.meals!.lunch.endTime = '13:00'; }
    if (failure === 'deadline') a.input.endTime = '13:30';
    expect(() => chooseMealInsertion(a.order, a.candidates, [a.candidates[2]], a.input, a.destination, a.matrix, 'lunch')).toThrow('No lunch');
  }
});

it('Any food retains unknown preparation honestly, and the group meal budget is counted once', () => {
  const a = setup(); a.candidates[2].facts.vegetarianOptions = false;
  const order = chooseMealInsertion(a.order, a.candidates, [a.candidates[2]], a.input, a.destination, a.matrix, 'lunch');
  a.input.preferences.mealGroupEstimate = 80;
  const budget = budgetFor(order, a.candidates, a.input.preferences);
  expect(budget.groupKnownMaximum).toBe(80); expect(budget.status).toBe('unknown');
  a.input.preferences.groupBudget = 50;
  expect(() => chooseMealInsertion(a.order, a.candidates, [a.candidates[2]], a.input, a.destination, a.matrix, 'lunch')).toThrow('No lunch');
});

it('supports both meals with their own windows and durations, including dinner after the last visit', () => {
  const a = setup(); a.input.preferences.meals!.dinner.enabled = true;
  const lunch = chooseMealInsertion(a.order, a.candidates, [a.candidates[2]], a.input, a.destination, a.matrix, 'lunch');
  const both = chooseMealInsertion(lunch, a.candidates, [a.candidates[3]], a.input, a.destination, a.matrix, 'dinner');
  expect(both.filter(s => s.mealKind).map(s => s.mealKind)).toEqual(['lunch', 'dinner']);
  expect(both.filter(s => !s.mealKind)).toEqual(a.order);
  expect(both.find(s => s.mealKind === 'dinner')!.durationMinutes).toBe(60);
});

it('retains known restaurant entry charges alongside the group food allowance and enforces the budget', () => {
  const a = setup(); a.input.preferences.mealGroupEstimate = 80;
  a.candidates[2].facts.admission = { minimum: 15, maximum: 15, currency: 'USD', basis: 'person', source: 'reviewed_catalog', sourceUrl: 'https://official.example/cover' };
  const order = chooseMealInsertion(a.order, a.candidates, [a.candidates[2]], a.input, a.destination, a.matrix, 'lunch');
  expect(budgetFor(order, a.candidates, a.input.preferences).groupKnownMaximum).toBe(110);
  a.input.preferences.groupBudget = 100;
  expect(() => chooseMealInsertion(a.order, a.candidates, [a.candidates[2]], a.input, a.destination, a.matrix, 'lunch')).toThrow('No lunch');
});

it('rechecks detour limits against the final Google route rather than accepting a stale matrix estimate', () => {
  const a = setup(), order = chooseMealInsertion(a.order, a.candidates, [a.candidates[2]], a.input, a.destination, a.matrix, 'lunch');
  const legs = Array.from({ length: order.length + 1 }, () => ({ durationSeconds: 120, distanceMeters: 400 }));
  const route = { legs } as LiveRoute;
  expect(validateMealDetours(order, a.candidates, a.matrix, a.input, route).find(Boolean)?.extraMinutes).toBe(2);
  route.legs[order.findIndex(s => s.mealKind)].distanceMeters = 6000;
  expect(() => validateMealDetours(order, a.candidates, a.matrix, a.input, route)).toThrow('detour limits');
});

it('requests real nearby restaurants with a restricted radius and excludes duplicates and closed results', async () => {
  const raw = { id: 'test-provider-restaurant', displayName: { text: 'Test restaurant' }, formattedAddress: 'Test address', location: { latitude: 51, longitude: 0 }, types: ['restaurant'] };
  const request = vi.fn<typeof fetch>(async () => Response.json({ places: [raw, raw, { ...raw, id: 'test-provider-closed', businessStatus: 'CLOSED_TEMPORARILY' }, { ...raw, id: 'test-provider-museum', types: ['museum'] }] }));
  expect(await new GoogleGuidePlaces('test-key', request).nearbyRestaurants(raw.location, 1500)).toHaveLength(1);
  const payload = JSON.parse(request.mock.calls[0][1]!.body as string);
  expect(payload.locationRestriction.circle.radius).toBe(1500); expect(payload.rankPreference).toBe('DISTANCE'); expect(payload.includedTypes).toEqual(['restaurant']);
  await expect(new GoogleGuidePlaces('test-key', async () => new Response('', { status: 403 })).nearbyRestaurants(raw.location, 1500)).rejects.toThrow('Google rejected');
});
