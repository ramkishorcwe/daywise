import { afterEach, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { guidePreferencesSchema, guidePlanRequestSchema, type GuideCandidate, type GuidePlanRequest, type GuideStop, type TravelMatrix } from '../packages/contracts/src/guide';
import { locationSchema, type SelectedLocation } from '../packages/contracts/src/locations';
import { candidateScore, suggestedVisitMinutes, budgetFor, chooseGuideOrder, guideResult } from '../packages/domain/src/guide-planner';
import { openingWindows, GoogleGuidePlaces, type GuidePlace } from '../packages/data-adapters/src/google-guide';
import { GoogleRoutes, type LiveRouteProvider } from '../packages/data-adapters/src/google';
import { OpenAIInterpreter } from '../packages/data-adapters/src/assistant';
import { createServer } from '../apps/api/src/server';
import { localAuthenticator } from '../apps/api/src/auth';
import { LocalTripStore } from '../apps/api/src/store';
import { zonedTime } from '../packages/domain/src/time';
import type { FastifyInstance } from 'fastify';
import { EvidenceReceipts } from '../apps/api/src/receipts';

// Deterministic test-only provider facts; never imported by the production app.
const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10), city = { placeId: 'canonical-provider-city', name: 'Provider city', countryCode: 'GB' };
const preferences = () => guidePreferencesSchema.parse({ adults: 2, childAges: [], groupBudget: null, currency: 'USD', dietaryRules: [], bufferMinutes: 0, mealBreak: false, restBreaks: false });
const location = (i = 0): SelectedLocation => locationSchema.parse({ id: randomUUID(), provider: 'google', source: 'search', placeId: `provider-place-${i}`, name: `Candidate ${i}`, address: 'Test provider address', coordinates: { latitude: 51 + i / 100, longitude: 0 }, city, types: ['tourist_attraction'], fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1800000).toISOString(), persistence: 'memory_only', receiptStatus: 'registered', timezone: 'UTC' });
function candidate(i: number, categories: GuideCandidate['facts']['categories'] = ['history']): GuideCandidate { return { location: location(i), suggestedMinutes: 30, score: 20, reasons: ['Test provider result'], facts: { categories, environment: 'unknown', rating: 4, reviews: 100, hours: { status: 'date_specific', windows: [{ opens: new Date(zonedTime(date, '09:00', 'UTC')).toISOString(), closes: new Date(zonedTime(date, '20:00', 'UTC')).toISOString() }], description: [] }, admission: null, accessible: null, goodForChildren: null, vegetarianOptions: null, website: null, providerUri: null, description: null, checkedAt: new Date().toISOString() } }; }
const choice = (c: GuideCandidate): GuideStop => ({ locationId: c.location.id, durationMinutes: 30, mustVisit: false, locked: false, preferredTime: null, costEstimate: null });
function input(cs: GuideCandidate[]): GuidePlanRequest { return guidePlanRequestSchema.parse({ destinationId: randomUUID(), startId: randomUUID(), endId: null, returnToStart: true, allowOutsideStart: false, date, startTime: '09:00', endTime: '18:00', preferences: preferences(), orderMode: 'smart', stops: cs.map(choice) }); }
function matrix(count: number, minutes = 10): TravelMatrix { return Array.from({ length: count + 2 }, (_, i) => Array.from({ length: count + 2 }, (_, j) => ({ durationSeconds: i === j ? 0 : minutes * 60, distanceMeters: i === j ? 0 : minutes * 300 }))); }
function bestMatrix(): TravelMatrix { const m = matrix(3, 30); for (const [a, b] of [[0, 2], [2, 3], [3, 1], [1, 4]]) m[a][b] = { durationSeconds: 120, distanceMeters: 300 }; return m; }
it('scores first-time candidates from interests and real popularity, and exposes duration assumptions', () => {
  const a = candidate(1, ['history']), b = candidate(2, ['temples']), p = { ...preferences(), interests: ['temples'] as const };
  expect(candidateScore(b, { ...p, interests: [...p.interests] }).score).toBeGreaterThan(candidateScore(a, { ...p, interests: [...p.interests] }).score);
  expect(suggestedVisitMinutes(a.facts, { ...preferences(), pace: 'relaxed' })).toBeGreaterThan(suggestedVisitMinutes(a.facts, { ...preferences(), pace: 'packed' }));
});
it('selects the interest-matching attraction when only one can fit', () => { const cs = [candidate(1, ['history']), candidate(2, ['temples'])], body = input(cs); body.preferences.interests = ['temples']; body.endTime = '10:00'; const result = chooseGuideOrder(body, location(), cs, matrix(2)); expect(result.order).toHaveLength(1); expect(result.order[0].locationId).toBe(cs[1].location.id); });
it('avoids counting several provider-confirmed sub-attractions in one complex as separate long visits', () => {
  const cs = [candidate(1), candidate(2), candidate(3)], body = input(cs); cs[1].location.coordinates = { ...cs[0].location.coordinates, latitude: cs[0].location.coordinates.latitude + 0.0001 }; cs[1].facts.containingPlaceIds = [cs[0].location.placeId!];
  const result = chooseGuideOrder(body, location(), cs, matrix(3)); expect(result.order).toHaveLength(2); expect(result.order.some(s => s.locationId === cs[2].location.id)).toBe(true);
  body.stops[0].mustVisit = true; body.stops[1].mustVisit = true; expect(chooseGuideOrder(body, location(), cs, matrix(3)).order).toHaveLength(3);
  cs[1].facts.containingPlaceIds = []; expect(chooseGuideOrder(input(cs), location(), cs, matrix(3)).order).toHaveLength(3);
});
it('compares alternate sequences and reduces actual matrix travel rather than discovery order', () => { const cs = [candidate(1), candidate(2), candidate(3)], result = chooseGuideOrder(input(cs), location(), cs, bestMatrix()); expect(result.order.map(s => s.locationId)).toEqual([cs[1].location.id, cs[2].location.id, cs[0].location.id]); expect(result.evaluated).toBeGreaterThan(1); expect(result.schedule.travelSeconds / 60).toBeLessThan(result.originalTravelMinutes!); });
it('starting and final points influence the route', () => { const cs = [candidate(1), candidate(2), candidate(3)], m = bestMatrix(); m[0][2] = { durationSeconds: 3600, distanceMeters: 10000 }; m[0][3] = { durationSeconds: 30, distanceMeters: 100 }; m[3][2] = { durationSeconds: 30, distanceMeters: 100 }; m[2][1] = { durationSeconds: 30, distanceMeters: 100 }; const result = chooseGuideOrder(input(cs), location(), cs, m); expect(result.order[0].locationId).toBe(cs[2].location.id); });
it('never schedules a visit after a supplied closing window', () => { const cs = [candidate(1), candidate(2)], body = input(cs); cs[0].facts.hours.windows[0].closes = new Date(zonedTime(date, '09:45', 'UTC')).toISOString(); const m = matrix(2); m[0][1] = { durationSeconds: 30, distanceMeters: 100 }; m[0][2] = { durationSeconds: 1800, distanceMeters: 2000 }; const result = chooseGuideOrder(body, location(), cs, m); expect(result.order[0].locationId).toBe(cs[0].location.id); expect(result.schedule.rows[0].departure).toBeLessThanOrEqual(Date.parse(cs[0].facts.hours.windows[0].closes)); });
it('preserves feasible must-visits and position locks', () => { const cs = [candidate(1), candidate(2), candidate(3)], body = input(cs); body.stops[0].locked = true; body.stops[2].mustVisit = true; const result = chooseGuideOrder(body, location(), cs, bestMatrix()); expect(result.order[0].locationId).toBe(cs[0].location.id); expect(result.order.some(s => s.locationId === cs[2].location.id)).toBe(true); });
it('refuses an infeasible must-visit rather than creating an impossible day', () => { const cs = [candidate(1)], body = input(cs); body.stops[0].mustVisit = true; cs[0].facts.hours.status = 'closed'; expect(() => chooseGuideOrder(body, location(), cs, matrix(1))).toThrow('must-visit'); });
it('places an evening must-visit within its supported window and user-selected arrival time', () => { const cs = [candidate(1), candidate(2)], body = input(cs); body.endTime = '20:00'; cs[1].facts.hours.windows = [{ opens: new Date(zonedTime(date, '17:00', 'UTC')).toISOString(), closes: new Date(zonedTime(date, '19:00', 'UTC')).toISOString() }]; body.stops[1].mustVisit = true; body.stops[1].preferredTime = '17:30'; const result = chooseGuideOrder(body, location(), cs, matrix(2)); expect(result.schedule.rows.find(r => r.candidate.location.id === cs[1].location.id)!.arrival).toBe(zonedTime(date, '17:30', 'UTC')); });
it('Gemini time bands remain soft preferences and cannot override an actual closing window', () => {
  const cs = [candidate(1)], body = input(cs); body.stops[0].timeBand = 'evening'; body.stops[0].durationSource = 'gemini_estimate'; body.stops[0].mustVisit = true;
  cs[0].facts.hours.windows[0].closes = new Date(zonedTime(date, '11:00', 'UTC')).toISOString();
  const result = chooseGuideOrder(body, location(), cs, matrix(1)); expect(result.order).toHaveLength(1); expect(result.schedule.rows[0].departure).toBeLessThan(Date.parse(cs[0].facts.hours.windows[0].closes));
});
it('manual order remains unchanged until smart reoptimization is requested', () => { const cs = [candidate(1), candidate(2), candidate(3)], body = input(cs); body.orderMode = 'manual'; expect(chooseGuideOrder(body, location(), cs, bestMatrix()).order.map(s => s.locationId)).toEqual(body.stops.map(s => s.locationId)); body.orderMode = 'smart'; expect(chooseGuideOrder(body, location(), cs, bestMatrix()).order.map(s => s.locationId)).not.toEqual(body.stops.map(s => s.locationId)); });
it('removing and adding a candidate changes the evaluated route and never adds missing edges', () => { const cs = [candidate(1), candidate(2)], body = input(cs), m = matrix(2); m[0][1] = null; m[2][1] = null; const result = chooseGuideOrder(body, location(), cs, m); expect(result.order.map(s => s.locationId)).toEqual([cs[1].location.id]); body.stops = [body.stops[0]]; expect(() => chooseGuideOrder(body, location(), cs, m)).toThrow('No feasible'); });
it('verified free and affordable options outrank unaffordable optional admissions under the budget', () => { const cs = [candidate(1), candidate(2)], body = input(cs); body.preferences.groupBudget = 50; cs[0].facts.admission = { minimum: 40, maximum: 40, currency: 'USD', basis: 'person', source: 'reviewed_catalog', sourceUrl: 'https://official.example/admission' }; cs[1].facts.admission = { ...cs[0].facts.admission, minimum: 0, maximum: 0 }; const result = chooseGuideOrder(body, location(), cs, matrix(2)); expect(result.order.map(s => s.locationId)).toEqual([cs[1].location.id]); body.stops[0].mustVisit = true; expect(() => chooseGuideOrder(body, location(), cs, matrix(2))).toThrow('No feasible'); });
it('group and per-person costs and limits are separate; unknown fees are never marked free', () => { const cs = [candidate(1)], p = { ...preferences(), adults: 3, childAges: [8], groupBudget: 100, perPersonBudget: 20 }; cs[0].facts.admission = { minimum: 10, maximum: 12, currency: 'USD', basis: 'person', source: 'reviewed_catalog', sourceUrl: 'https://official.example/admission' }; const b = budgetFor(cs.map(choice), cs, p); expect(b.groupKnownMaximum).toBe(48); expect(b.perPersonKnownMaximum).toBe(12); expect(b.groupLimit).toBe(80); expect(b.status).toBe('unknown'); cs[0].facts.admission = null; expect(budgetFor(cs.map(choice), cs, p).unknowns.join(' ')).toContain('admission/activities unknown'); });
it('group transport estimates change with provider route distance', () => { const cs = [candidate(1)], p = { ...preferences(), transportPerKmEstimate: 2 }; expect(budgetFor(cs.map(choice), cs, p, 10000).groupKnownMaximum - budgetFor(cs.map(choice), cs, p, 2000).groupKnownMaximum).toBe(16); });
it('considers the full bounded shortlist, including an affordable eighth candidate, without exceeding five visits', () => {
  const cs = Array.from({ length: 8 }, (_, i) => candidate(i + 1)), body = input(cs); body.preferences.groupBudget = 0;
  for (let i = 0; i < cs.length; i++) cs[i].facts.admission = { minimum: i === 7 ? 0 : 20, maximum: i === 7 ? 0 : 20, currency: 'USD', basis: 'person', source: 'reviewed_catalog', sourceUrl: 'https://official.example/admission' };
  const result = chooseGuideOrder(body, location(), cs, matrix(8)); expect(result.order.map(s => s.locationId)).toEqual([cs[7].location.id]); expect(result.evaluated).toBeLessThanOrEqual(8800);
});
it('honors visited, wheelchair and child suitability constraints without inventing evidence', () => { const cs = [candidate(1), candidate(2)], body = input(cs); body.preferences.mobility = 'wheelchair'; cs[0].facts.accessible = false; body.preferences.visitedPlaceIds = [cs[0].location.placeId!]; expect(chooseGuideOrder(body, location(), cs, matrix(2)).order[0].locationId).toBe(cs[1].location.id); body.preferences.mobility = 'standard'; body.preferences.visitedPlaceIds = []; body.preferences.childAges = [7]; cs[0].facts.goodForChildren = false; cs[1].facts.goodForChildren = true; expect(chooseGuideOrder(body, location(), cs, matrix(2)).order.map(s => s.locationId)).toEqual([cs[1].location.id]); expect(candidateScore(cs[1], body.preferences).score).toBeGreaterThan(candidateScore(cs[0], body.preferences).score); });
it('supports unknown hours honestly while rejecting a closed day and malformed cost ranges', () => { const cs = [candidate(1)], body = input(cs); cs[0].facts.hours.status = 'unknown'; cs[0].facts.hours.windows = []; expect(chooseGuideOrder(body, location(), cs, matrix(1)).order).toHaveLength(1); expect(guidePlanRequestSchema.safeParse({ ...body, stops: [{ ...body.stops[0], costEstimate: { minimum: 10, maximum: 5, currency: 'USD', basis: 'person' } }] }).success).toBe(false); });
const rawPlace = (id: string): GuidePlace => { const calendar = { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8)) }; const weekday = new Date(date + 'T12:00:00Z').getUTCDay(); return { id, displayName: { text: 'Provider museum' }, formattedAddress: 'Provider address', location: { latitude: 51.01, longitude: 0 }, types: ['museum'], currentOpeningHours: { periods: [{ open: { date: calendar, day: weekday, hour: 9, minute: 0 }, close: { date: calendar, day: weekday, hour: 18, minute: 0 } }] } }; };
it('uses dated Google opening periods, recognizes closure, and leaves missing hours unknown', () => { const raw = rawPlace('provider-raw-place'); expect(openingWindows(raw, date, 'UTC').status).toBe('date_specific'); expect(openingWindows({ ...raw, currentOpeningHours: { periods: [] } }, date, 'UTC').status).toBe('closed'); expect(openingWindows({ ...raw, currentOpeningHours: undefined }, date, 'UTC').status).toBe('unknown'); });
it('deduplicates discovery, excludes permanently closed and unlocated results, and requests actual facts', async () => { const raw = rawPlace('provider-raw-place'), request = vi.fn<typeof fetch>(async () => Response.json({ places: [raw, raw, { ...raw, id: 'closed-provider-place', businessStatus: 'CLOSED_PERMANENTLY' }, { ...raw, id: 'unlocated-provider-place', location: undefined }] })); const result = await new GoogleGuidePlaces('mock-key', request).discover('Provider city', { latitude: 51, longitude: 0 }, preferences()); expect(result).toHaveLength(1); const options = request.mock.calls[0][1]!; expect(JSON.parse(options.body as string).textQuery).toContain('Provider city'); expect(JSON.stringify(options.headers)).toContain('currentOpeningHours'); });
it('provider discovery failure is actionable and never returns sample attractions', async () => { await expect(new GoogleGuidePlaces('mock-key', async () => new Response('', { status: 403 })).discover('Provider city', { latitude: 51, longitude: 0 }, preferences())).rejects.toThrow('Google rejected'); });
it('matrix handles omitted protobuf zero indices and unavailable edges without fictitious travel', async () => { const request = vi.fn<typeof fetch>(async () => Response.json([{ condition: 'ROUTE_EXISTS', duration: '0s', status: {} }, { destinationIndex: 1, condition: 'ROUTE_NOT_FOUND', status: { code: 5 } }])); const result = await new GoogleRoutes('mock-key', request).matrix([{ latitude: 51, longitude: 0 }, { latitude: 52, longitude: 0 }], new Date().toISOString(), 'WALK'); expect(result[0][0]).toEqual({ durationSeconds: 0, distanceMeters: 0 }); expect(result[0][1]).toBeNull(); const body = JSON.parse(request.mock.calls[0][1]!.body as string); expect(body.travelMode).toBe('WALK'); expect(body.departureTime).toBeUndefined(); });
it('AI ranks only supplied IDs, rejects hallucinated IDs, and never receives GPS coordinates', async () => { const cs = [candidate(1), candidate(2)], context = { preferences: preferences(), candidates: cs.map(c => ({ id: c.location.id, name: c.location.name, categories: c.facts.categories, rating: c.facts.rating, reviews: c.facts.reviews })) }; const request = vi.fn<typeof fetch>(async () => Response.json({ status: 'completed', output: [{ type: 'function_call', name: 'rank_verified_candidates', arguments: JSON.stringify({ rankedIds: [randomUUID()], interests: ['history'] }) }] })); await expect(new OpenAIInterpreter('mock-key', 'configured-model', request).rankGuide(context)).rejects.toThrow('unverified'); expect(JSON.parse(request.mock.calls[0][1]!.body as string).store).toBe(false); expect(request.mock.calls[0][1]!.body).not.toContain('latitude'); });

