import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../apps/api/src/server';
import { LocalTripStore } from '../apps/api/src/store';
import { LocalAcceptedItineraries } from '../apps/api/src/accepted-itineraries';
import { localTripSchema, type LocalTrip } from '../packages/contracts/src/accepted-trip';
import { writeAcceptedReference, readTripReferences, markAcceptedSynced, forgetAcceptedReference, localTripKey } from '../apps/web/src/live-session';

function trip(): LocalTrip {
  const now = new Date().toISOString(), id = randomUUID();
  const location = (name: string) => ({ id: randomUUID(), name, address: `${name} address`, placeId: `provider-${name}`, provider: 'google', source: 'search', coordinates: { latitude: 51.5, longitude: 0 }, city: { placeId: 'provider-city', name: 'City', countryCode: 'GB' }, timezone: 'UTC', types: ['lodging'], fetchedAt: now, expiresAt: now, persistence: 'memory_only', receipt: 'A'.repeat(45) });
  const start = location('start'), destination = location('city'), visit = location('visit');
  const accepted = { destination, start, end: start, stops: [{ location: visit, durationMinutes: 60, arrivalAt: now, departureAt: now }], route: { provider: 'google_routes', mode: 'DRIVE', encodedPolyline: 'test-only-polyline', optimizedOrder: [0], durationSeconds: 1200, distanceMeters: 4000, departureTime: now, fetchedAt: now, expiresAt: now, persistence: 'memory_only', trafficBasis: 'prediction_for_departure', legs: [{ durationSeconds: 600, distanceMeters: 2000 }, { durationSeconds: 600, distanceMeters: 2000 }] }, finishAt: now, deadlineAt: now, withinTime: true, warnings: [] };
  return localTripSchema.parse({ version: 1, updatedAt: now, destination, start, end: null, sameReturn: true, outsideConsent: false, stops: [{ key: randomUUID(), location: visit, durationMinutes: 60 }], date: now.slice(0, 10), startTime: '09:00', endTime: '18:00', optimize: false, adults: 2, children: [], budget: '', currency: 'GBP', diet: [], title: 'A private accepted trip', preview: accepted, accepted, acceptedId: id, guideReview: null, acceptedGuide: null, view: 'day' });
}
const auth = { mode: 'local' as const, verify: async (token: string) => token };
it('saves multiple accepted trips by ID, strips receipts and enforces ownership on every operation', async () => {
  const store = new LocalAcceptedItineraries(), app = await createServer({ auth, store: new LocalTripStore(), itineraries: store, fixtures: false, webOrigin: 'http://127.0.0.1:5173', rateMax: 1000 });
  try {
    const a = trip(), b = trip();
    const call = (method: 'GET' | 'PUT' | 'DELETE', path: string, user = 'owner-a', payload?: unknown) => app.inject({ method, url: `/api/itineraries${path}`, headers: { authorization: `Bearer ${user}` }, ...(payload ? { payload } : {}) });
    for (const value of [a, b, a]) expect((await call('PUT', `/${value.acceptedId}`, 'owner-a', { trip: value, create: true })).statusCode).toBe(200);
    expect((await call('GET', '')).json().ids.sort()).toEqual([a.acceptedId, b.acceptedId].sort());
    const loaded = (await call('GET', `/${a.acceptedId}`)).json().trip;
    expect(loaded.accepted.start.coordinates).toEqual(a.accepted!.start.coordinates); expect(JSON.stringify(loaded)).not.toContain('A'.repeat(45));
    expect((await call('GET', '', 'other-owner')).json().ids).toEqual([]);
    for (const method of ['GET', 'DELETE', 'PUT'] as const) expect((await call(method, `/${a.acceptedId}`, 'other-owner', method === 'PUT' ? { trip: a, create: true } : undefined)).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/itineraries/${a.acceptedId}` })).statusCode).toBe(401);
    expect((await call('PUT', `/${randomUUID()}`, 'owner-a', { trip: a, create: true })).statusCode).toBe(400);
    expect((await call('PUT', `/${a.acceptedId}`, 'owner-a', { trip: { ...a, accepted: null, acceptedId: null }, create: true })).statusCode).toBe(400);
    expect((await call('DELETE', `/${a.acceptedId}`)).statusCode).toBe(200);
    expect((await call('GET', `/${a.acceptedId}`)).statusCode).toBe(404);
    expect((await call('PUT', `/${a.acceptedId}`, 'owner-a', { trip: a, create: true })).statusCode).toBe(404);
    expect((await call('GET', '')).json().ids).toEqual([b.acceptedId]);
  } finally { await app.close(); }
});
it('persists accepted trips across backend restart, keeps progress and rejects stale updates', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'daywise-accepted-')), 'trips.json'), first = new LocalAcceptedItineraries(path), value = trip();
  await first.initialize(); await first.save('owner', value, true);
  const next = { ...value, updatedAt: new Date(Date.parse(value.updatedAt) + 1000).toISOString(), progress: { acceptedId: value.acceptedId!, completedPlaceIds: ['visit'], reportedAt: value.updatedAt } };
  await first.save('owner', next, false);
  await expect(first.save('owner', value, false)).rejects.toMatchObject({ status: 409 });
  const second = new LocalAcceptedItineraries(path); await second.initialize(); expect((await second.get('owner', value.acceptedId!)).progress).toEqual(next.progress);
  expect(await readFile(path, 'utf8')).not.toContain('A'.repeat(45));
  await second.delete('owner', value.acceptedId!); expect(await second.list('owner')).toEqual([]);
  await expect(second.save('owner', next, false)).rejects.toMatchObject({ status: 404 });
});
it('stores IDs only locally and removes one reference without deleting other itineraries or settings', () => {
  const rows = new Map<string, string>(), storage = { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); }, removeItem: (key: string) => { rows.delete(key); } };
  const a = randomUUID(), b = randomUUID(); storage.setItem('other-setting', 'keep');
  writeAcceptedReference(storage, a, true); writeAcceptedReference(storage, b, true); markAcceptedSynced(storage, b);
  expect(readTripReferences(storage)).toEqual({ version: 2, acceptedId: b, ids: [a, b], pendingIds: [a] });
  expect(Object.keys(JSON.parse(storage.getItem(localTripKey)!)).sort()).toEqual(['acceptedId', 'ids', 'pendingIds', 'version']);
  forgetAcceptedReference(storage, a); expect(readTripReferences(storage).ids).toEqual([b]);
  forgetAcceptedReference(storage, b); expect(storage.getItem(localTripKey)).toBeNull(); expect(storage.getItem('other-setting')).toBe('keep');
});
it('one owner exhausting saves does not rate-limit another owner on the same network', async () => {
  const app = await createServer({ auth, store: new LocalTripStore(), itineraries: new LocalAcceptedItineraries(), fixtures: false, webOrigin: 'http://127.0.0.1:5173', rateMax: 1000 });
  try {
    const a = trip(), b = trip();
    for (let i = 0; i < 21; i++) {
      const response = await app.inject({ method: 'PUT', url: `/api/itineraries/${a.acceptedId}`, headers: { authorization: 'Bearer owner-a' }, payload: { trip: a, create: true } });
      expect(response.statusCode).toBe(i < 20 ? 200 : 429);
    }
    const other = await app.inject({ method: 'PUT', url: `/api/itineraries/${b.acceptedId}`, headers: { authorization: 'Bearer owner-b' }, payload: { trip: b, create: true } });
    expect(other.statusCode).toBe(200);
  } finally { await app.close(); }
});
