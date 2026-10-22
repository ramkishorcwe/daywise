import { localTripSchema, tripReferenceSchema, type LocalTrip, type TripReferences } from '../../../packages/contracts/src/accepted-trip';
export { localTripSchema, type LocalTrip };
export const localTripKey = 'daywise-live-active-v1';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function readLocalTrip(storage: Storage): { trip: LocalTrip | null; error: string } {
  try {
    const raw = storage.getItem(localTripKey);
    if (!raw) return { trip: null, error: '' };
    if (raw.length > 4_000_000) throw new Error('oversized');
    const value = JSON.parse(raw);
    if (value?.version === 2) { tripReferenceSchema.parse(value); return { trip: null, error: '' }; }
    return { trip: localTripSchema.parse(value), error: '' };
  } catch { return { trip: null, error: 'The local trip could not be read. Its stored copy has been preserved. Retry or delete the local trip to start fresh.' }; }
}
export function writeLocalTrip(storage: Storage, value: LocalTrip) {
  // Legacy snapshot serializer for import compatibility. New application saves use ID references.
  const raw = JSON.stringify(localTripSchema.parse(value), (key, item) => key === 'receipt' ? undefined : item);
  if (raw.length > 4_000_000) throw new Error('This itinerary is too large for local saving.');
  storage.setItem(localTripKey, raw);
}
export function removeLocalTrip(storage: Storage) { storage.removeItem(localTripKey); }

export function readTripReferences(storage: Storage): TripReferences {
  const raw = storage.getItem(localTripKey);
  if (!raw) return { version: 2, acceptedId: null, ids: [], pendingIds: [] };
  const value = JSON.parse(raw);
  if (value?.version === 2) return tripReferenceSchema.parse(value);
  const legacy = localTripSchema.parse(value);
  return { version: 2, acceptedId: legacy.acceptedId, ids: legacy.acceptedId ? [legacy.acceptedId] : [], pendingIds: legacy.acceptedId ? [legacy.acceptedId] : [] };
}
export function writeAcceptedReference(storage: Storage, id: string, pending = false, activate = true) {
  const previous = readTripReferences(storage), ids = [...new Set([...previous.ids, id])];
  const value = tripReferenceSchema.parse({ version: 2, ids, acceptedId: activate ? id : previous.acceptedId, pendingIds: pending ? [...new Set([...previous.pendingIds, id])] : previous.pendingIds });
  storage.setItem(localTripKey, JSON.stringify(value));
}
export function markAcceptedSynced(storage: Storage, id: string) {
  const refs = readTripReferences(storage);
  if (refs.ids.includes(id)) storage.setItem(localTripKey, JSON.stringify({ ...refs, pendingIds: refs.pendingIds.filter(value => value !== id) }));
}
export function forgetAcceptedReference(storage: Storage, id: string) {
  const refs = readTripReferences(storage), ids = refs.ids.filter(value => value !== id);
  if (!ids.length) { removeLocalTrip(storage); return; }
  storage.setItem(localTripKey, JSON.stringify({ ...refs, ids, acceptedId: refs.acceptedId === id ? ids[0] : refs.acceptedId, pendingIds: refs.pendingIds.filter(value => value !== id) }));
}