const servers: FastifyInstance[] = []; afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(servers.splice(0).map(s => s.close())); });
async function api(extra: Partial<Parameters<typeof createServer>[0]> = {}, profile = preferences()) {
  const auth = localAuthenticator(randomBytes(32)), matrixCall = vi.fn<NonNullable<LiveRouteProvider['matrix']>>(async points => matrix(points.length - 2)), routeCall = vi.fn<LiveRouteProvider['itinerary']>(async (_start, _end, stops, departureTime, _optimize, _signal, mode = 'DRIVE') => ({ provider: 'google_routes', mode, durationSeconds: (stops.length + 1) * 600, distanceMeters: (stops.length + 1) * 3000, encodedPolyline: 'test-only-polyline', departureTime, fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(), trafficBasis: 'prediction_for_departure', persistence: 'memory_only', legs: Array.from({ length: stops.length + 1 }, () => ({ durationSeconds: 600, distanceMeters: 3000 })), optimizedOrder: stops.map((_p, i) => i) }));
  const app = await createServer({ auth, store: new LocalTripStore(), fixtures: false, webOrigin: 'http://127.0.0.1:5174', locations: { autocomplete: async () => ({ provider: 'google', suggestions: [] }), details: async id => ({ placeId: id, name: 'Provider city', address: 'Provider address', coordinates: { latitude: 51, longitude: 0 }, types: ['locality'] }), reverse: async coordinates => { const value = location(); return { ...value, coordinates }; }, timezone: async () => 'UTC' }, guide: { discover: async () => [rawPlace('provider-visit-one'), rawPlace('provider-visit-two')], facts: async id => rawPlace(id) }, liveRoutes: { matrix: matrixCall, itinerary: routeCall } as unknown as Parameters<typeof createServer>[0]['liveRoutes'], ...extra }); servers.push(app);
  const token = auth.issue!().token, post = (path: string, body: unknown, key = randomUUID(), otherToken = token) => app.inject({ method: 'POST', url: path, headers: { authorization: `Bearer ${otherToken}`, 'idempotency-key': key, 'content-type': 'application/json' }, payload: JSON.stringify(body) });
  const destination = (await post('/api/locations/resolve', { placeId: 'provider-destination', sessionToken: randomUUID(), destinationCity: true })).json<SelectedLocation>();
  const discovery = await post('/api/guide/discover', { destinationId: destination.id, date, preferences: profile });
  const candidates = discovery.statusCode === 200 ? discovery.json().candidates as GuideCandidate[] : [];
  const body = input(candidates.length ? candidates : [candidate(999)]); body.destinationId = destination.id; body.startId = destination.id; body.preferences = profile;
  return { app, post, body, candidates, auth, token, matrixCall, routeCall, discovery };
}

