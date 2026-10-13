import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { remoteTripSchema, type RemoteTrip } from '../../../packages/contracts/src/api';
import { missing, stale, ApiError } from './errors';

export interface TripStore {
  create(trip: RemoteTrip): Promise<RemoteTrip>;
  get(owner: string, id: string): Promise<RemoteTrip>;
  list(owner: string): Promise<RemoteTrip[]>;
  change(owner: string, id: string, revision: number, update: (trip: RemoteTrip) => RemoteTrip): Promise<RemoteTrip>;
  delete(owner: string, id: string, revision: number): Promise<void>;
}
// A serialized, atomic-file repository for one loopback development process.
// Firebase transactions replace this adapter for hosted operation.
export class LocalTripStore implements TripStore {
  private trips = new Map<string, RemoteTrip>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private path?: string) {}
  async initialize() {
    if (!this.path) return;
    try {
      const raw = await readFile(this.path, 'utf8');
      if (raw.length > 10_000_000) throw new Error('Local trip file is too large.');
      const rows: unknown = JSON.parse(raw);
      if (!Array.isArray(rows) || rows.length > 1000) throw new Error('Invalid local trip file.');
      this.trips = new Map(rows.map(row => { const trip = remoteTripSchema.parse(row); return [trip.id, trip]; }));
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work); this.queue = next.catch(() => {}); return next;
  }
  private async commit(next: Map<string, RemoteTrip>) {
    if (this.path) {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify([...next.values()]), { mode: 0o600 });
      await rename(temporary, this.path);
    }
    this.trips = next;
  }
  async create(trip: RemoteTrip) {
    return this.exclusive(async () => {
      remoteTripSchema.parse(trip);
      if (this.trips.size >= 1000) throw new ApiError(429, 'LOCAL_CAPACITY', 'Local storage is full. Delete unused trips.');
      if (this.trips.has(trip.id)) throw stale();
      const next = new Map(this.trips); next.set(trip.id, structuredClone(trip)); await this.commit(next); return structuredClone(trip);
    });
  }
  async get(owner: string, id: string) { await this.queue; const trip = this.trips.get(id); if (!trip || trip.ownerId !== owner) throw missing(); return structuredClone(trip); }
  async list(owner: string) { await this.queue; return [...this.trips.values()].filter(trip => trip.ownerId === owner).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 50).map(trip => structuredClone(trip)); }
  async change(owner: string, id: string, revision: number, update: (trip: RemoteTrip) => RemoteTrip) {
    return this.exclusive(async () => {
      const trip = this.trips.get(id); if (!trip || trip.ownerId !== owner) throw missing(); if (trip.revision !== revision) throw stale();
      const updated = remoteTripSchema.parse(update(structuredClone(trip)));
      if (updated.id !== id || updated.ownerId !== owner || updated.revision !== revision + 1) throw new Error('Repository identity/revision invariant failed.');
      const next = new Map(this.trips); next.set(id, updated); await this.commit(next); return structuredClone(updated);
    });
  }
  async delete(owner: string, id: string, revision: number) {
    await this.exclusive(async () => { const trip = this.trips.get(id); if (!trip || trip.ownerId !== owner) throw missing(); if (trip.revision !== revision) throw stale(); const next = new Map(this.trips); next.delete(id); await this.commit(next); });
  }
}
