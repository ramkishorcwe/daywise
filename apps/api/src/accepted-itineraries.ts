import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Firestore } from 'firebase-admin/firestore';
import { acceptedTripSchema, type LocalTrip } from '../../../packages/contracts/src/accepted-trip';
import { acceptedTripCopy } from '../../../packages/domain/src/accepted-trip';
import { ApiError, missing, stale } from './errors';

type Row = { owner: string; id: string; updatedAt: string; payload: string | null };
export interface AcceptedItineraryStore {
  save(owner: string, value: LocalTrip, create: boolean): Promise<LocalTrip>;
  get(owner: string, id: string): Promise<LocalTrip>;
  list(owner: string): Promise<string[]>;
  delete(owner: string, id: string): Promise<void>;
}
function record(owner: string, value: LocalTrip): Row {
  const copy = acceptedTripCopy(acceptedTripSchema.parse(value))!;
  const payload = JSON.stringify(copy, (key, item) => key === 'receipt' ? undefined : item);
  if (Buffer.byteLength(payload, 'utf8') > 750_000) throw new ApiError(413, 'ITINERARY_TOO_LARGE', 'This itinerary is too large to save.');
  return { owner, id: copy.acceptedId!, updatedAt: copy.updatedAt, payload };
}
function canSave(old: Row | undefined, next: Row, create: boolean) {
  if (old && (old.owner !== next.owner || !old.payload)) throw missing();
  if (!old && !create) throw missing();
  if (old && old.updatedAt > next.updatedAt) throw stale();
}
function decode(row: Row | undefined, owner: string) {
  if (!row?.payload || row.owner !== owner) throw missing();
  return acceptedTripSchema.parse(JSON.parse(row.payload));
}
export class LocalAcceptedItineraries implements AcceptedItineraryStore {
  private rows = new Map<string, Row>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private path?: string) {}
  async initialize() {
    if (!this.path) return;
    try {
      const rows: Row[] = JSON.parse(await readFile(this.path, 'utf8'));
      if (!Array.isArray(rows) || rows.length > 5000) throw new Error('Invalid accepted itinerary database.');
      this.rows = new Map(rows.map(row => { if (row.payload) decode(row, row.owner); return [row.id, row]; }));
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  private write<T>(work: (rows: Map<string, Row>) => T): Promise<T> {
    const action = async () => {
      const next = new Map(this.rows), result = work(next);
      if (this.path) {
        await mkdir(dirname(this.path), { recursive: true });
        const temporary = `${this.path}.${randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify([...next.values()]), { mode: 0o600 });
        await rename(temporary, this.path);
      }
      this.rows = next; return result;
    };
    const result = this.queue.then(action, action); this.queue = result.catch(() => {}); return result;
  }
  async save(owner: string, value: LocalTrip, create: boolean) {
    const row = record(owner, value);
    return this.write(rows => {
      canSave(rows.get(row.id), row, create);
      if (!rows.has(row.id) && [...rows.values()].filter(r => r.owner === owner && r.payload).length >= 100) throw new ApiError(429, 'ITINERARY_CAPACITY', 'Delete an old itinerary before saving more than 100 trips.');
      rows.set(row.id, row); return decode(row, owner);
    });
  }
  async get(owner: string, id: string) { await this.queue; return decode(this.rows.get(id), owner); }
  async list(owner: string) { await this.queue; return [...this.rows.values()].filter(r => r.owner === owner && r.payload).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(r => r.id); }
  async delete(owner: string, id: string) { await this.write(rows => { const row = rows.get(id); if (!row || row.owner !== owner) throw missing(); rows.set(id, { ...row, payload: null }); }); }
}
export class FirestoreAcceptedItineraries implements AcceptedItineraryStore {
  constructor(private db: Firestore) {}
  private rows() { return this.db.collection('daywiseItineraries'); }
  async save(owner: string, value: LocalTrip, create: boolean) {
    const row = record(owner, value), ref = this.rows().doc(row.id);
    await this.db.runTransaction(async tx => {
      const old = (await tx.get(ref)).data() as Row | undefined;
      canSave(old, row, create);
      if (!old) {
        const count = await tx.get(this.rows().where('owner', '==', owner).limit(500));
        if (count.docs.filter(doc => !!doc.data().payload).length >= 100) throw new ApiError(429, 'ITINERARY_CAPACITY', 'Delete an old itinerary before saving more than 100 trips.');
      }
      // JSON avoids Firestore nested-array limits; receipts are excluded from private snapshots.
      tx.set(ref, row);
    });
    return decode(row, owner);
  }
  async get(owner: string, id: string) { return decode((await this.rows().doc(id).get()).data() as Row | undefined, owner); }
  async list(owner: string) {
    const rows = await this.rows().where('owner', '==', owner).limit(500).get();
    return rows.docs.map(doc => doc.data() as Row).filter(row => !!row.payload).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100).map(row => row.id);
  }
  async delete(owner: string, id: string) {
    const ref = this.rows().doc(id);
    await this.db.runTransaction(async tx => {
      const row = (await tx.get(ref)).data() as Row | undefined;
      if (!row || row.owner !== owner) throw missing();
      // ID-only tombstones prevent delayed saves from resurrecting deleted private content.
      tx.set(ref, { ...row, payload: null });
    });
  }
}
