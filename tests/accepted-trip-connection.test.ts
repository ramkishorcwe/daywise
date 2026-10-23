import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('idb', () => ({ openDB: vi.fn(async () => ({ getAll: async () => [], close: () => {} })) }));
vi.mock('../apps/web/src/location-api', () => ({ connected: vi.fn(async () => {}) }));
vi.mock('../apps/web/src/api', async importOriginal => ({ ...await importOriginal<typeof import('../apps/web/src/api')>(), request: vi.fn(), refreshBackendAuthentication: vi.fn() }));
import { request, refreshBackendAuthentication, HttpError } from '../apps/web/src/api';
import { connected } from '../apps/web/src/location-api';
import { listAcceptedTrips, itineraryFailureMessage } from '../apps/web/src/accepted-trips';
beforeEach(() => { vi.clearAllMocks(); vi.mocked(connected).mockResolvedValue(); vi.mocked(refreshBackendAuthentication).mockResolvedValue(true); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('renews a rejected Firebase token once without changing the private trip owner', async () => {
  vi.mocked(request).mockRejectedValueOnce(new HttpError(401, 'UNAUTHENTICATED', 'Session expired.')).mockResolvedValueOnce({ ids: [] });
  expect((await listAcceptedTrips()).warning).toBe('');
  expect(refreshBackendAuthentication).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(2);
  expect(vi.mocked(request).mock.calls.map(call => call[0])).toEqual(['/itineraries', '/itineraries']);
});
it('does not loop on rejected authorization or retry ownership failures', async () => {
  vi.mocked(request).mockRejectedValue(new HttpError(401, 'UNAUTHENTICATED', 'Sign-in rejected.'));
  expect((await listAcceptedTrips()).warning).toContain('HTTP 401');
  expect(request).toHaveBeenCalledTimes(2);
  expect(refreshBackendAuthentication).toHaveBeenCalledTimes(1);
  vi.clearAllMocks();
  vi.mocked(request).mockRejectedValue(new HttpError(404, 'NOT_FOUND', 'Private itinerary not found.'));
  expect((await listAcceptedTrips()).warning).toContain('HTTP 404');
  expect(request).toHaveBeenCalledTimes(1); expect(refreshBackendAuthentication).not.toHaveBeenCalled();
});
it('allows cold sign-in beyond ten seconds and keeps a bounded thirty-second deadline', async () => {
  vi.useFakeTimers();
  const deadline = vi.spyOn(AbortSignal, 'timeout');
  vi.mocked(connected).mockImplementation(async signal => { await new Promise(resolve => setTimeout(resolve, 12000)); signal?.throwIfAborted(); });
  vi.mocked(request).mockResolvedValue({ ids: [] });
  const listing = listAcceptedTrips(); await vi.advanceTimersByTimeAsync(12001);
  expect((await listing).warning).toBe('');
  expect(vi.mocked(request).mock.calls[0][1]?.signal?.aborted).toBe(false);
  expect(deadline).toHaveBeenCalledWith(30000);
});
it('retains validation fields and request reference from the server response', async () => {
  const api = await vi.importActual<typeof import('../apps/web/src/api')>('../apps/web/src/api');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'INVALID_INPUT', message: 'Invalid fields.', fields: [{ path: 'trip.currency', message: 'Required' }] }, requestId: 'req-validation' }), { status: 400, headers: { 'Content-Type': 'application/json' } })));
  await expect(api.request('/itineraries', {}, false)).rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT', fields: ['trip.currency'], requestId: 'req-validation' });
});
it('shows server validation fields and request reference, distinguishing a stale version', () => {
  const message = itineraryFailureMessage(new HttpError(400, 'INVALID_INPUT', 'Invalid fields.', 'req-example', ['trip.currency', 'trip.adults']));
  expect(message).toContain('trip.currency, trip.adults'); expect(message).toContain('req-example'); expect(message).toContain('HTTP 400');
  expect(itineraryFailureMessage(new HttpError(409, 'STALE_REVISION', 'Newer version.'))).toContain('Open Saved trips');
  expect(itineraryFailureMessage({ code: 'auth/network-request-failed' })).toContain('auth/network-request-failed');
});