it('plans on a new hosted replica with authentic location and guide receipts, and rejects forged facts', async () => {
  const receipts = new EvidenceReceipts(randomBytes(32).toString('base64url'));
  const first = await api({ receipts });
  const second = await createServer({ auth: first.auth, store: new LocalTripStore(), fixtures: false, webOrigin: 'http://127.0.0.1:5174', receipts, liveRoutes: { matrix: first.matrixCall, itinerary: first.routeCall } as unknown as Parameters<typeof createServer>[0]['liveRoutes'] }); servers.push(second);
  // The destination is also the start in this regression. Its receipt was
  // returned by the first replica; it is never reconstructed from coordinates.
  const destination = (await first.post('/api/locations/resolve', { placeId: 'provider-destination', sessionToken: randomUUID(), destinationCity: true })).json<SelectedLocation>();
  first.body.destinationId = destination.id; first.body.startId = destination.id;
  const payload = { ...first.body, _evidence: { locations: [destination.receipt!, ...first.candidates.map(c => c.location.receipt!)], guides: first.candidates.map(c => c.receipt!) } };
  const result = await second.inject({ method: 'POST', url: '/api/guide/plan', headers: { authorization: `Bearer ${first.token}`, 'idempotency-key': randomUUID() }, payload });
  expect(result.statusCode).toBe(200); expect(result.json().itinerary.start.id).toBe(destination.id);
  const forged = structuredClone(payload); forged._evidence.guides[0] = 'A'.repeat(60);
  const invalid = await second.inject({ method: 'POST', url: '/api/guide/plan', headers: { authorization: `Bearer ${first.token}`, 'idempotency-key': randomUUID() }, payload: forged });
  expect(invalid.statusCode).toBe(409); expect(invalid.json().error.code).toBe('EVIDENCE_UNAVAILABLE');
  // A different valid local token creates another owner and must be rejected.
  const stranger = await second.inject({ method: 'POST', url: '/api/guide/plan', headers: { authorization: `Bearer ${first.auth.issue!().token}`, 'idempotency-key': randomUUID() }, payload });
  expect(stranger.statusCode).toBe(409); expect(stranger.json().error.code).toBe('EVIDENCE_UNAVAILABLE');
});
function indianProviders(): Partial<Parameters<typeof createServer>[0]> {
  const identity = { placeId: 'canonical-provider-city', name: 'Jaipur', countryCode: 'IN' };
  return { pricingRates: { quote: async () => ({ rate: 0.01, date, sourceUrl: 'https://api.frankfurter.dev/v2/rate/inr/usd' }) },
    locations: { autocomplete: async () => ({ provider: 'google', suggestions: [] }), details: async id => ({ placeId: id, name: 'Jaipur', address: 'Test city address', coordinates: { latitude: 26, longitude: 75 }, types: ['locality'] }), reverse: async coordinates => ({ ...location(), coordinates, city: identity }), timezone: async () => 'UTC' },
    guide: { discover: async () => ['Nahargarh Fort', 'City Palace', 'Amber Palace'].map((name, i) => ({ ...rawPlace(`provider-priced-${i}`), displayName: { text: name }, location: { latitude: 26 + i / 100, longitude: 75 } })), facts: async id => rawPlace(id) } };
}
it('real-provider discovery supplies tariffs before AI and chooses affordable visits without altering the start/return', async () => {
  const a = await api(indianProviders(), guidePreferencesSchema.parse({ ...preferences(), currency: 'INR', travelMode: 'WALK', groupBudget: 250 }));
  expect(a.discovery.statusCode, a.discovery.body).toBe(200); expect(a.candidates.map(c => c.facts.admission?.minimum).sort((a,b) => a!-b!)).toEqual([100,200,400]);
  const r = await a.post('/api/guide/plan', a.body); expect(r.statusCode, r.body).toBe(200); const p = r.json();
  expect(p.itinerary.stops.map((s: { location: SelectedLocation }) => s.location.name)).toEqual(['Nahargarh Fort']);
  expect(p.budget.breakdown.tickets.maximum).toBe(200); expect(p.stops[0].groupCost.maximum).toBe(200); expect(p.itinerary.end.id).toBe(a.body.startId);
  a.body.stops.find(s => a.candidates.find(c => c.location.id === s.locationId)!.location.name === 'City Palace')!.mustVisit = true;
  expect((await a.post('/api/guide/plan', a.body)).statusCode).toBe(422);
});
it('reprices an existing candidate receipt when visitor eligibility or currency changes', async () => {
  const a = await api(indianProviders(), guidePreferencesSchema.parse({ ...preferences(), currency: 'INR', travelMode: 'WALK' }));
  a.body.stops = a.body.stops.filter(s => a.candidates.find(c => c.location.id === s.locationId)!.location.name === 'Nahargarh Fort');
  a.body.preferences.visitorPricing = 'foreign'; let r = await a.post('/api/guide/plan', a.body); expect(r.statusCode, r.body).toBe(200); expect(r.json().stops[0].cost.minimum).toBe(600);
  a.body.preferences.visitorPricing = 'auto'; a.body.preferences.currency = 'USD'; r = await a.post('/api/guide/plan', a.body); expect(r.statusCode, r.body).toBe(200);
  expect(r.json().stops[0].cost).toMatchObject({ minimum: 6, currency: 'USD', original: { minimum: 600, currency: 'INR' } }); expect(r.json().budget.groupKnownMaximum).toBe(12);
});
it('Gemini receives price evidence and bounded ranked alternatives repair an unaffordable first shortlist', async () => {
  const rankGuide = vi.fn(async (context: import('../packages/data-adapters/src/assistant').GuideAIContext) => ({ rankedIds: context.candidates.map(c => c.id), interests: ['history' as const], visits: [{ locationId: context.candidates.find(c => c.name === 'City Palace')!.id, durationMinutes: 60, timeBand: 'morning' as const }] }));
  const a = await api({ ...indianProviders(), interpreter: { mode: 'gemini', rankGuide, interpret: async () => ({ intent: 'summary', minutes: null, pace: null, placeId: null }) } }, guidePreferencesSchema.parse({ ...preferences(), currency: 'INR', travelMode: 'WALK', groupBudget: 250 }));
  const r = await a.post('/api/guide/plan', a.body); expect(r.statusCode, r.body).toBe(200); expect(r.json().itinerary.stops[0].location.name).toBe('Nahargarh Fort');
  expect(r.json().itinerary.warnings.join(' ')).toContain('ranked alternative'); expect((rankGuide.mock.calls[0][0].candidates.find(c => c.name === 'City Palace')!.facts as import('../packages/contracts/src/guide').GuideFacts).admission!.minimum).toBe(400);
});
it('failed FX conversion gives a retryable error before routing, never an unconverted foreign-price plan', async () => {
  const a = await api({ ...indianProviders(), pricingRates: { quote: async () => { throw new Error('unavailable'); } } }, guidePreferencesSchema.parse({ ...preferences(), currency: 'USD' }));
  expect(a.discovery.statusCode).toBe(503); expect(a.discovery.json().error.code).toBe('PRICE_CONVERSION_UNAVAILABLE'); expect(a.matrixCall).not.toHaveBeenCalled(); expect(a.routeCall).not.toHaveBeenCalled();
});
it('automatically priced real restaurant candidates charge one meal per traveler and zero when unchecked', async () => {
  const providers = indianProviders(); const guide = providers.guide!;
  guide.nearbyRestaurants = async () => [{ ...rawPlace('provider-priced-meal'), types: ['restaurant'], displayName: { text: 'Provider priced restaurant' }, location: { latitude: 26, longitude: 75 }, priceLevel: 'PRICE_LEVEL_MODERATE' }];
  const a = await api(providers, guidePreferencesSchema.parse({ ...preferences(), currency: 'INR', travelMode: 'WALK', mealBreak: true, groupBudget: 10000 }));
  a.body.startTime = '12:00'; a.body.orderMode = 'manual'; a.body.stops = a.body.stops.slice(0, 2); a.body.stops.forEach(s => { s.durationMinutes = 60; });
  a.matrixCall.mockImplementation(async points => Array.from({ length: points.length }, () => Array.from({ length: points.length }, () => ({ durationSeconds: 120, distanceMeters: 500 }))));
  const original = a.routeCall.getMockImplementation()!;
  a.routeCall.mockImplementation(async (...args) => { const r = await original(...args); return { ...r, durationSeconds: r.legs.length * 120, distanceMeters: r.legs.length * 500, legs: r.legs.map(() => ({ durationSeconds: 120, distanceMeters: 500 })) }; });
  let r = await a.post('/api/guide/plan', a.body); expect(r.statusCode, r.body).toBe(200); const p = r.json();
  expect(p.stops.filter((s: { mealKind?: string }) => s.mealKind)).toHaveLength(1);
  expect(p.budget.breakdown.food).toEqual({ minimum: 600, maximum: 1200 }); expect(p.stops.find((s: { mealKind?: string }) => s.mealKind).mealCost).toMatchObject({ minimum: 300, maximum: 600, basis: 'person' });
  a.body.preferences.mealBreak = false; r = await a.post('/api/guide/plan', a.body); expect(r.statusCode, r.body).toBe(200); expect(r.json().budget.breakdown.food.maximum).toBe(0); expect(r.json().itinerary.end.id).toBe(a.body.startId);
});
it('authenticated discovery, planning and return use registered real-provider coordinates and never reorder the final schedule in Google', async () => { const a = await api(); expect(a.discovery.statusCode).toBe(200); const response = await a.post('/api/guide/plan', a.body); expect(response.statusCode).toBe(200); expect(response.json().itinerary.end.id).toBe(a.body.startId); expect(a.routeCall.mock.calls[0][4]).toBe(false); expect(response.json().budget.status).toBe('unknown'); });
it('guide planning rejects foreign receipts, duplicate submissions and invalid selections before repeated provider calls', async () => { const a = await api(), key = randomUUID(); expect((await a.post('/api/guide/plan', a.body, key)).statusCode).toBe(200); expect((await a.post('/api/guide/plan', a.body, key)).statusCode).toBe(409); expect(a.matrixCall).toHaveBeenCalledTimes(1); expect((await a.post('/api/guide/plan', a.body, randomUUID(), a.auth.issue!().token)).statusCode).toBe(409); expect((await a.post('/api/guide/plan', { ...a.body, stops: [{ ...a.body.stops[0], locationId: randomUUID() }] })).statusCode).toBe(409); });
it('routing errors leave the guide editable and never fabricate a successful plan', async () => { const a = await api(); a.routeCall.mockImplementation(async () => { throw new Error('Unexpected test failure'); }); const response = await a.post('/api/guide/plan', a.body); expect(response.statusCode).toBe(500); expect(response.json().itinerary).toBeUndefined(); });
it('final-route overruns update matrix edges and reduce optional visits in one bounded repair', async () => {
  const a = await api(), original = a.routeCall.getMockImplementation()!;
  a.routeCall.mockImplementationOnce(async (...args) => { const route = await original(...args); return { ...route, durationSeconds: route.legs.length * 14400, legs: route.legs.map(leg => ({ ...leg, durationSeconds: 14400 })) }; });
  const response = await a.post('/api/guide/plan', a.body); expect(response.statusCode).toBe(200); expect(a.routeCall).toHaveBeenCalledTimes(2); expect(response.json().itinerary.stops).toHaveLength(1); expect(response.json().itinerary.withinTime).toBe(true);
});
it('Gemini priorities use verified hours and the road matrix, and explicit user visit allowances are preserved', async () => {
  const ranking = vi.fn(async (context: import('../packages/data-adapters/src/assistant').GuideAIContext) => ({ rankedIds: context.candidates.map(c => c.id), interests: ['history' as const], visits: context.candidates.map(c => ({ locationId: c.id, durationMinutes: 75, timeBand: 'morning' as const })) }));
  const a = await api({ interpreter: { mode: 'gemini', rankGuide: ranking, interpret: async () => ({ intent: 'summary', minutes: null, pace: null, placeId: null }) } }); a.body.stops[0].durationSource = 'user'; a.body.stops[0].durationMinutes = 40;
  const response = await a.post('/api/guide/plan', a.body); expect(response.statusCode).toBe(200); const plan = response.json(); expect(plan.assistantMode).toBe('gemini'); expect(plan.itinerary.stops.find((s: { location: SelectedLocation }) => s.location.id === a.body.stops[0].locationId).durationMinutes).toBe(40); expect(plan.stops.some((s: { durationSource: string }) => s.durationSource === 'gemini_estimate')).toBe(true); expect(ranking.mock.calls[0][0].travelMatrix).toBeDefined(); expect(JSON.stringify(ranking.mock.calls[0][0])).not.toContain('latitude');
});
it('automatic Gemini planning routes only its recommended verified subset instead of filling the day with arbitrary optional places', async () => {
  const a = await api({ interpreter: { mode: 'gemini', rankGuide: async context => ({ rankedIds: context.candidates.map(c => c.id), interests: ['history'], visits: [{ locationId: context.candidates[0].id, durationMinutes: 75, timeBand: 'morning' }] }), interpret: async () => ({ intent: 'summary', minutes: null, pace: null, placeId: null }) } });
  const response = await a.post('/api/guide/plan', a.body); expect(response.statusCode).toBe(200); expect(response.json().itinerary.stops).toHaveLength(1); expect(response.json().itinerary.stops[0].location.id).toBe(a.candidates[0].location.id); expect(a.routeCall.mock.calls[0][2]).toHaveLength(1);
});

