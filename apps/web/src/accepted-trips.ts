import { openDB } from 'idb';
import { z } from 'zod';
import { acceptedTripSchema } from '../../../packages/contracts/src/accepted-trip';
import { localTripSchema, readLocalTrip, readTripReferences, writeAcceptedReference, markAcceptedSynced, forgetAcceptedReference, type LocalTrip } from './live-session';
import { acceptedTripCopy } from '../../../packages/domain/src/accepted-trip';
import { connected } from './location-api';
import { request, HttpError, refreshBackendAuthentication } from './api';
export { acceptedTripCopy };
export class DeviceSavingError extends Error {}

const database = () => openDB('daywise-accepted-trips', 1, { upgrade(db) { db.createObjectStore('trips', { keyPath: 'acceptedId' }); } });
function checked(value: LocalTrip) {
  const trip = acceptedTripCopy(value);
  if (!trip) throw new Error('Accept an itinerary before saving it.');
  return acceptedTripSchema.parse(JSON.parse(JSON.stringify(trip, (key, item) => key === 'receipt' ? undefined : item)));
}
async function cacheTrip(value: LocalTrip) { const db = await database(); try { await db.put('trips', checked(value)); } finally { db.close(); } }
async function cachedTrip(id: string) { const db = await database(); try { const value = await db.get('trips', id); return value ? acceptedTripSchema.parse(value) : null; } finally { db.close(); } }
async function cachedTrips() {
  const db = await database();
  try { const rows = (await db.getAll('trips')).map(row => localTripSchema.safeParse(row)); return { trips: rows.flatMap(row => row.success && row.data.accepted && row.data.acceptedId ? [row.data] : []), skipped: rows.filter(row => !row.success || !row.data.accepted || !row.data.acceptedId).length }; } finally { db.close(); }
}
export const cachedAcceptedTrips = cachedTrips;
async function remote<T>(path: string, init: RequestInit = {}, timeout = 30000): Promise<T> {
  const signal = AbortSignal.timeout(timeout);
  try {
    await connected(signal);
    try { return await request<T>(path, { ...init, signal }); }
    catch (failure) {
      if (!(failure instanceof HttpError) || failure.status !== 401 || signal.aborted || !await refreshBackendAuthentication()) throw failure;
      return await request<T>(path, { ...init, signal });
    }
  } catch (failure) {
    if (signal.aborted) throw new HttpError(408, 'ITINERARY_TIMEOUT', 'The database connection took too long. Retry saving when your connection is stable.');
    throw failure;
  }
}
export function itineraryFailureMessage(failure: unknown) {
  if (failure instanceof HttpError) {
    const fields = failure.fields.length ? ` Fields: ${failure.fields.slice(0, 3).join(', ')}.` : '';
    const reference = failure.requestId ? ` Request: ${failure.requestId}.` : '';
    const advice = failure.status === 401 ? ' Your sign-in could not be renewed. Keep this tab and browser storage intact and retry.' : failure.status === 409 ? ' A newer saved version exists. Open Saved trips before making further changes.' : '';
    return `${failure.message}${fields}${advice} (${failure.code}, HTTP ${failure.status}).${reference}`;
  }
  const code = failure && typeof failure === 'object' && 'code' in failure ? String(failure.code) : '';
  if (code.startsWith('auth/')) return `Your browser sign-in could not connect (${code}). Check your connection, keep browser storage intact and retry.`;
  return 'The browser could not complete the database connection. Check your connection and retry.';
}
async function prepareAcceptedTrip(value: LocalTrip) {
  try { const trip = checked(value); writeAcceptedReference(localStorage, trip.acceptedId!, true, false); await cacheTrip(trip); return trip; }
  catch { throw new DeviceSavingError('Local saving failed. Your accepted trip is still on screen. Enable browser storage and retry.'); }
}
export async function saveAcceptedTrip(value: LocalTrip) {
  const trip = await prepareAcceptedTrip(value);
  await remote(`/itineraries/${trip.acceptedId}`, { method: 'PUT', body: JSON.stringify({ trip, create: true }) });
  markAcceptedSynced(localStorage, trip.acceptedId!);
}
export async function updateAcceptedTrip(value: LocalTrip) {
  const trip = await prepareAcceptedTrip(value);
  await remote(`/itineraries/${trip.acceptedId}`, { method: 'PUT', body: JSON.stringify({ trip, create: false }) });
  markAcceptedSynced(localStorage, trip.acceptedId!);
}
export async function getAcceptedTrip(id: string) {
  const fallback = await cachedTrip(id);
  // Pending accepted changes must not be overwritten by an older database version.
  if (fallback && readTripReferences(localStorage).pendingIds.includes(id)) return fallback;
  try {
    const result = await remote<{ trip: unknown }>(`/itineraries/${id}`, {}, fallback ? 10000 : 30000);
    const trip = acceptedTripSchema.parse(result.trip); if (trip.acceptedId !== id) throw new Error('The database returned a different itinerary.');
    await cacheTrip(trip); return trip;
  } catch (failure) { if (fallback) return fallback; throw failure; }
}
export async function restoreAcceptedTrip(): Promise<{ trip: LocalTrip | null; error: string }> {
  const legacy = readLocalTrip(localStorage);
  if (legacy.error) return legacy;
  try {
    if (legacy.trip?.accepted && legacy.trip.acceptedId) {
      const trip = checked(legacy.trip); await cacheTrip(trip);
      // Replace the legacy full localStorage record only after its device backup is durable.
      writeAcceptedReference(localStorage, trip.acceptedId!, true);
      return { trip, error: '' };
    }
    const refs = readTripReferences(localStorage);
    return { trip: refs.acceptedId ? await getAcceptedTrip(refs.acceptedId) : null, error: '' };
  } catch { return { trip: null, error: 'Your saved itinerary could not be loaded. Its ID and device backup were preserved. Check your connection and retry.' }; }
}
export async function listAcceptedTrips(onAvailable?: (trips: LocalTrip[]) => void) {
  const local = await cachedTrips(), rows = new Map(local.trips.map(trip => [trip.acceptedId!, trip]));
  const available = () => [...rows.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const failures: unknown[] = [];
  onAvailable?.(available());
  try {
    const result = z.strictObject({ ids: z.array(z.string().uuid()).max(100) }).parse(await remote('/itineraries'));
    // One unavailable record must not hide the remaining owner-checked trips.
    for (let i = 0; i < result.ids.length; i += 3) await Promise.all(result.ids.slice(i, i + 3).map(async id => {
      try { rows.set(id, await getAcceptedTrip(id)); onAvailable?.(available()); }
      catch (failure) { failures.push(failure); }
    }));
    // Migrate already-accepted device records only; a provider preview never enters this library.
    for (const trip of local.trips) if (!result.ids.includes(trip.acceptedId!)) {
      try { writeAcceptedReference(localStorage, trip.acceptedId!, true, false); await saveAcceptedTrip(trip); }
      catch (failure) { failures.push(failure); }
    }
  } catch (failure) { failures.push(failure); }
  const warning = failures.length ? `Some saved trips could not be refreshed. Showing available trips and device backups. ${itineraryFailureMessage(failures[0])} Use Refresh saved days to retry.` : '';
  return { trips: available(), skipped: local.skipped, warning };
}
export async function openAcceptedTrip(id: string) {
  const trip = await getAcceptedTrip(id); await cacheTrip(trip); writeAcceptedReference(localStorage, id); return trip;
}
export async function deleteAcceptedTrip(id: string) {
  // Fail before touching the database if the browser cannot update its references.
  const previous = localStorage.getItem('daywise-live-active-v1');
  forgetAcceptedReference(localStorage, id);
  try { await remote(`/itineraries/${id}`, { method: 'DELETE' }); }
  catch (failure) {
    if (!(failure instanceof HttpError) || failure.status !== 404) {
      if (previous !== null) localStorage.setItem('daywise-live-active-v1', previous);
      throw failure;
    }
  }
  const db = await database(); try { await db.delete('trips', id); } finally { db.close(); }
}
