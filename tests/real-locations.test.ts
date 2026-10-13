import { afterEach, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { GoogleLocations, type LocationProvider } from '../packages/data-adapters/src/google-locations';
import { GooglePlaces, GoogleRoutes, type LiveRouteProvider } from '../packages/data-adapters/src/google';
import { coordinateLocation, liveRouteInputSchema, locationSchema, type LocationData, type SelectedLocation, type LiveRouteInput } from '../packages/contracts/src/locations';
import { ProviderError } from '../packages/data-adapters/src/google';
import { buildLiveItinerary } from '../packages/domain/src/live-itinerary';
import { LocationRegistry } from '../apps/api/src/locations';
import { createServer } from '../apps/api/src/server';
import { localAuthenticator } from '../apps/api/src/auth';
import { LocalTripStore } from '../apps/api/src/store';
import { savedLiveDaySchema, locationReference } from '../apps/web/src/live-storage';

// Provider responses are mocked only in tests. No coordinates or suggestions here
// are imported by app/runtime provider paths.
const cityId = 'city-provider-id', point = { latitude: 51.5, longitude: -0.12 }, other = { latitude: 48.85, longitude: 2.35 };
const city = { placeId: cityId, name: 'Provider city', countryCode: 'GB' };
const data = (patch: Partial<LocationData> = {}): LocationData => ({ provider: 'google', source: 'search', placeId: 'place-provider-id', name: 'Provider result', address: 'Provider supplied address', coordinates: point, types: ['street_address'], city, fetchedAt: new Date().toISOString(), ...patch });
const selected = (patch: Partial<LocationData> = {}) => locationSchema.parse({ ...data(patch), id: randomUUID(), expiresAt: new Date(Date.now() + 1800000).toISOString(), persistence: 'memory_only' });
const geocode = { status: 'OK', results: [{ place_id: 'address-provider-id', formatted_address: 'Provider street address', types: ['street_address'], address_components: [] }, { place_id: cityId, formatted_address: 'Provider city address', types: ['locality', 'political'], address_components: [{ long_name: city.name, short_name: city.name, types: ['locality'] }, { long_name: 'United Kingdom', short_name: 'GB', types: ['country'] }] }] };
const routeResponse = (order = [0]) => ({ routes: [{ duration: '1200s', distanceMeters: 5000, polyline: { encodedPolyline: 'provider-polyline' }, legs: Array.from({ length: order.length + 1 }, () => ({ duration: '600s', distanceMeters: 2500 })), optimizedIntermediateWaypointIndex: order }] });

it('uses Google autocomplete with session token, city filter and real coordinate bias', async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json({ suggestions: [{ placePrediction: { placeId: 'place-provider-id', text: { text: 'Provider prediction' } } }] }));
  const provider = new GoogleLocations('server-place-key', '', '', request), token = randomUUID();
  expect((await provider.autocomplete('city', token, true, point)).suggestions[0].text).toBe('Provider prediction');
  const body = JSON.parse(request.mock.calls[0][1]!.body as string); expect(body.sessionToken).toBe(token); expect(body.includedPrimaryTypes).toEqual(['(cities)']); expect(body.locationBias.circle.center).toEqual(point);
  expect(request.mock.calls[0][0]).toBe('https://places.googleapis.com/v1/places:autocomplete');
});
it('returns provider-empty autocomplete and refuses missing configuration, invalid response and upstream errors', async () => {
  expect((await new GoogleLocations('key', '', '', async () => Response.json({})).autocomplete('query', randomUUID(), false)).suggestions).toEqual([]);
  await expect(new GoogleLocations('', '', '').autocomplete('query', randomUUID(), false)).rejects.toThrow('Configure');
  for (const response of [Response.json({ suggestions: [{ placePrediction: { placeId: 'invalid!', text: { text: 'x' } } }] }), new Response('', { status: 429 }), new Response('', { status: 403 })]) await expect(new GoogleLocations('key', '', '', async () => response).autocomplete('query', randomUUID(), false)).rejects.toThrow();
});
it('requires selected place coordinates and address, rejects mismatched IDs and never supplies defaults', async () => {
  const result = { id: 'place-provider-id', displayName: { text: 'Provider place' }, formattedAddress: 'Provider address', location: point, types: ['lodging'] };
  const request = vi.fn<typeof fetch>(async () => Response.json(result));
  expect((await new GoogleLocations('key', '', '', request).details(result.id, randomUUID())).coordinates).toEqual(point);
  expect((request.mock.calls[0][1]!.headers as Record<string, string>)['X-Goog-FieldMask']).toContain('location');
  for (const bad of [{ ...result, location: undefined }, { ...result, location: { latitude: 91, longitude: 2 } }, { ...result, formattedAddress: '' }, { ...result, id: 'other-provider-id' }]) await expect(new GoogleLocations('key', '', '', async () => Response.json(bad)).details(result.id, randomUUID())).rejects.toThrow('no valid');
});
it('reverse geocodes exact input coordinates and extracts a provider city identity without substituting rooftop coordinates', async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json(geocode)), result = await new GoogleLocations('', 'server-geocode-key', '', request).reverse(point);
  expect(result.coordinates).toEqual(point); expect(result.city).toEqual(city); expect(result.address).toBe('Provider street address');
  const url = new URL(request.mock.calls[0][0] as string); expect(url.searchParams.get('latlng')).toBe('51.5,-0.12');
});
it('accepts long Google place IDs in primary and secondary geocoding results without losing city identity', async () => {
  const longId = 'A'.repeat(204), secondaryId = 'B'.repeat(4096);
  const response = { ...geocode, results: [{ ...geocode.results[0], place_id: longId }, geocode.results[1], { ...geocode.results[0], place_id: secondaryId }] };
  const result = await new GoogleLocations('', 'key', '', async () => Response.json(response)).reverse(point);
  expect(result.placeId).toBe(longId); expect(result.city).toEqual(city); expect(result.coordinates).toEqual(point);
  expect(locationReference(selected({ placeId: longId }))).toEqual({ kind: 'place', placeId: longId });
});
it('resolves long provider IDs through both place adapters and rejects unsafe IDs before requesting Google', async () => {
  const longId = 'A'.repeat(204), details = { id: longId, displayName: { text: 'Provider place' }, formattedAddress: 'Provider address', location: point, types: ['lodging'] };
  const request = vi.fn<typeof fetch>(async () => Response.json(details));
  expect((await new GoogleLocations('key', '', '', request).details(longId, randomUUID())).placeId).toBe(longId);
  expect((await new GooglePlaces('key', request).details(longId)).id).toBe(longId);
  expect(request).toHaveBeenCalledTimes(2);
  await expect(new GooglePlaces('key', request).details('../unsafe')).rejects.toThrow('place ID is invalid');
  await expect(new GoogleLocations('key', '', '', request).details('../unsafe', randomUUID())).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(2);
});
it('keeps city unknown when evidence is absent and exposes actionable reverse-geocoding failure without an address fallback', async () => {
  expect((await new GoogleLocations('', 'key', '', async () => Response.json({ status: 'OK', results: [geocode.results[0]] })).reverse(point)).city).toBeNull();
  for (const status of ['ZERO_RESULTS', 'REQUEST_DENIED', 'OVER_QUERY_LIMIT']) await expect(new GoogleLocations('', 'key', '', async () => Response.json({ status, results: [] })).reverse(point)).rejects.toThrow();
  await expect(new GoogleLocations('', '', '').reverse(point)).rejects.toThrow('GOOGLE_GEOCODING');
});
it('requires a valid provider timezone rather than guessing a destination timezone', async () => {
  expect(await new GoogleLocations('', '', 'key', async () => Response.json({ status: 'OK', timeZoneId: 'Europe/London' })).timezone(point)).toBe('Europe/London');
  await expect(new GoogleLocations('', '', '').timezone(point)).rejects.toThrow('GOOGLE_TIME_ZONE');
  await expect(new GoogleLocations('', '', 'key', async () => Response.json({ status: 'OK', timeZoneId: 'Fake/Zone' })).timezone(point)).rejects.toThrow('unsupported');
});
it('sends selected start, return and intermediate coordinates to Google with validated optimization ordering', async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json(routeResponse([1, 0]))), provider = new GoogleRoutes('server-route-key', request);
  const result = await provider.itinerary(point, point, [point, other], new Date(Date.now() + 86400000).toISOString(), true);
  expect(result.optimizedOrder).toEqual([1, 0]); const body = JSON.parse(request.mock.calls[0][1]!.body as string);
  expect(body.origin.location.latLng).toEqual(point); expect(body.destination.location.latLng).toEqual(point); expect(body.intermediates[1].location.latLng).toEqual(other); expect(body.optimizeWaypointOrder).toBe(true); expect(body.routingPreference).toBe('TRAFFIC_AWARE');
});
it('refuses no route, missing legs, duplicate/out-of-range ordering and failed Google routing', async () => {
  for (const raw of [{ routes: [] }, { routes: [{ ...routeResponse([0, 1]).routes[0], legs: [] }] }, routeResponse([1, 1]), routeResponse([0, 4]), routeResponse([-1, 0])]) await expect(new GoogleRoutes('key', async () => Response.json(raw)).itinerary(point, point, [point, other], new Date().toISOString(), true)).rejects.toThrow();
  await expect(new GoogleRoutes('key', async () => new Response('', { status: 403 })).itinerary(point, other, [other], new Date().toISOString(), false)).rejects.toThrow('Google rejected');
});
it('uses the unique single-visit order without requesting Google optimization or altering route measurements', async () => {
  for (const metadata of [undefined, [], [-1], [0]]) {
    const raw = routeResponse(); raw.routes[0].optimizedIntermediateWaypointIndex = metadata as number[];
    const request = vi.fn<typeof fetch>(async () => Response.json(raw));
    const result = await new GoogleRoutes('key', request).itinerary(point, point, [other], new Date(Date.now() + 3600000).toISOString(), true);
    expect(JSON.parse(request.mock.calls[0][1]!.body as string).optimizeWaypointOrder).toBe(false);
    expect(result.optimizedOrder).toEqual([0]); expect(result.legs).toHaveLength(2);
    expect(result.durationSeconds).toBe(1200); expect(result.distanceMeters).toBe(5000);
    expect(result.encodedPolyline).toBe('provider-polyline');
  }
});
it('keeps ordinary visit order when optimization is disabled but still rejects missing measurements', async () => {
  const raw = routeResponse([-1, -1]);
  const result = await new GoogleRoutes('key', async () => Response.json(raw)).itinerary(point, point, [point, other], new Date().toISOString(), false);
  expect(result.optimizedOrder).toEqual([0, 1]);
  const incomplete = { routes: [{ ...raw.routes[0], legs: [{ duration: '600s' }, raw.routes[0].legs[1], raw.routes[0].legs[2]] }] };
  await expect(new GoogleRoutes('key', async () => Response.json(incomplete)).itinerary(point, point, [point, other], new Date().toISOString(), false)).rejects.toThrow('incomplete');
});
it('binds registered coordinates to owner and expires selections instead of accepting caller-fabricated locations', () => {
  let now = Date.now(); const registry = new LocationRegistry(() => now), value = registry.add('owner-a', data());
  expect(registry.get('owner-a', value.id).coordinates).toEqual(point); expect(() => registry.get('owner-b', value.id)).toThrow('expired');
  now += 1800001; expect(() => registry.get('owner-a', value.id)).toThrow('expired');
});

