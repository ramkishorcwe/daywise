import { z } from 'zod';
import { backendConnected, connectBackend, disconnectBackend, HttpError, request } from './api';
import { locationSchema, suggestionsSchema, liveItinerarySchema, type LiveRouteInput } from '../../../packages/contracts/src/locations';
import type { Coordinate } from '../../../packages/contracts/src/api';
import type { LocationPreview } from './location';

let connecting: Promise<unknown> | null = null;
async function connected(signal?: AbortSignal) {
  if (!backendConnected()) {
    if (!connecting) connecting = connectBackend().finally(() => { connecting = null; });
    if (!signal) await connecting;
    else await new Promise<void>((resolve, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(new DOMException('Canceled', 'AbortError')); };
      signal.addEventListener('abort', abort, { once: true });
      connecting!.then(() => { signal.removeEventListener('abort', abort); resolve(); }, failure => { signal.removeEventListener('abort', abort); reject(failure); });
      if (signal.aborted) abort();
    });
  }
  signal?.throwIfAborted();
}
export const postLocation = async (path: string, body: unknown, signal?: AbortSignal) => {
  await connected(signal);
  const send = () => request(path, { method: 'POST', body: JSON.stringify(body), signal, headers: { 'Idempotency-Key': crypto.randomUUID() } });
  try { return await send(); }
  catch (failure) { if (!(failure instanceof HttpError) || failure.status !== 401 || signal?.aborted) throw failure; disconnectBackend(); await connected(signal); return send(); }
};
const post = postLocation;
export const locationConfiguration = async () => z.strictObject({ autocomplete: z.boolean(), reverseGeocode: z.boolean(), timezone: z.boolean(), routing: z.boolean(), festivalSearch: z.boolean().optional(), guideDiscovery: z.boolean().optional(), guideRouting: z.boolean().optional(), guideAssistant: z.enum(['local', 'openai', 'gemini']).optional(), issues: z.array(z.string().max(500)).max(10).optional() }).parse(await request('/locations/config', {}, false));
function validatedLocation(value: unknown) { const parsed = locationSchema.safeParse(value); if (!parsed.success) throw new Error('The provider returned an invalid address or coordinates. Retry or choose another suggestion.'); return parsed.data; }
export const searchLocations = async (input: string, sessionToken: string, citiesOnly: boolean, bias: Coordinate | undefined, signal: AbortSignal) => suggestionsSchema.parse(await post('/locations/autocomplete', { input, sessionToken, citiesOnly, ...(bias ? { bias } : {}) }, signal));
export const selectLocation = async (placeId: string, sessionToken: string, destinationCity: boolean, signal: AbortSignal) => validatedLocation(await post('/locations/resolve', { placeId, sessionToken, destinationCity }, signal));
export const locateCoordinates = async (point: Coordinate, source: 'gps' | 'pin' | 'saved', signal: AbortSignal, gps?: LocationPreview) => validatedLocation(await post('/locations/reverse', { coordinates: point, source, ...(gps ? { accuracyMeters: gps.accuracyMeters, observedAt: new Date(gps.observedAt).toISOString() } : {}) }, signal));
export const generateLiveItinerary = async (input: LiveRouteInput, signal: AbortSignal) => liveItinerarySchema.parse(await post('/plans/live', input, signal));