async function mealApi(nearby?: import('../packages/data-adapters/src/google-guide').GuidePlacesProvider['nearbyRestaurants']) {
  const restaurant = (id: string) => {
    const raw = rawPlace(id); raw.types = ['restaurant']; raw.displayName.text = id;
    raw.currentOpeningHours!.periods![0].close!.hour = 22;
    return raw;
  };
  const nearbyRestaurants = vi.fn(nearby ?? (async () => [restaurant('provider-lunch-restaurant')]));
  const a = await api({ guide: { discover: async () => Array.from({ length: 5 }, (_, i) => rawPlace(`provider-attraction-${i}`)), facts: async id => rawPlace(id), nearbyRestaurants } });
  a.matrixCall.mockImplementation(async points => matrix(points.length - 2, 2));
  a.routeCall.mockImplementation(async (_start, _end, stops, departureTime, _optimize, _signal, mode = 'DRIVE') => ({ provider: 'google_routes', mode, durationSeconds: (stops.length + 1) * 120, distanceMeters: (stops.length + 1) * 600, encodedPolyline: 'test-only-route-with-meals', departureTime, fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(), trafficBasis: 'prediction_for_departure', persistence: 'memory_only', legs: Array.from({ length: stops.length + 1 }, () => ({ durationSeconds: 120, distanceMeters: 600 })), optimizedOrder: stops.map((_s, i) => i) }));
  const { defaultMealPreferences } = await import('../packages/contracts/src/guide');
  a.body.preferences.meals = structuredClone(defaultMealPreferences);
  a.body.preferences.meals.lunch.enabled = true;
  a.body.preferences.mealBreak = true; a.body.preferences.mealGroupEstimate = 120;
  a.body.stops.forEach(s => { s.durationMinutes = 75; });
  a.body.endTime = '21:00'; a.body.orderMode = 'manual';
  return { ...a, nearbyRestaurants };
}

