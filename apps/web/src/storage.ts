import { openDB } from 'idb';
import { sessionSchema, type TripSession } from '../../../packages/contracts/src';
import { sameValue } from '../../../packages/domain/src/versioning';

const db = () => openDB('daywise-m1', 1, { upgrade(database) { database.createObjectStore('sessions', { keyPath: 'id' }); } });
export async function saveSession(session: TripSession): Promise<void> {
  const database = await db();
  try { await database.put('sessions', sessionSchema.parse(session)); } finally { database.close(); }
}
// New copies always insert a separate record. A collision cannot overwrite a day.
export async function addSeparateSession(session: TripSession): Promise<void> {
  const database = await db();
  try { await database.add('sessions', sessionSchema.parse(session)); } finally { database.close(); }
}
// Compare and write in one transaction: a stale local revision cannot replace a
// saved day changed by another panel/tab. Ordinary autosaving remains separate.
export async function commitLocalDay(source: TripSession, next: TripSession): Promise<void> {
  const parsed = sessionSchema.parse(next);
  if (source.id !== parsed.id) throw new Error('Local updates must keep the same day identity.');
  const database = await db(), transaction = database.transaction('sessions', 'readwrite');
  try {
    const saved = await transaction.store.get(source.id);
    const content = (value: TripSession) => ({ ...value, updatedAt: undefined });
    if (!saved) throw new Error('The saved day is missing. Save the current day explicitly before retrying this local update.');
    if (!sameValue(content(saved), content(source))) throw new Error('The saved day changed. Save or reopen the current day before retrying this local update.');
    await transaction.store.put(parsed); await transaction.done;
  } catch (error) { try { transaction.abort(); } catch { /* Already completed/aborted. */ } await transaction.done.catch(() => {}); throw error; }
  finally { database.close(); }
}
export async function listSessions(): Promise<{ sessions: TripSession[]; skipped: number }> {
  const database = await db();
  try {
    const records = await database.getAll('sessions');
    const parsed = records.map(record => sessionSchema.safeParse(record));
    return { sessions: parsed.flatMap(result => result.success ? [result.data] : []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), skipped: parsed.filter(result => !result.success).length };
  } finally { database.close(); }
}
export async function deleteSession(id: string): Promise<void> {
  const database = await db();
  try { await database.delete('sessions', id); } finally { database.close(); }
}
