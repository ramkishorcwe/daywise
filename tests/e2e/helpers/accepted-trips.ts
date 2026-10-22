import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
export async function activeAcceptedTrip(page: Page): Promise<any> {
  const read = () => page.evaluate(async () => {
    const raw = JSON.parse(localStorage.getItem('daywise-live-active-v1') ?? 'null');
    if (!raw || raw.version === 1) return raw;
    if (!raw.acceptedId) return null;
    return new Promise<any>((resolve, reject) => { const opening = indexedDB.open('daywise-accepted-trips', 1); opening.onerror = () => reject(opening.error); opening.onsuccess = () => { const db = opening.result; const request = db.transaction('trips').objectStore('trips').get(raw.acceptedId); request.onsuccess = () => { db.close(); resolve(request.result); }; request.onerror = () => { db.close(); reject(request.error); }; }; });
  });
  let trip = await read();
  if (trip === undefined) await expect.poll(async () => { trip = await read(); return !!trip; }).toBe(true);
  return trip;
}
export const savedAcceptedTrips = (page: Page) => page.evaluate(async () => {
  if (!(await indexedDB.databases()).some(db => db.name === 'daywise-accepted-trips')) return [];
  return new Promise<any[]>((resolve, reject) => {
    const opening = indexedDB.open('daywise-accepted-trips', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => { const db = opening.result; if (!db.objectStoreNames.contains('trips')) { db.close(); resolve([]); return; } const read = db.transaction('trips').objectStore('trips').getAll(); read.onerror = () => { db.close(); reject(read.error); }; read.onsuccess = () => { db.close(); resolve(read.result); }; };
  });
});
