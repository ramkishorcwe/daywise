import Fastify, { type FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { cities, getCity } from '../../../fixtures/cities';
import { generatePlan, scheduleOrder, validateInput } from '../../../packages/domain/src/planner';
import { confirmPlan } from '../../../packages/domain/src/versioning';
import { createTripSchema, editTripSchema, previewSchema, generateSchema, confirmRequestSchema, idSchema, routeRequestSchema, type RemoteTrip } from '../../../packages/contracts/src/api';
import type { Plan, TripInput } from '../../../packages/contracts/src';
import { CheckedCatalog } from '../../../packages/data-adapters/src/catalog';
import { ProviderError, type RouteProvider, type LiveRouteProvider, type GooglePlaces } from '../../../packages/data-adapters/src/google';
import type { LocationProvider } from '../../../packages/data-adapters/src/google-locations';
import { LocationRegistry } from './locations';
import { autocompleteSchema, resolveLocationSchema, reverseLocationSchema, liveRouteInputSchema, startMatchesDestination, coordinateLocation } from '../../../packages/contracts/src/locations';
import { liveDeparture, buildLiveItinerary } from '../../../packages/domain/src/live-itinerary';
import type { Authenticator } from './auth';
import type { TripStore } from './store';
import { ApiError, missing, stale } from './errors';
import { IdempotencyGuard } from './idempotency';
import { ProviderGuard } from './provider-guard';
import { AssistantService } from './assistant';
import { LocalInterpreter, type IntentInterpreter } from '../../../packages/data-adapters/src/assistant';
import { assistantTurnSchema, progressRequestSchema, proposalDecisionSchema } from '../../../packages/contracts/src/assistant';
import { pendingReleaseGates } from '../../../packages/contracts/src/readiness';
import { Telemetry } from './telemetry';
import { requireOperator } from './operations';
import { webOriginPolicy } from './web-origin';
import { registerGuideRoutes } from './guide';
import type { GuidePlacesProvider } from '../../../packages/data-adapters/src/google-guide';

export interface ServerOptions {
  auth: Authenticator; store: TripStore; fixtures: boolean; catalog?: CheckedCatalog;
  routes?: RouteProvider; places?: GooglePlaces; webOrigin: string; logger?: boolean; rateMax?: number; providerDailyLimit?: number;
  interpreter?: IntentInterpreter; aiDailyLimit?: number; operatorToken?: string; fixtureSessionRateMax?: number;
  locations?: LocationProvider; liveRoutes?: LiveRouteProvider;
  guide?: GuidePlacesProvider;
  locationCapabilities?: { autocomplete: boolean; reverseGeocode: boolean; timezone: boolean; routing: boolean };
  locationConfigurationIssues?: string[];
}
export async function createServer(options: ServerOptions) {
  const localDevelopment = options.auth.mode === 'local' && process.env.NODE_ENV !== 'production';
  const originPolicy = webOriginPolicy(options.webOrigin, localDevelopment);
  if (process.env.NODE_ENV === 'production' && options.fixtures) throw new Error('Fixture locations cannot be enabled in production.');
  if (options.fixtureSessionRateMax !== undefined && (
    process.env.CI !== 'true' || process.env.NODE_ENV !== 'development' || !options.fixtures || options.auth.mode !== 'local' ||
    options.routes || options.places || options.locations || options.liveRoutes || (options.interpreter && options.interpreter.mode !== 'local') ||
    options.providerDailyLimit !== 0 || options.aiDailyLimit !== 0 ||
    !Number.isInteger(options.fixtureSessionRateMax) || options.fixtureSessionRateMax < 1 || options.fixtureSessionRateMax > 30
  )) throw new Error('Session limit overrides require development CI with local fixture-only adapters and zero paid-call allowances.');
  if (options.operatorToken && options.operatorToken.length < 32) throw new Error('Operator credentials must be at least 32 characters.');
  const app = Fastify({ logger: options.logger ? { redact: ['req.headers.authorization', 'req.headers.cookie'] } : false, logController: new Fastify.LogController({ disableRequestLogging: true }), bodyLimit: 32768, requestTimeout: 15000, trustProxy: false });
  const catalog = options.catalog ?? new CheckedCatalog([]), guard = new IdempotencyGuard();
  const providerGuard = new ProviderGuard(options.providerDailyLimit ?? 100);
  const locations = new LocationRegistry();
  const interpreter = options.interpreter ?? new LocalInterpreter();
  const telemetry = new Telemetry();
  const assistant = new AssistantService(options.store, interpreter, options.fixtures, () => Date.now(), options.aiDailyLimit);
  const candidates = new Map<string, { owner: string; tripId: string; revision: number; input: TripInput; plan: Plan; expires: number }>();
  const now = () => new Date().toISOString();
  const owners = new WeakMap<FastifyRequest, string>();
  const sweep = () => { guard.cleanup(); providerGuard.cleanup(); locations.cleanup(); assistant.cleanup(); for (const [id, candidate] of candidates) if (candidate.expires <= Date.now()) candidates.delete(id); };
  const retentionTimer = setInterval(sweep, 60000); retentionTimer.unref();
  app.addHook('onClose', async () => clearInterval(retentionTimer));
  await app.register(helmet);
  await app.register(rateLimit, { max: options.rateMax ?? 90, timeWindow: '1 minute' });
  app.addHook('onResponse', async (request, reply) => {
    if (request.routeOptions.url !== '/api/ops/status') telemetry.record(request.method, request.routeOptions.url, reply.statusCode, reply.elapsedTime);
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    // Same-origin Vite proxy, or configured local aliases. No wildcard CORS.
    const origin = request.headers.origin;
    if (origin !== undefined && !originPolicy.accepts(origin)) {
      if (process.env.NODE_ENV !== 'production') {
        let receivedOrigin = 'opaque or malformed';
        try { const parsed = new URL(origin).origin; if (parsed.length <= 256) receivedOrigin = parsed; } catch { /* Do not log arbitrary header content. */ }
        request.log.warn({ receivedOrigin, expectedOrigin: originPolicy.configured }, 'Browser origin rejected');
      }
      throw new ApiError(403, 'ORIGIN_REJECTED', localDevelopment
        ? `This browser origin is not allowed. Open the app at ${originPolicy.configured}, or set WEB_ORIGIN to match the browser address and restart the API.`
        : 'This browser origin is not allowed.');
    }
    if (origin) { reply.header('Access-Control-Allow-Origin', origin); reply.header('Vary', 'Origin'); }
    if (request.method === 'OPTIONS') return reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key').header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS').code(204).send();
    const path = request.url.split('?')[0];
    if (path === '/api/ops/status') { requireOperator(options.operatorToken, request.headers.authorization, request.ip, origin); return; }
    if (path === '/api/health' || path === '/api/dev/session' || path === '/api/readiness' || path === '/api/locations/config') return;
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new ApiError(401, 'UNAUTHENTICATED', 'Connect to the backend first.');
    owners.set(request, await options.auth.verify(authorization.slice(7)));
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) return reply.code(error.status).send({ error: { code: error.code, message: error.message }, requestId: request.id });
    if (error instanceof z.ZodError) return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'The request contains invalid fields.', fields: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) }, requestId: request.id });
    if (error instanceof ProviderError) return reply.code(error.code === 'NOT_CONFIGURED' ? 503 : error.code === 'QUOTA' ? 429 : 502).send({ error: { code: `PROVIDER_${error.code}`, message: error.message }, requestId: request.id });
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429 || status === 413 || status === 400) return reply.code(status).send({ error: { code: status === 429 ? 'RATE_LIMITED' : status === 413 ? 'BODY_TOO_LARGE' : 'INVALID_JSON', message: status === 429 ? 'Too many requests. Wait before retrying.' : 'The request could not be accepted.' }, requestId: request.id });
    request.log.error({ err: { name: error instanceof Error ? error.name : 'UnknownError' }, requestId: request.id }, 'Request failed');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'The server could not complete this request.' }, requestId: request.id });
  });
  const owner = (request: FastifyRequest) => owners.get(request)!;
  const tripId = (request: FastifyRequest) => idSchema.parse((request.params as { id: string }).id);
  function validateFixture(input: TripInput) {
    if (!options.fixtures) throw new ApiError(422, 'CITY_NOT_READY', 'Live itinerary planning is not enabled. Configure and verify a complete catalog before enabling it.');
    const city = getCity(input.cityId); if (!city) throw new ApiError(422, 'CITY_NOT_READY', 'This city is not enabled for fixture planning.');
    const issues = validateInput(input, city); if (issues.length) throw new ApiError(422, issues[0].code, issues.map(issue => issue.message).join(' ')); return city;
  }
  const mutate = <T>(request: FastifyRequest, body: unknown, work: () => Promise<T>) => guard.run(`${owner(request)}:${request.method}:${request.url.split('?')[0]}`, request.headers['idempotency-key'], body, work);
  app.get('/api/health', async () => ({ schemaVersion: 1, authMode: options.auth.mode, persistence: options.auth.mode === 'local' ? 'local_file' : 'firestore', fixturePlanning: options.fixtures, routingConfigured: !!options.routes, placesConfigured: !!options.places, checkedCities: catalog.available().length, livePlanning: false, assistantMode: interpreter.mode }));
  app.get('/api/locations/config', async () => ({ ...(options.locationCapabilities ?? { autocomplete: !!options.locations, reverseGeocode: !!options.locations, timezone: !!options.locations, routing: !!options.liveRoutes }), guideDiscovery: !!options.guide, guideRouting: !!options.liveRoutes?.matrix, guideAssistant: interpreter.mode, ...(options.locationConfigurationIssues?.length ? { issues: options.locationConfigurationIssues } : {}) }));
  registerGuideRoutes(app, { options, locations, guard: providerGuard, owner, interpreter, assistant, catalog });
  const locationProvider = () => { if (!options.locations) throw new ApiError(503, 'LOCATION_PROVIDER_NOT_CONFIGURED', 'Configure the server Google Places, Geocoding and Time Zone keys. See location-setup.md.'); return options.locations; };
  function requireLocationCapabilities(...required: Array<'autocomplete' | 'reverseGeocode' | 'timezone'>) {
    const missing = required.filter(key => options.locationCapabilities && !options.locationCapabilities[key]);
    if (missing.length) throw new ApiError(503, 'LOCATION_PROVIDER_NOT_CONFIGURED', `Configure ${missing.join(', ')} on the server before this lookup. See location-setup.md for the required APIs and keys.`);
  }
  app.post('/api/locations/autocomplete', { config: { rateLimit: { max: 45, timeWindow: '1 minute', keyGenerator: request => owner(request) ?? request.ip } } }, async request => {
    const body = autocompleteSchema.parse(request.body), provider = locationProvider(); requireLocationCapabilities('autocomplete'); providerGuard.consume();
    return provider.autocomplete(body.input, body.sessionToken, body.citiesOnly, body.bias);
  });
  app.post('/api/locations/resolve', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async request => {
    const body = resolveLocationSchema.parse(request.body), provider = locationProvider(), signal = AbortSignal.timeout(18000); requireLocationCapabilities('autocomplete', 'reverseGeocode', ...(body.destinationCity ? ['timezone' as const] : [])); providerGuard.consume();
    const detail = await provider.details(body.placeId, body.sessionToken, signal);
    if (body.destinationCity && !detail.types.some(type => ['locality', 'postal_town', 'administrative_area_level_3'].includes(type))) throw new ApiError(422, 'CITY_REQUIRED', 'Select a city suggestion for the trip destination, rather than a hotel or address.');
    providerGuard.consume(); const reversed = await provider.reverse(detail.coordinates, signal);
    let timezone: string | undefined;
    if (body.destinationCity) {
      if (!reversed.city) throw new ApiError(422, 'CITY_UNVERIFIED', 'Google could not identify the destination city and country. Select a more specific city suggestion.');
      providerGuard.consume(); timezone = await provider.timezone(detail.coordinates, signal);
    }
    // Compare all selections using the reverse-geocoded locality identity.
    // Places search and Geocoding can give the same city different place IDs;
    // the selected destination still retains its original details.placeId.
    return locations.add(owner(request), { ...reversed, ...detail, source: 'search', ...(body.destinationCity ? { city: reversed.city!, timezone } : {}) });
  });
  app.post('/api/locations/reverse', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async request => {
    const body = reverseLocationSchema.parse(request.body);
    if (body.source === 'gps' && (Date.parse(body.observedAt!) < Date.now() - 120000 || Date.parse(body.observedAt!) > Date.now() + 60000)) throw new ApiError(422, 'LOCATION_STALE', 'Your browser location is old. Request your current location again.');
    const gps = body.source === 'gps' ? { accuracyMeters: body.accuracyMeters!, observedAt: body.observedAt! } : undefined;
    let data;
    try {
      const provider = locationProvider(); requireLocationCapabilities('reverseGeocode'); providerGuard.consume();
      const reversed = await provider.reverse(body.coordinates, AbortSignal.timeout(10000));
      data = { ...reversed, coordinates: body.coordinates, source: body.source, addressStatus: 'resolved' as const, ...(gps ?? {}) };
    } catch (failure) {
      // The user's valid point is independent of Google address availability.
      // Unexpected programming errors remain errors; no fabricated address is used.
      if (!(failure instanceof ProviderError) && !(failure instanceof ApiError && ['LOCATION_PROVIDER_NOT_CONFIGURED', 'PROVIDER_BUDGET_LIMIT'].includes(failure.code))) throw failure;
      data = { ...coordinateLocation(body.coordinates, body.source, gps), resolutionMessage: failure.message };
    }
    return locations.add(owner(request), data);
  });
  app.post('/api/plans/live', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async request => {
    const body = liveRouteInputSchema.parse(request.body), destination = locations.get(owner(request), body.destinationId), start = locations.get(owner(request), body.startId);
    if (destination.source !== 'search' || !destination.city || !destination.timezone || !destination.placeId) throw new ApiError(422, 'DESTINATION_UNRESOLVED', 'Select a provider-resolved destination city with its timezone.');
    const end = body.returnToStart ? start : locations.get(owner(request), body.endId!), stops = body.stops.map(stop => locations.get(owner(request), stop.locationId));
    if (!stops.some(stop => startMatchesDestination(stop, destination))) throw new ApiError(422, 'DESTINATION_VISIT_REQUIRED', 'Select at least one visit in the chosen destination city. Your starting location does not change the destination.');
    if (new Set(body.stops.map(stop => stop.locationId)).size !== stops.length) throw new ApiError(422, 'DUPLICATE_STOP', 'Select each visit only once.');
    if (!startMatchesDestination(start, destination) && !body.allowOutsideStart) throw new ApiError(422, 'START_CITY_MISMATCH', 'Your start is outside or unverified against the destination city. Choose to travel from this start, or select a start within the destination city.');
    let timing: ReturnType<typeof liveDeparture>;
    try { timing = liveDeparture(body, destination); } catch (error) { throw new ApiError(422, 'INVALID_DEPARTURE', error instanceof Error ? error.message : 'Choose a valid destination-local departure.'); }
    if (!options.liveRoutes) throw new ApiError(503, 'ROUTING_NOT_CONFIGURED', 'Configure GOOGLE_ROUTES_API_KEY and enable Routes API.');
    const route = await providerGuard.run(owner(request), request.headers['idempotency-key'], body, () => options.liveRoutes!.itinerary(start.coordinates, end.coordinates, stops.map(stop => stop.coordinates), new Date(timing.departure).toISOString(), body.optimize));
    return buildLiveItinerary(body, destination, start, end, stops, route);
  });
  app.get('/api/readiness', async () => ({ schemaVersion: 1, localPlanning: options.fixtures, livePlanning: false, message: options.fixtures ? 'Test planning is available. Live city planning has not been validated.' : 'Live city planning has not been validated.', pending: [...pendingReleaseGates] }));
  app.get('/api/ops/status', async () => ({ schemaVersion: 1, livePlanning: false, telemetry: telemetry.snapshot(), allowances: { providers: providerGuard.usage(), ai: assistant.usage() }, catalog: { cities: catalog.cities.length, currentRouteCities: catalog.available().length }, alerts: [
    ...(providerGuard.usage().remaining === 0 ? [providerGuard.usage().limit === 0 ? 'PROVIDER_CALLS_DISABLED' : 'PROVIDER_ALLOWANCE_EXHAUSTED'] : []), ...(interpreter.mode !== 'local' && assistant.usage().remaining === 0 ? [assistant.usage().limit === 0 ? 'AI_CALLS_DISABLED' : 'AI_ALLOWANCE_EXHAUSTED'] : []),
    ...(telemetry.snapshot().routes.some(row => row.failures >= 3) ? ['REPEATED_SERVER_FAILURES'] : []),
  ], limitations: ['Counters reset on restart; limits are per process, not billing caps.', 'Diagnostics contain aggregate route templates only.', ...pendingReleaseGates] }));
  app.post('/api/dev/session', { config: { rateLimit: { max: options.fixtureSessionRateMax ?? 10, timeWindow: '1 minute' } } }, async request => {
    if (options.auth.mode !== 'local' || !options.auth.issue) throw missing();
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip)) throw new ApiError(403, 'LOCAL_ONLY', 'Development sessions are only available on loopback.');
    return options.auth.issue();
  });
  app.get('/api/cities', async () => ({ fixtures: options.fixtures ? cities.map(city => ({ id: city.id, name: city.name, timezone: city.timezone, currency: city.currency, catalogVersion: city.catalogVersion, dataMode: 'fixture' })) : [], checked: catalog.available() }));
  app.get('/api/trips', async request => ({ trips: await options.store.list(owner(request)) }));
  app.post('/api/trips', async (request, reply) => {
    const body = createTripSchema.parse(request.body); validateFixture(body.input);
    const trip = await mutate(request, body, () => options.store.create({ schemaVersion: 1, id: randomUUID(), ownerId: owner(request), input: body.input, order: null, revision: 0, confirmed: null, updatedAt: now() }));
    return reply.code(201).send(trip);
  });
  app.get('/api/trips/:id', async request => options.store.get(owner(request), tripId(request)));
  app.patch('/api/trips/:id', async request => {
    const body = editTripSchema.parse(request.body); validateFixture(body.input); const id = tripId(request);
    return mutate(request, body, () => options.store.change(owner(request), id, body.expectedRevision, trip => {
      if (trip.progress?.revision) throw new ApiError(422, 'PROGRESS_REQUIRES_PROPOSAL', 'Use an assistant proposal to edit this day with reported progress, or create a separate trip.');
      if (trip.input.cityId !== body.input.cityId) throw new ApiError(422, 'CITY_IMMUTABLE', 'Create a separate trip for another city.');
      if (body.order) { const available = getCity(body.input.cityId)!; if (body.order.some(placeId => !available.places.some(place => place.id === placeId)) || new Set(body.order).size !== body.order.length) throw new ApiError(422, 'INVALID_ORDER', 'Stop order must contain unique places from this city.'); }
      return { ...trip, input: body.input, order: body.order, revision: trip.revision + 1, updatedAt: now() };
    }));
  });
  app.delete('/api/trips/:id', async request => {
    const body = generateSchema.parse(request.body), id = tripId(request);
    return mutate(request, body, async () => {
      await options.store.delete(owner(request), id, body.expectedRevision);
      for (const [key, candidate] of candidates) if (candidate.owner === owner(request) && candidate.tripId === id) candidates.delete(key);
      assistant.forget(owner(request), id);
      guard.eraseOwner(owner(request), `${owner(request)}:DELETE:${request.url.split('?')[0]}`);
      return { deleted: true };
    });
  });
  app.post('/api/plans/preview', { config: { rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: request => owners.get(request) ?? request.ip } } }, async request => {
    const body = previewSchema.parse(request.body), city = validateFixture(body.input);
    return mutate(request, body, async () => body.order ? scheduleOrder(body.input, city, body.order) : generatePlan(body.input, city));
  });
  app.post('/api/trips/:id/generate', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async request => {
    const body = generateSchema.parse(request.body), id = tripId(request);
    return mutate(request, body, async () => {
      const trip = await options.store.get(owner(request), id); if (trip.revision !== body.expectedRevision) throw stale();
      if (trip.progress?.revision) throw new ApiError(422, 'PROGRESS_REQUIRES_PROPOSAL', 'Use assistant proposals after reporting progress; completed stops cannot be recalculated.');
      const city = validateFixture(trip.input);
      const result = trip.order ? scheduleOrder(trip.input, city, trip.order) : generatePlan(trip.input, city);
      if (result.outcome !== 'feasible') return { result, candidate: null };
      const timestamp = Date.now(); for (const [key, candidate] of candidates) if (candidate.expires <= timestamp) candidates.delete(key);
      if (candidates.size >= 500) throw new ApiError(429, 'CANDIDATE_CAPACITY', 'The local review queue is full. Retry later.');
      const candidateId = randomUUID(), expires = timestamp + 10 * 60000;
      candidates.set(candidateId, { owner: owner(request), tripId: id, revision: trip.revision, input: structuredClone(trip.input), plan: result.plan, expires });
      return { result, candidate: { id: candidateId, expiresAt: new Date(expires).toISOString() } };
    });
  });
  app.post('/api/trips/:id/confirm', async request => {
    const body = confirmRequestSchema.parse(request.body), id = tripId(request);
    return mutate(request, body, () => options.store.change(owner(request), id, body.expectedRevision, trip => {
      const candidate = candidates.get(body.candidateId);
      if (!candidate || candidate.owner !== owner(request) || candidate.tripId !== id) throw missing();
      if (candidate.expires <= Date.now()) throw new ApiError(409, 'CANDIDATE_EXPIRED', 'This review expired. Generate a new draft.');
      if (candidate.revision !== trip.revision) throw stale();
      if ((trip.confirmed?.id ?? null) !== body.expectedConfirmedId) throw new ApiError(409, 'STALE_CONFIRMATION', 'The confirmed version changed. Review the latest draft before accepting it.');
      return { ...trip, confirmed: confirmPlan(candidate.input, candidate.plan, trip.confirmed, body.expectedConfirmedId), order: candidate.plan.order, revision: trip.revision + 1, updatedAt: now() };
    }));
  });
  app.post('/api/cities/:cityId/route', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async request => {
    // Route payloads are request-scoped, never written to the repository/idempotency cache.
    const body = routeRequestSchema.parse(request.body), id = (request.params as { cityId: string }).cityId;
    const city = catalog.city(id); if (!city) throw new ApiError(422, 'CATALOG_NOT_READY', 'This city has no current checked routing locations.');
    const from = city.locations.find(location => location.id === body.fromId), to = city.locations.find(location => location.id === body.toId);
    if (!from || !to || from.id === to.id) throw new ApiError(422, 'LOCATION_UNAVAILABLE', 'Choose two different checked locations in this city.');
    const departure = Date.parse(body.departureTime); if (departure < Date.now() || departure > Date.now() + 7 * 86400000) throw new ApiError(422, 'DEPARTURE_WINDOW', 'Choose a departure in the next seven days.');
    if (!options.routes) throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Configure the server routing key before requesting a live route.');
    return providerGuard.run(owner(request), request.headers['idempotency-key'], { cityId: id, ...body }, () => options.routes!.compute(from.coordinates, to.coordinates, body.departureTime));
  });
  app.get('/api/cities/:cityId/locations/:locationId/enrichment', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async request => {
    const params = request.params as { cityId: string; locationId: string }, city = catalog.city(params.cityId);
    const location = city?.locations.find(value => value.id === params.locationId); if (!location?.googlePlaceId) throw missing();
    if (!options.places) throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Configure the server Places key before requesting enrichment.');
    providerGuard.consume();
    return options.places.details(location.googlePlaceId);
  });
  app.post('/api/assistant/turns', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async request => {
    const body = assistantTurnSchema.parse(request.body);
    return mutate(request, body, () => assistant.turn(owner(request), body.tripId, body.expectedRevision, body.message));
  });
  app.post('/api/trips/:id/progress', async request => {
    const body = progressRequestSchema.parse(request.body);
    return mutate(request, body, () => assistant.progress(owner(request), tripId(request), body.expectedRevision, body.expectedProgressRevision, body.completedCount, body.delayMinutes));
  });
  for (const decision of ['accept', 'reject'] as const) app.post(`/api/trips/:id/proposals/:proposalId/${decision}`, async request => {
    const body = proposalDecisionSchema.parse(request.body), proposalId = idSchema.parse((request.params as { proposalId: string }).proposalId);
    return mutate(request, body, () => assistant.decide(owner(request), tripId(request), proposalId, body.expectedRevision, body.expectedProgressRevision, body.expectedConfirmedId, decision === 'accept'));
  });
  return app;
}
