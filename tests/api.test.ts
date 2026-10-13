import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../apps/api/src/server';
import { localAuthenticator } from '../apps/api/src/auth';
import { LocalTripStore } from '../apps/api/src/store';
import { defaultInput, cities } from '../fixtures/cities';
import type { RemoteTrip } from '../packages/contracts/src/api';
import { CheckedCatalog, checkedCatalogSchema } from '../packages/data-adapters/src/catalog';

const servers: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())); });
async function setup(extra: Partial<Parameters<typeof createServer>[0]> = {}) {
  const auth = localAuthenticator(randomBytes(32)), store = new LocalTripStore();
  const server = await createServer({ auth, store, fixtures: true, webOrigin: 'http://127.0.0.1:5173', ...extra }); servers.push(server);
  const token = auth.issue!().token;
  const headers = () => ({ authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() });
  return { server, auth, store, headers };
}
const input = () => defaultInput(cities[0]);
describe('authenticated private API', () => {
  it('rejects absent and tampered tokens and browser origins', async () => {
    const { server, headers } = await setup();
    expect((await server.inject('/api/trips')).statusCode).toBe(401);
    expect((await server.inject({ url: '/api/trips', headers: { authorization: `${headers().authorization}x` } })).statusCode).toBe(401);
    expect((await server.inject({ url: '/api/health', headers: { origin: 'https://untrusted.example' } })).statusCode).toBe(403);
    const issued = await server.inject({ method: 'POST', url: '/api/dev/session', remoteAddress: '10.0.0.1' }); expect(issued.statusCode).toBe(403);
  });
  it('does not leak another owner’s trip through reads, edits, confirms or listing', async () => {
    const { server, auth, headers } = await setup();
    const created = (await server.inject({ method: 'POST', url: '/api/trips', headers: headers(), payload: { input: input() } })).json<RemoteTrip>();
    const foreign = { authorization: `Bearer ${auth.issue!().token}`, 'idempotency-key': randomUUID() };
    expect((await server.inject({ url: `/api/trips/${created.id}`, headers: foreign })).statusCode).toBe(404);
    expect((await server.inject({ method: 'PATCH', url: `/api/trips/${created.id}`, headers: foreign, payload: { expectedRevision: 0, input: input(), order: null } })).statusCode).toBe(404);
    expect((await server.inject({ method: 'POST', url: `/api/trips/${created.id}/confirm`, headers: foreign, payload: { expectedRevision: 0, candidateId: randomUUID(), expectedConfirmedId: null } })).statusCode).toBe(404);
    expect((await server.inject({ url: '/api/trips', headers: foreign })).json().trips).toEqual([]);
  });
  it('rejects unknown fields, invalid cities, local times and oversized bodies', async () => {
    const { server, headers } = await setup();
    expect((await server.inject({ method: 'POST', url: '/api/trips', headers: headers(), payload: { input: input(), ownerId: 'attacker' } })).statusCode).toBe(400);
    expect((await server.inject({ method: 'POST', url: '/api/trips', headers: headers(), payload: { input: { ...input(), cityId: 'arbitrary' } } })).statusCode).toBe(422);
    expect((await server.inject({ method: 'POST', url: '/api/trips', headers: headers(), payload: { input: { ...input(), startTime: '19:00' } } })).statusCode).toBe(422);
    expect((await server.inject({ method: 'POST', url: '/api/trips', headers: headers(), payload: { huge: 'a'.repeat(33000) } })).statusCode).toBe(413);
  });
  it('replays matching creates once and rejects reused keys with changed intent', async () => {
    const { server, headers } = await setup(); const request = { method: 'POST' as const, url: '/api/trips', headers: headers(), payload: { input: input() } };
    const [a, b] = await Promise.all([server.inject(request), server.inject(request)]);
    expect(a.statusCode).toBe(201); expect(b.json().id).toBe(a.json().id);
    expect((await server.inject({ ...request, payload: { input: { ...input(), adults: 3 } } })).statusCode).toBe(409);
    expect((await server.inject({ url: '/api/trips', headers: request.headers })).json().trips).toHaveLength(1);
  });
  it('rejects stale revisions and preserves confirmed snapshots during edits', async () => {
    const { server, headers } = await setup();
    const trip = (await server.inject({ method: 'POST', url: '/api/trips', headers: headers(), payload: { input: input() } })).json<RemoteTrip>();
    const generated = (await server.inject({ method: 'POST', url: `/api/trips/${trip.id}/generate`, headers: headers(), payload: { expectedRevision: 0 } })).json();
    expect(generated.result.outcome).toBe('feasible');
    const confirmed = await server.inject({ method: 'POST', url: `/api/trips/${trip.id}/confirm`, headers: headers(), payload: { expectedRevision: 0, candidateId: generated.candidate.id, expectedConfirmedId: null } });
    expect(confirmed.statusCode).toBe(200); const accepted = confirmed.json<RemoteTrip>();
    expect((await server.inject({ method: 'PATCH', url: `/api/trips/${trip.id}`, headers: headers(), payload: { expectedRevision: 0, input: input(), order: null } })).statusCode).toBe(409);
    const edited = await server.inject({ method: 'PATCH', url: `/api/trips/${trip.id}`, headers: headers(), payload: { expectedRevision: 1, input: { ...input(), adults: 3 }, order: null } });
    expect(edited.json().confirmed).toEqual(accepted.confirmed);
    expect((await server.inject({ method: 'POST', url: `/api/trips/${trip.id}/confirm`, headers: headers(), payload: { expectedRevision: 2, candidateId: generated.candidate.id, expectedConfirmedId: accepted.confirmed!.id } })).statusCode).toBe(409);
  });
  it('cannot confirm a candidate from another trip or fabricate a plan body', async () => {
    const { server, headers } = await setup();
    const create = async () => (await server.inject({ method: 'POST', url: '/api/trips', headers: headers(), payload: { input: input() } })).json<RemoteTrip>();
    const a = await create(), b = await create();
    const generated = (await server.inject({ method: 'POST', url: `/api/trips/${a.id}/generate`, headers: headers(), payload: { expectedRevision: 0 } })).json();
    expect((await server.inject({ method: 'POST', url: `/api/trips/${b.id}/confirm`, headers: headers(), payload: { expectedRevision: 0, candidateId: generated.candidate.id, expectedConfirmedId: null } })).statusCode).toBe(404);
    expect((await server.inject({ method: 'POST', url: `/api/trips/${a.id}/confirm`, headers: headers(), payload: { expectedRevision: 0, candidateId: generated.candidate.id, expectedConfirmedId: null, plan: generated.result.plan } })).statusCode).toBe(400);
  });
  it('has typed fixture edit failures and refuses fake locations for real routes', async () => {
    const { server, headers } = await setup();
    const generated = (await server.inject({ method: 'POST', url: '/api/plans/preview', headers: headers(), payload: { input: input(), order: [cities[0].places[0].id] } })).json();
    expect(generated.outcome).toBe('no_plan_found'); expect(generated.issues[0].code).toBe('MEAL_REQUIRED');
    const route = await server.inject({ method: 'POST', url: '/api/cities/jaipur-test/route', headers: headers(), payload: { fromId: 'stay', toId: 'museum', departureTime: new Date(Date.now() + 60000).toISOString() } });
    expect(route.statusCode).toBe(422); expect(route.json().error.code).toBe('CATALOG_NOT_READY');
  });
  it('deletes private trips and requires a current revision', async () => {
    const { server, headers } = await setup(); const trip = (await server.inject({ method: 'POST', url: '/api/trips', headers: headers(), payload: { input: input() } })).json<RemoteTrip>();
    expect((await server.inject({ method: 'DELETE', url: `/api/trips/${trip.id}`, headers: headers(), payload: { expectedRevision: 1 } })).statusCode).toBe(409);
    expect((await server.inject({ method: 'DELETE', url: `/api/trips/${trip.id}`, headers: headers(), payload: { expectedRevision: 0 } })).json().deleted).toBe(true);
    expect((await server.inject({ url: `/api/trips/${trip.id}`, headers: headers() })).statusCode).toBe(404);
  });
  it('uses only checked catalog coordinates for routes and never stores the transient result', async () => {
    const now = Date.now();
    const parsed = checkedCatalogSchema.parse({ schemaVersion: 1, cities: [{ id: 'test-sample', name: 'Simulated route catalog', country: 'Test', currency: 'USD', timezone: 'UTC', catalogVersion: 'test', status: 'route_review', locations: ['one', 'two'].map((id, index) => ({ id, name: id, coordinates: { latitude: index, longitude: index }, evidence: { sourceUrl: 'https://example.com/test-only', method: 'official_source', checkedAt: new Date(now - 60000).toISOString(), validUntil: new Date(now + 86400000).toISOString(), rights: 'Test fixture only' } })) }] });
    let calls = 0;
    const { server, headers } = await setup({ catalog: new CheckedCatalog(parsed.cities), routes: { async compute(from, to, departureTime) { calls++; expect(from.latitude).toBe(0); expect(to.latitude).toBe(1); return { provider: 'google_routes', mode: 'DRIVE', durationSeconds: 60, distanceMeters: 100, encodedPolyline: 'test-only', departureTime, fetchedAt: new Date(now).toISOString(), expiresAt: new Date(now + 300000).toISOString(), trafficBasis: 'prediction_for_departure', persistence: 'memory_only' }; } } });
    const request = { method: 'POST' as const, url: '/api/cities/test-sample/route', headers: headers(), payload: { fromId: 'one', toId: 'two', departureTime: new Date(now + 60000).toISOString() } };
    expect((await server.inject(request)).statusCode).toBe(200);
    expect((await server.inject(request)).json().error.code).toBe('PROVIDER_REQUEST_FINISHED'); expect(calls).toBe(1);
    expect((await server.inject({ url: '/api/trips', headers: headers() })).json().trips).toEqual([]);
    expect((await server.inject({ ...request, headers: headers(), payload: { ...request.payload, fromId: 'unverified' } })).statusCode).toBe(422);
  });
  it('does not accept Firebase mode development sessions and applies request limits', async () => {
    const { server, headers } = await setup({ auth: { mode: 'firebase', async verify() { return 'test-uid'; } }, rateMax: 2 });
    expect((await server.inject({ method: 'POST', url: '/api/dev/session' })).statusCode).toBe(404);
    await server.inject({ url: '/api/trips', headers: headers() });
    await server.inject({ url: '/api/trips', headers: headers() });
    expect((await server.inject({ url: '/api/trips', headers: headers() })).statusCode).toBe(429);
  });
  it('keeps the default session limit and restricts extra fixture sessions to unpaid local CI', async () => {
    const { server } = await setup();
    for (let count = 0; count < 10; count++) expect((await server.inject({ method: 'POST', url: '/api/dev/session' })).statusCode).toBe(200);
    expect((await server.inject({ method: 'POST', url: '/api/dev/session' })).statusCode).toBe(429);
    const fixture = { fixtureSessionRateMax: 30, providerDailyLimit: 0, aiDailyLimit: 0 };
    try {
      vi.stubEnv('CI', 'false'); vi.stubEnv('NODE_ENV', 'development');
      await expect(setup(fixture)).rejects.toThrow('Session limit overrides require development CI');
      vi.stubEnv('CI', 'true');
      await expect(setup({ ...fixture, fixtures: false })).rejects.toThrow('Session limit overrides');
      await expect(setup({ ...fixture, providerDailyLimit: 1 })).rejects.toThrow('Session limit overrides');
      await expect(setup({ ...fixture, fixtureSessionRateMax: 31 })).rejects.toThrow('Session limit overrides');
      await expect(setup({ ...fixture, auth: { mode: 'firebase', async verify() { return 'test'; } } })).rejects.toThrow('Session limit overrides');
      const isolated = await setup(fixture);
      for (let count = 0; count < 30; count++) expect((await isolated.server.inject({ method: 'POST', url: '/api/dev/session' })).statusCode).toBe(200);
      expect((await isolated.server.inject({ method: 'POST', url: '/api/dev/session' })).statusCode).toBe(429);
    } finally { vi.unstubAllEnvs(); }
  });
  it('assistant endpoints require ownership and invalidate generic generation after progress', async () => {
    const { server, headers, auth } = await setup();
    const trip = (await server.inject({ method: 'POST', url: '/api/trips', headers: headers(), payload: { input: input() } })).json<RemoteTrip>();
    const generated = (await server.inject({ method: 'POST', url: `/api/trips/${trip.id}/generate`, headers: headers(), payload: { expectedRevision: 0 } })).json();
    await server.inject({ method: 'POST', url: `/api/trips/${trip.id}/confirm`, headers: headers(), payload: { expectedRevision: 0, candidateId: generated.candidate.id, expectedConfirmedId: null } });
    const turn = await server.inject({ method: 'POST', url: '/api/assistant/turns', headers: headers(), payload: { tripId: trip.id, expectedRevision: 1, message: 'Delay 30 minutes' } });
    expect(turn.statusCode).toBe(200); const value = turn.json(); expect(value.trip.revision).toBe(2);
    expect((await server.inject({ method: 'POST', url: `/api/trips/${trip.id}/generate`, headers: headers(), payload: { expectedRevision: 2 } })).json().error.code).toBe('PROGRESS_REQUIRES_PROPOSAL');
    expect((await server.inject({ method: 'PATCH', url: `/api/trips/${trip.id}`, headers: headers(), payload: { expectedRevision: 2, input: input(), order: null } })).json().error.code).toBe('PROGRESS_REQUIRES_PROPOSAL');
    expect((await server.inject({ method: 'POST', url: '/api/assistant/turns', headers: { authorization: `Bearer ${auth.issue!().token}`, 'idempotency-key': randomUUID() }, payload: { tripId: trip.id, expectedRevision: 2, message: 'summary' } })).statusCode).toBe(404);
    const proposal = value.reply.proposal;
    const accepted = await server.inject({ method: 'POST', url: `/api/trips/${trip.id}/proposals/${proposal.id}/accept`, headers: headers(), payload: { expectedRevision: 2, expectedProgressRevision: 1, expectedConfirmedId: value.trip.confirmed.id } });
    expect(accepted.statusCode).toBe(200); expect(accepted.json().history).toHaveLength(1);
  });
});
describe('local persistence and evidence boundaries', () => {
  it('persists atomically and serializes concurrent edits against the same revision', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'daywise-store-')), path = join(directory, 'trips.json');
    const store = new LocalTripStore(path); await store.initialize();
    const trip: RemoteTrip = { schemaVersion: 1, id: randomUUID(), ownerId: 'owner', input: input(), order: null, confirmed: null, revision: 0, updatedAt: new Date().toISOString() };
    await store.create(trip);
    const edits = await Promise.allSettled([1, 2].map(adults => store.change('owner', trip.id, 0, value => ({ ...value, input: { ...value.input, adults }, revision: 1 }))));
    expect(edits.filter(edit => edit.status === 'fulfilled')).toHaveLength(1);
    const restored = new LocalTripStore(path); await restored.initialize(); expect((await restored.get('owner', trip.id)).revision).toBe(1);
    expect(JSON.parse(await readFile(path, 'utf8'))).toHaveLength(1);
  });
  it('checks evidence age, staging, unique IDs and rejects fixture promotion', () => {
    const city = { id: 'sample-city', name: 'Test-only sample', country: 'Test', currency: 'USD', timezone: 'America/New_York', catalogVersion: 'test', status: 'route_review', locations: ['one', 'two'].map(id => ({ id, name: id, coordinates: { latitude: 0, longitude: 0 }, evidence: { sourceUrl: 'https://example.com/test-only', method: 'official_source', checkedAt: '2026-01-01T00:00:00Z', validUntil: '2027-01-01T00:00:00Z', rights: 'Test fixture only' } })) };
    const parsed = checkedCatalogSchema.parse({ schemaVersion: 1, cities: [city] });
    expect(new CheckedCatalog(parsed.cities, () => Date.parse('2026-10-09')).available()).toHaveLength(1);
    expect(new CheckedCatalog(parsed.cities, () => Date.parse('2027-10-09')).available()).toHaveLength(0);
    expect(new CheckedCatalog(parsed.cities, () => Date.parse('2025-10-09')).available()).toHaveLength(0);
    expect(checkedCatalogSchema.safeParse({ schemaVersion: 1, cities: [{ ...city, id: 'jaipur-test' }] }).success).toBe(false);
    expect(checkedCatalogSchema.safeParse({ schemaVersion: 1, cities: [{ ...city, locations: [city.locations[0], city.locations[0]] }] }).success).toBe(false);
  });
  it('expired development tokens are rejected', async () => {
    let now = 0; const auth = localAuthenticator(randomBytes(32), () => now), token = auth.issue!().token;
    now += 25 * 60 * 60000; await expect(auth.verify(token)).rejects.toMatchObject({ status: 401 });
  });
});