it('automatically adds one midday meal to five preserved visits, with six mapped stops and a validated return', async () => {
  const a = await mealApi(), response = await a.post('/api/guide/plan', a.body);
  expect(response.statusCode, response.body).toBe(200);
  const plan = response.json();
  expect(plan.itinerary.stops).toHaveLength(6);
  expect(plan.stops.filter((s: { mealKind?: string }) => s.mealKind).map((s: { mealKind: string }) => s.mealKind)).toEqual(['lunch']);
  expect(plan.stops.filter((s: { mealKind?: string }) => !s.mealKind).map((s: { locationId: string }) => s.locationId)).toEqual(a.body.stops.map(s => s.locationId));
  expect(plan.breaks.filter((b: { kind: string }) => b.kind === 'meal')).toHaveLength(0);
  expect(plan.itinerary.end.id).toBe(a.body.startId);
  expect(plan.budget.groupKnownMaximum).toBe(120); expect(plan.budget.status).toBe('unknown');
  expect(plan.stops.filter((s: { mealKind?: string }) => s.mealKind).every((s: { mealDetour: { extraMinutes: number; fromPreviousMeters: number } }) => s.mealDetour.extraMinutes <= 15 && s.mealDetour.fromPreviousMeters <= 1500)).toBe(true);
  expect(a.routeCall.mock.calls[0][2]).toHaveLength(6); expect(a.routeCall.mock.calls[0][4]).toBe(false);
  expect(Math.max(...a.matrixCall.mock.calls.map(call => call[0].length))).toBeLessThanOrEqual(10);
  const count = a.matrixCall.mock.calls.length, key = randomUUID();
  expect((await a.post('/api/guide/plan', a.body, key)).statusCode).toBe(200);
  const after = a.matrixCall.mock.calls.length; expect(after).toBeGreaterThan(count);
  expect((await a.post('/api/guide/plan', a.body, key)).statusCode).toBe(409); expect(a.matrixCall.mock.calls.length).toBe(after);
});

