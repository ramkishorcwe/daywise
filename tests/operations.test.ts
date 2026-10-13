import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { MaintenanceStore } from '../apps/api/src/maintenance';
import { currentFood, maintenanceContentSchema, reviewProblems } from '../packages/data-adapters/src/maintenance';
import { createServer } from '../apps/api/src/server';
import { LocalTripStore } from '../apps/api/src/store';
import { localAuthenticator } from '../apps/api/src/auth';
import { Telemetry } from '../apps/api/src/telemetry';
import { IdempotencyGuard } from '../apps/api/src/idempotency';
import { ProviderGuard } from '../apps/api/src/provider-guard';
import { cities, defaultInput } from '../fixtures/cities';

const timestamp = Date.parse('2026-10-11T00:00:00Z');
// Synthetic maintenance-only records, never imported into the running app.
const evidence = { sourceUrl: 'https://example.invalid/test-evidence', method: 'direct_confirmation' as const, checkedAt: '2026-10-10T00:00:00Z', validUntil: '2026-10-12T00:00:00Z', rights: 'Synthetic data used only for software tests.' };
function content() { return maintenanceContentSchema.parse({ catalog: { schemaVersion: 1, cities: [{ id: 'sample-city', name: 'Synthetic Maintenance City', country: 'Test', timezone: 'America/New_York', currency: 'USD', catalogVersion: 'test-one', status: 'route_review', locations: [{ id: 'one', name: 'Synthetic branch one', coordinates: { latitude: 0, longitude: 0 }, evidence }, { id: 'two', name: 'Synthetic branch two', coordinates: { latitude: 0, longitude: 1 }, evidence }] }] }, food: [{ id: 'branch-rule', cityId: 'sample-city', locationId: 'one', rule: 'no_onion', status: 'supported', scope: 'branch_preparation', evidence }] }); }
async function maintenance() { const directory = await mkdtemp(join(tmpdir(), 'daywise-maintenance-')); let now = timestamp; return { store: new MaintenanceStore(directory, () => now), directory, advance: () => { now += 2 * 86400000; } }; }

