import { openDB } from 'idb';
import { localTripSchema, type LocalTrip } from './live-session';

// Only accepted copies enter this library. Form edits stay in component state.
export function acceptedTripCopy(value: LocalTrip): LocalTrip | null {
  if (!value.accepted || !value.acceptedId) return null;
  const t = value.accepted;
  const sameReturn = t.start.id === t.end.id;
  return localTripSchema.parse({ ...value, destination: t.destination, start: t.start, end: sameReturn ? null : t.end, sameReturn,
    stops: t.stops.map((stop, i) => ({ key: value.stops[i]?.key ?? crypto.randomUUID(), location: stop.location, durationMinutes: stop.durationMinutes })),
    date: new Intl.DateTimeFormat('en-CA', { timeZone: t.destination.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t.route.departureTime)),
    startTime: new Intl.DateTimeFormat('en-GB', { timeZone: t.destination.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t.route.departureTime)),
    endTime: new Intl.DateTimeFormat('en-GB', { timeZone: t.destination.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t.deadlineAt)),
    preview: t, guideReview: value.acceptedGuide, priceAllowances: value.acceptedPriceAllowances, view: 'day',
  });
}
const database = () => openDB('daywise-accepted-trips', 1, { upgrade(db) { db.createObjectStore('trips', { keyPath: 'acceptedId' }); } });
function checked(value: LocalTrip) {
  const trip = acceptedTripCopy(value);
  if (!trip) throw new Error('Accept an itinerary before saving it.');
  return localTripSchema.parse(JSON.parse(JSON.stringify(trip, (key, item) => key === 'receipt' ? undefined : item)));
}
export async function saveAcceptedTrip(value: LocalTrip) { const trip = checked(value), db = await database(); try { await db.put('trips', trip); } finally { db.close(); } }
export async function updateAcceptedTrip(value: LocalTrip) {
  const trip = checked(value), db = await database();
  try { const tx = db.transaction('trips', 'readwrite'); if (await tx.store.get(trip.acceptedId!)) await tx.store.put(trip); await tx.done; } finally { db.close(); }
}
export async function listAcceptedTrips() {
  const db = await database();
  try { const rows = (await db.getAll('trips')).map(row => localTripSchema.safeParse(row)); return { trips: rows.flatMap(row => row.success && row.data.accepted && row.data.acceptedId ? [row.data] : []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), skipped: rows.filter(row => !row.success || !row.data.accepted || !row.data.acceptedId).length }; } finally { db.close(); }
}
export async function deleteAcceptedTrip(id: string) { const db = await database(); try { await db.delete('trips', id); } finally { db.close(); } }