it('does no restaurant lookup when meals are disabled and keeps the existing route shape', async () => {
  const a = await mealApi(); a.body.preferences.mealBreak = false;
  expect((await a.post('/api/guide/plan', a.body)).statusCode).toBe(200);
  expect(a.nearbyRestaurants).not.toHaveBeenCalled(); expect(a.matrixCall).toHaveBeenCalledTimes(1);
});

it('skips the meal for morning, evening and early-finishing tours without making restaurant requests', async () => {
  for (const [startTime, endTime] of [['09:00', '12:00'], ['16:00', '18:00'], ['09:00', '21:00']]) {
    const a = await mealApi(); a.body.startTime = startTime; a.body.endTime = endTime;
    a.body.stops = a.body.stops.slice(0, 1); a.body.stops[0].durationMinutes = 30;
    const response = await a.post('/api/guide/plan', a.body);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().stops.every((s: { mealKind?: string }) => !s.mealKind)).toBe(true);
    expect(response.json().breaks.some((b: { kind: string }) => b.kind === 'meal')).toBe(false);
    expect(a.nearbyRestaurants).not.toHaveBeenCalled(); expect(a.matrixCall).toHaveBeenCalledTimes(1);
  }
});

it('uses the actual starting point for a midday meal when the first visit would finish after the meal window', async () => {
  const a = await mealApi(); a.body.startTime = '13:30'; a.body.endTime = '17:00';
  const source = await a.post('/api/locations/reverse', { coordinates: { latitude: 51.012, longitude: 0.001 }, source: 'pin' });
  expect(source.statusCode).toBe(200); a.body.startId = source.json<SelectedLocation>().id;
  a.body.stops = a.body.stops.slice(0, 1); a.body.stops[0].durationMinutes = 75;
  const response = await a.post('/api/guide/plan', a.body);
  expect(response.statusCode, response.body).toBe(200);
  const plan = response.json(); expect(plan.stops[0].mealKind).toBe('lunch');
  expect(plan.itinerary.stops[0].arrivalAt).toBe(`${date}T13:32:00.000Z`);
  expect(plan.stops[0].mealDetour.fromPreviousMeters).toBe(600);
  expect(a.nearbyRestaurants.mock.calls[0][0]).toEqual(a.routeCall.mock.calls[0][0]);
});