describe('offline catalog maintenance and review', () => {
  it('keeps staged edits separate, requires a reviewer and atomically commits the reviewed digest', async () => {
    const { store, directory } = await maintenance();
    const proposal = await store.stage(content(), 0, 'operator_one', 'Checked synthetic branch evidence for this software test.');
    expect((await store.read()).revision).toBe(0);
    await expect(store.decide(proposal.id, proposal.digest, 0, 'operator_one', true)).rejects.toMatchObject({ code: 'REVIEWER_REQUIRED' });
    expect(await store.decide(proposal.id, proposal.digest, 0, 'reviewer_two', true)).toMatchObject({ revision: 1, restartRequired: true });
    const persisted = new MaintenanceStore(directory); expect((await persisted.read()).content).toEqual(content());
    expect((await persisted.read()).audit[0]).toMatchObject({ digest: proposal.digest, fromRevision: 0 });
    await expect(store.inspect(proposal.id)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rejects stale or tampered approvals and permits discarding a stale proposal', async () => {
    const { store, directory } = await maintenance();
    const first = await store.stage(content(), 0, 'writer', 'Test reviewed evidence in staging.'), second = await store.stage(content(), 0, 'writer', 'A second software-only staging revision.');
    await store.decide(first.id, first.digest, 0, 'reviewer', true);
    await expect(store.decide(second.id, second.digest, 1, 'reviewer', true)).rejects.toMatchObject({ code: 'STALE_REVISION' });
    expect(await store.decide(second.id, second.digest, 1, 'reviewer', false)).toMatchObject({ decision: 'rejected', revision: 1 });
    const proposed = content(); proposed.catalog.cities[0].catalogVersion = 'test-two';
    const third = await store.stage(proposed, 1, 'writer', 'Changed version in a test proposal.');
    const file = join(directory, `proposal-${third.id}.json`), row = JSON.parse(await readFile(file, 'utf8')); row.reason = 'Tampered reason after review snapshot.'; await writeFile(file, JSON.stringify(row));
    await expect(store.decide(third.id, third.digest, 1, 'reviewer', true)).rejects.toMatchObject({ code: 'PROPOSAL_CHANGED' });
  });
  it('blocks expired/future evidence and expired proposals without modifying active data', async () => {
    const { store, advance } = await maintenance(); const value = content();
    value.food[0].evidence!.checkedAt = '2026-10-11T12:00:00Z';
    const future = await store.stage(value, 0, 'writer', 'Future evidence must not become current.');
    await expect(store.decide(future.id, future.digest, 0, 'reviewer', true)).rejects.toMatchObject({ code: 'EVIDENCE_NOT_CURRENT' });
    expect(currentFood(value, timestamp)[0].effectiveStatus).toBe('unknown');
    const proposal = await store.stage(content(), 0, 'writer', 'A test proposal that will expire.'); advance();
    await expect(store.decide(proposal.id, proposal.digest, 0, 'reviewer', true)).rejects.toMatchObject({ code: 'PROPOSAL_EXPIRED' });
    expect(reviewProblems(content(), timestamp + 2 * 86400000)).toHaveLength(2);
    expect((await store.read()).revision).toBe(0);
  });
  it('requires changed catalog versions and rejects orphan/duplicate branch evidence', async () => {
    const { store } = await maintenance(); const first = await store.stage(content(), 0, 'writer', 'Initial version for a synthetic city.'); await store.decide(first.id, first.digest, 0, 'reviewer', true);
    const changed = content(); changed.catalog.cities[0].locations[0].name = 'Changed test name';
    const proposal = await store.stage(changed, 1, 'writer', 'Changing content needs a new city version.');
    await expect(store.decide(proposal.id, proposal.digest, 1, 'reviewer', true)).rejects.toMatchObject({ code: 'CATALOG_VERSION_REQUIRED' });
    const orphan = content(); orphan.food[0].locationId = 'absent'; expect(maintenanceContentSchema.safeParse(orphan).success).toBe(false);
    const duplicate = content(); duplicate.food.push({ ...duplicate.food[0], id: 'another' }); expect(maintenanceContentSchema.safeParse(duplicate).success).toBe(false);
  });
  it('never treats missing evidence as dietary support or allows path traversal', async () => {
    const value = content(); value.food[0].evidence = null; expect(maintenanceContentSchema.safeParse(value).success).toBe(false);
    value.food[0].status = 'unknown'; expect(maintenanceContentSchema.safeParse(value).success).toBe(true);
    const { store } = await maintenance(); await expect(store.inspect('../../secret')).rejects.toThrow();
  });
  it('serializes concurrent approvals and fails closed on an interrupted writer lock', async () => {
    const { store, directory } = await maintenance(); const proposal = await store.stage(content(), 0, 'writer', 'Serialize review of synthetic data.');
    const results = await Promise.allSettled([store.decide(proposal.id, proposal.digest, 0, 'reviewer', true), store.decide(proposal.id, proposal.digest, 0, 'reviewer', true)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect((await store.read()).revision).toBe(1);
    await writeFile(join(directory, 'writer.lock'), 'interrupted');
    await expect(store.stage(content(), 1, 'writer', 'Lock must be investigated manually.')).rejects.toMatchObject({ code: 'MAINTENANCE_LOCKED' });
  });
});

const servers: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())); });
async function setup() { const auth = localAuthenticator(randomBytes(32)), operatorToken = randomBytes(32).toString('hex'); const server = await createServer({ auth, operatorToken, store: new LocalTripStore(), fixtures: true, providerDailyLimit: 0, aiDailyLimit: 0, webOrigin: 'http://127.0.0.1:5173' }); servers.push(server); return { server, operatorToken, token: auth.issue!().token }; }
describe('operator diagnostics and private deletion', () => {
  it('requires a separate operator credential and loopback, rejects browser origins', async () => {
    const { server, operatorToken, token } = await setup();
    expect((await server.inject({ url: '/api/ops/status', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(403);
    const headers = { authorization: `Bearer ${operatorToken}` };
    expect((await server.inject({ url: '/api/ops/status', remoteAddress: '10.0.0.1', headers })).statusCode).toBe(403);
    expect((await server.inject({ url: '/api/ops/status', headers: { ...headers, origin: 'http://127.0.0.1:5173' } })).statusCode).toBe(403);
    expect((await server.inject({ url: '/api/ops/status', headers })).statusCode).toBe(200);
    expect((await server.inject({ url: '/api/trips', headers })).statusCode).toBe(401);
  });
  it('reports aggregate templates and attempts without retaining URLs, preferences or credentials', async () => {
    const { server, operatorToken, token } = await setup();
    const headers = { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() };
    const trip = (await server.inject({ method: 'POST', url: '/api/trips', headers, payload: { input: defaultInput(cities[0]) } })).json();
    await server.inject({ url: `/api/trips/${trip.id}?private=precise-location`, headers }); await server.inject('/private-invented-url');
    const response = await server.inject({ url: '/api/ops/status', headers: { authorization: `Bearer ${operatorToken}` } });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json().telemetry.routes).toContainEqual(expect.objectContaining({ route: 'GET /api/trips/:id', requests: 1 }));
    for (const value of [trip.id, trip.ownerId, token, operatorToken, 'precise-location', 'private-invented-url', cities[0].id]) expect(response.body).not.toContain(value);
    expect(response.json().allowances.providers).toMatchObject({ attempts: 0, limit: 0 });
  });
  it('keeps public readiness honest even when local checks are available', async () => {
    const { server } = await setup(); const response = await server.inject('/api/readiness');
    expect(response.json()).toMatchObject({ localPlanning: true, livePlanning: false }); expect(response.json().pending.length).toBeGreaterThan(0);
  });
  it('erases cached private responses and old candidates on deletion while replaying safe deletion results', async () => {
    const { server, token } = await setup(); const headers = { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() };
    const create = { method: 'POST' as const, url: '/api/trips', headers, payload: { input: defaultInput(cities[0]) } };
    const trip = (await server.inject(create)).json();
    const generate = { method: 'POST' as const, url: `/api/trips/${trip.id}/generate`, headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { expectedRevision: 0 } };
    expect((await server.inject(generate)).statusCode).toBe(200);
    const deletion = { method: 'DELETE' as const, url: `/api/trips/${trip.id}`, headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { expectedRevision: 0 } };
    expect((await server.inject(deletion)).json()).toEqual({ deleted: true }); expect((await server.inject(deletion)).statusCode).toBe(200);
    expect((await server.inject(create)).statusCode).toBe(410); expect((await server.inject(generate)).statusCode).toBe(410);
    expect((await server.inject({ url: `/api/trips/${trip.id}`, headers })).statusCode).toBe(404);
  });
  it('erases pending responses for both an original request and a concurrent replay', async () => {
    const guard = new IdempotencyGuard(); let done: (value: unknown) => void = () => {};
    const work = () => new Promise(resolve => { done = resolve; });
    const a = guard.run('owner:POST:/api/trips', 'private-key', {}, work), b = guard.run('owner:POST:/api/trips', 'private-key', {}, work);
    await Promise.resolve(); guard.eraseOwner('owner', 'owner:DELETE:/api/trips/id'); done({ private: 'data' });
    await expect(a).rejects.toMatchObject({ code: 'REQUEST_RESULT_REMOVED' }); await expect(b).rejects.toMatchObject({ code: 'REQUEST_RESULT_REMOVED' });
    await expect(guard.run('owner:POST:/api/trips', 'private-key', {}, work)).rejects.toMatchObject({ code: 'REQUEST_RESULT_REMOVED' });
    expect(JSON.stringify(guard)).not.toContain('data');
  });
  it('bounds telemetry cardinality and isolates returned snapshots', () => {
    const telemetry = new Telemetry(() => timestamp); for (let index = 0; index < 100; index++) telemetry.record('GET', `/registered-${index}`, 200, 200);
    telemetry.record('GET', '/registered-0', 429, 6000); telemetry.record('POST', undefined, 503, Number.NaN);
    const result = telemetry.snapshot(); expect(result.routes.length).toBeLessThanOrEqual(41);
    expect(result.routes.find(row => row.route === 'GET /registered-0')).toMatchObject({ requests: 2, limited: 1, rejected: 1 });
    result.routes[0].latency.under_1s = 999; expect(telemetry.snapshot().routes[0].latency.under_1s).toBe(1);
  });
  it('counts failed calls and resets diagnostics with the UTC day while zero disables all attempts', () => {
    let now = timestamp; const guard = new ProviderGuard(1, () => now); guard.consume(); expect(guard.usage()).toMatchObject({ attempts: 1, remaining: 0 });
    now += 86400000; expect(guard.usage()).toMatchObject({ attempts: 0, remaining: 1 });
    expect(() => new ProviderGuard(0).consume()).toThrow();
  });
});