const servers: FastifyInstance[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(servers.splice(0).map(server => server.close())); });
async function server(extra: Partial<Parameters<typeof createServer>[0]> = {}) {
  const auth = localAuthenticator(randomBytes(32)), app = await createServer({ auth, store: new LocalTripStore(), fixtures: false, webOrigin: 'http://127.0.0.1:5174', ...extra }); servers.push(app);
  const headers = { authorization: `Bearer ${auth.issue!().token}`, 'idempotency-key': randomUUID(), 'content-type': 'application/json' };
  return { app, auth, headers, post: (url: string, payload: unknown) => app.inject({ method: 'POST', url, headers, payload: JSON.stringify(payload) }) };
}
function provider(): LocationProvider { return { autocomplete: async () => ({ provider: 'google', suggestions: [] }), details: async placeId => ({ placeId, name: 'Provider city', address: 'Provider city address', coordinates: point, types: placeId === cityId ? ['locality'] : ['lodging'] }), reverse: async coordinates => ({ ...data(), coordinates, source: undefined } as unknown as Omit<LocationData, 'source'>), timezone: async () => 'Europe/London' }; }
it('uses one geocoded locality identity when Places search gives the same destination city a different ID', async () => {
  const locations = provider(), originalDetails = locations.details, searchId = 'city-search-provider-id';
  locations.details = async (placeId, token, signal) => placeId === searchId ? { ...await originalDetails(cityId, token, signal), placeId } : originalDetails(placeId, token, signal);
  const routes = new GoogleRoutes('mock-route-key', async () => Response.json(routeResponse()));
  const { post } = await server({ locations, liveRoutes: routes });
  const destinationResponse = await post('/api/locations/resolve', { placeId: searchId, sessionToken: randomUUID(), destinationCity: true });
  expect(destinationResponse.statusCode).toBe(200);
  const destination = destinationResponse.json<SelectedLocation>();
  expect(destination.placeId).toBe(searchId); expect(destination.city?.placeId).toBe(cityId);
  const start = (await post('/api/locations/resolve', { placeId: 'hotel-provider-id', sessionToken: randomUUID(), destinationCity: false })).json<SelectedLocation>();
  const stop = (await post('/api/locations/resolve', { placeId: 'visit-provider-id', sessionToken: randomUUID(), destinationCity: false })).json<SelectedLocation>();
  const response = await post('/api/plans/live', { destinationId: destination.id, startId: start.id, returnToStart: true, endId: null, stops: [{ locationId: stop.id, durationMinutes: 30 }], date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), startTime: '09:00', endTime: '18:00', allowOutsideStart: false, optimize: false });
  expect(response.statusCode).toBe(200); expect(response.json().start.id).toBe(start.id); expect(response.json().end.id).toBe(start.id);
});
it('retains exact GPS and pin coordinates when geocoding is unconfigured, unavailable or over allowance', async () => {
  const failing = provider(); failing.reverse = async () => { throw new ProviderError('UNAVAILABLE', 'Address lookup unavailable.'); };
  for (const extra of [{}, { locations: failing }, { locations: provider(), providerDailyLimit: 0 }]) {
    const { post } = await server(extra);
    for (const source of ['gps', 'pin', 'saved'] as const) {
      const response = await post('/api/locations/reverse', { coordinates: other, source, ...(source === 'gps' ? { accuracyMeters: 20, observedAt: new Date().toISOString() } : {}) });
      expect(response.statusCode).toBe(200); const result = locationSchema.parse(response.json()); expect(result.coordinates).toEqual(other); expect(result.address).toBeNull(); expect(result.city).toBeNull(); expect(result.placeId).toBeNull(); expect(result.addressStatus).toBe('unresolved'); expect(result.receiptStatus).toBe('registered'); expect(result.provider).toBe('device');
    }
  }
});
it('never accepts an unresolved point as a searched place or a claimed Google address', () => {
  const unresolved = { ...coordinateLocation(other, 'pin'), id: randomUUID(), expiresAt: new Date(Date.now() + 1800000).toISOString(), persistence: 'memory_only' };
  expect(locationSchema.safeParse(unresolved).success).toBe(true);
  for (const patch of [{ source: 'search' }, { city }, { placeId: cityId }, { provider: 'google' }, { address: 'Invented address' }]) expect(locationSchema.safeParse({ ...unresolved, ...patch }).success).toBe(false);
});
it('can route a coordinate-only start back to its exact point with explicit unverified-city consent', async () => {
  const locations = provider(), originalReverse = locations.reverse; locations.reverse = async coordinates => { if (coordinates.latitude === other.latitude) throw new ProviderError('UNAVAILABLE', 'Address unavailable.'); return originalReverse(coordinates); };
  const itinerary = vi.fn<LiveRouteProvider['itinerary']>(async (origin, end, stops, departureTime) => ({ provider: 'google_routes', mode: 'DRIVE', durationSeconds: 1200, distanceMeters: 5000, encodedPolyline: 'provider-polyline', departureTime, fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(), trafficBasis: 'prediction_for_departure', persistence: 'memory_only', legs: [{ durationSeconds: 600, distanceMeters: 2500 }, { durationSeconds: 600, distanceMeters: 2500 }], optimizedOrder: [0] }));
  const { post } = await server({ locations, liveRoutes: { itinerary } });
  const destination = (await post('/api/locations/resolve', { placeId: cityId, sessionToken: randomUUID(), destinationCity: true })).json<SelectedLocation>();
  const start = (await post('/api/locations/reverse', { coordinates: other, source: 'gps', accuracyMeters: 20, observedAt: new Date().toISOString() })).json<SelectedLocation>();
  const visit = (await post('/api/locations/resolve', { placeId: 'visit-provider-id', sessionToken: randomUUID(), destinationCity: false })).json<SelectedLocation>();
  const input = { destinationId: destination.id, startId: start.id, returnToStart: true, endId: null, stops: [{ locationId: visit.id, durationMinutes: 30 }], date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), startTime: '09:00', endTime: '18:00', allowOutsideStart: false, optimize: false };
  expect((await post('/api/plans/live', input)).statusCode).toBe(422); expect(itinerary).not.toHaveBeenCalled();
  const response = await post('/api/plans/live', { ...input, allowOutsideStart: true }); expect(response.statusCode).toBe(200); expect(response.json().start.address).toBeNull(); expect(response.json().end.coordinates).toEqual(other); expect(itinerary.mock.calls[0].slice(0, 2)).toEqual([other, other]);
});
it('uses the selected device point even if an adapter returns a different reverse-geocoded coordinate', async () => {
  const locations = provider(); locations.reverse = async () => ({ ...data(), coordinates: point }); const { post } = await server({ locations });
  const response = await post('/api/locations/reverse', { source: 'pin', coordinates: other }); expect(response.statusCode).toBe(200); expect(response.json().coordinates).toEqual(other);
});
it('normal API lists no fixture cities and rejects unauthenticated or unconfigured location services', async () => {
  const { app, headers, post } = await server(); expect((await app.inject({ url: '/api/cities', headers })).json().fixtures).toEqual([]);
  expect((await app.inject({ method: 'POST', url: '/api/locations/autocomplete', payload: { input: 'city', sessionToken: randomUUID(), citiesOnly: false } })).statusCode).toBe(401);
  const result = await post('/api/locations/autocomplete', { input: 'city', sessionToken: randomUUID(), citiesOnly: false }); expect(result.statusCode).toBe(503); expect(result.json().error.code).toBe('LOCATION_PROVIDER_NOT_CONFIGURED');
});
it('refuses invalid GPS, old observations, typed text as route input, and hotels as destination cities', async () => {
  const locationProvider = provider(), reverse = vi.spyOn(locationProvider, 'reverse'), { post } = await server({ locations: locationProvider });
  expect((await post('/api/locations/reverse', { coordinates: point, source: 'gps' })).statusCode).toBe(400);
  expect((await post('/api/locations/reverse', { coordinates: { latitude: 91, longitude: 1 }, source: 'pin' })).statusCode).toBe(400);
  expect((await post('/api/locations/reverse', { coordinates: point, source: 'gps', accuracyMeters: 10, observedAt: new Date(Date.now() - 120001).toISOString() })).statusCode).toBe(422); expect(reverse).not.toHaveBeenCalled();
  expect((await post('/api/plans/live', { start: 'typed address' })).statusCode).toBe(400);
  expect((await post('/api/locations/resolve', { placeId: 'hotel-provider-id', sessionToken: randomUUID(), destinationCity: true })).statusCode).toBe(422);
});
it('enforces starting-city consent on the server and uses exact source for same-place returns', async () => {
  const locationProvider = provider(); locationProvider.reverse = async coordinates => ({ ...data({ coordinates, city: coordinates.latitude === other.latitude ? { ...city, placeId: 'other-city-id' } : city }), source: undefined } as unknown as Omit<LocationData, 'source'>);
  const routing = { itinerary: vi.fn<LiveRouteProvider['itinerary']>(async (origin, destination, stops, departureTime) => ({ provider: 'google_routes', mode: 'DRIVE', durationSeconds: 1200, distanceMeters: 5000, encodedPolyline: 'provider-polyline', departureTime, fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(), trafficBasis: 'prediction_for_departure', persistence: 'memory_only', legs: [{ durationSeconds: 600, distanceMeters: 2500 }, { durationSeconds: 600, distanceMeters: 2500 }], optimizedOrder: [0] })) };
  const { post } = await server({ locations: locationProvider, liveRoutes: routing });
  const destination = (await post('/api/locations/resolve', { placeId: cityId, sessionToken: randomUUID(), destinationCity: true })).json<SelectedLocation>();
  const start = (await post('/api/locations/reverse', { coordinates: other, source: 'gps', accuracyMeters: 15, observedAt: new Date().toISOString() })).json<SelectedLocation>();
  const stop = (await post('/api/locations/resolve', { placeId: 'hotel-provider-id', sessionToken: randomUUID(), destinationCity: false })).json<SelectedLocation>();
  const input = { destinationId: destination.id, startId: start.id, returnToStart: true, endId: null, stops: [{ locationId: stop.id, durationMinutes: 30 }], date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), startTime: '09:00', endTime: '18:00', allowOutsideStart: false, optimize: false };
  expect((await post('/api/plans/live', input)).statusCode).toBe(422); expect(routing.itinerary).not.toHaveBeenCalled();
  const response = await post('/api/plans/live', { ...input, allowOutsideStart: true }); expect(response.statusCode).toBe(200); expect(response.json().end.coordinates).toEqual(other); expect(routing.itinerary.mock.calls[0][0]).toEqual(other); expect(routing.itinerary.mock.calls[0][1]).toEqual(other);
});
it('keeps provider attempts bounded and rejects foreign location receipts before any route request', async () => {
  const providerInstance = provider(), { app, auth, headers, post } = await server({ locations: providerInstance, providerDailyLimit: 1 });
  expect((await post('/api/locations/autocomplete', { input: 'city', sessionToken: randomUUID(), citiesOnly: false })).statusCode).toBe(200);
  expect((await post('/api/locations/autocomplete', { input: 'another', sessionToken: randomUUID(), citiesOnly: false })).statusCode).toBe(429);
  const input = { destinationId: randomUUID(), startId: randomUUID(), returnToStart: true, endId: null, stops: [{ locationId: randomUUID(), durationMinutes: 30 }], date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), startTime: '09:00', endTime: '18:00', allowOutsideStart: true, optimize: false };
  expect((await app.inject({ method: 'POST', url: '/api/plans/live', headers: { ...headers, authorization: `Bearer ${auth.issue!().token}` }, payload: input })).statusCode).toBe(409);
});
it('does not permit fixture data in production', async () => {
  vi.stubEnv('NODE_ENV', 'production'); await expect(createServer({ auth: localAuthenticator(randomBytes(32)), store: new LocalTripStore(), fixtures: true, webOrigin: 'http://127.0.0.1:5174' })).rejects.toThrow('cannot be enabled');
});
it('applies optimized stop durations to their original selected places, preserves return and marks deadline failures', () => {
  const destination = selected({ placeId: cityId, city, timezone: 'Europe/London' }), start = selected(), end = selected({ coordinates: other }), stops = [selected({ name: 'First stop' }), selected({ name: 'Second stop' })];
  const input: LiveRouteInput = liveRouteInputSchema.parse({ destinationId: destination.id, startId: start.id, returnToStart: false, endId: end.id, stops: stops.map((location, index) => ({ locationId: location.id, durationMinutes: index ? 90 : 30 })), date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), startTime: '09:00', endTime: '10:00', allowOutsideStart: false, optimize: true });
  const route = { provider: 'google_routes' as const, mode: 'DRIVE' as const, durationSeconds: 1800, distanceMeters: 6000, encodedPolyline: 'provider-polyline', departureTime: new Date().toISOString(), fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(), trafficBasis: 'prediction_for_departure' as const, persistence: 'memory_only' as const, legs: [0, 1, 2].map(() => ({ durationSeconds: 600, distanceMeters: 2000 })), optimizedOrder: [1, 0] };
  const result = buildLiveItinerary(input, destination, start, end, stops, route); expect(result.stops[0].location.name).toBe('Second stop'); expect(result.stops[0].durationMinutes).toBe(90); expect(result.end.coordinates).toEqual(other); expect(result.withinTime).toBe(false); expect(result.warnings.join(' ')).toContain('Budget feasibility is unknown');
});
it('saved preferences retain allowed provider IDs or explicit user points and reject stored provider addresses or geometry', () => {
  expect(locationReference(selected())).toEqual({ kind: 'place', placeId: 'place-provider-id' }); expect(locationReference(selected({ source: 'gps', coordinates: other, accuracyMeters: 20, observedAt: new Date().toISOString() }))).toEqual({ kind: 'coordinate', coordinates: other });
  const day = { version: 1, id: randomUUID(), title: 'Private name', updatedAt: new Date().toISOString(), destination: cityId, start: { kind: 'place', placeId: 'place-provider-id' }, end: null, returnToStart: true, stops: [{ location: { kind: 'place', placeId: 'visit-provider-id' }, durationMinutes: 30 }], date: '2026-10-15', startTime: '09:00', endTime: '18:00', optimize: false, adults: 2, childAges: [], budget: '', currency: '', dietaryRules: [] };
  expect(savedLiveDaySchema.safeParse(day).success).toBe(true); expect(savedLiveDaySchema.safeParse({ ...day, address: 'Provider address' }).success).toBe(false); expect(savedLiveDaySchema.safeParse({ ...day, encodedPolyline: 'provider-polyline' }).success).toBe(false);
});
