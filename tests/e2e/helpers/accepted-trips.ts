import type { Page } from '@playwright/test';
export const savedAcceptedTrips = (page: Page) => page.evaluate(async () => {
  if (!(await indexedDB.databases()).some(db => db.name === 'daywise-accepted-trips')) return [];
  return new Promise<any[]>((resolve, reject) => {
    const opening = indexedDB.open('daywise-accepted-trips', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => { const db = opening.result; if (!db.objectStoreNames.contains('trips')) { db.close(); resolve([]); return; } const read = db.transaction('trips').objectStore('trips').getAll(); read.onerror = () => { db.close(); reject(read.error); }; read.onsuccess = () => { db.close(); resolve(read.result); }; };
  });
});