it('restaurant provider failures and missing hours are actionable and never become invented meals', async () => {
  const a = await mealApi(async () => { throw new Error('Test provider unavailable'); });
  const response = await a.post('/api/guide/plan', a.body);
  expect(response.statusCode).toBe(500); expect(response.json().itinerary).toBeUndefined(); expect(a.routeCall).not.toHaveBeenCalled();
  const b = await mealApi(async () => [{ ...rawPlace('provider-unverified-restaurant'), types: ['restaurant'], currentOpeningHours: undefined }]);
  const unavailable = await b.post('/api/guide/plan', b.body);
  expect(unavailable.statusCode).toBe(422); expect(unavailable.json().error.code).toBe('MEAL_NOT_FOUND'); expect(unavailable.json().itinerary).toBeUndefined();
});

it('rejects meal labels supplied by clients and refuses a final restaurant route exceeding detour limits', async () => {
  const a = await mealApi();
  expect((await a.post('/api/guide/plan', { ...a.body, stops: [{ ...a.body.stops[0], mealKind: 'lunch' }] })).statusCode).toBe(422);
  const original = a.routeCall.getMockImplementation()!;
  a.routeCall.mockImplementation(async (...args) => { const route = await original(...args); return { ...route, legs: route.legs.map(leg => ({ ...leg, distanceMeters: 5000 })) }; });
  const response = await a.post('/api/guide/plan', a.body);
  expect(response.statusCode).toBe(422); expect(response.json().error.code).toBe('MEAL_FINAL_ROUTE_INFEASIBLE'); expect(response.json().itinerary).toBeUndefined();
});
