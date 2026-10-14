import { randomBytes } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { sharedTripSchema, type SharedTrip } from '../../../packages/contracts/src/shared-trip';
import { missing } from './errors';

export interface SharedTripStore {
  create(owner: string, trip: SharedTrip): Promise<{ id: string; expiresAt: string }>;
  get(id: string): Promise<{ trip: SharedTrip; expiresAt: string }>;
  delete(owner: string, id: string): Promise<void>;
}
export class FirestoreSharedTrips implements SharedTripStore {
  constructor(private db: Firestore, private clock = () => Date.now()) {}
  async create(owner: string, trip: SharedTrip) {
    const id = randomBytes(32).toString('base64url'), expires = this.clock() + 7 * 86400000;
    const value = sharedTripSchema.parse(trip);
    // Strip undefined optional keys before passing values to Firestore.
    await this.db.collection('daywiseShares').doc(id).create({ owner, trip: JSON.parse(JSON.stringify(value)), expiresAt: new Date(expires) });
    return { id, expiresAt: new Date(expires).toISOString() };
  }
  async get(id: string) {
    const record = await this.db.collection('daywiseShares').doc(id).get(), data = record.data();
    if (!data || data.expiresAt.toMillis() <= this.clock()) throw missing();
    return { trip: sharedTripSchema.parse(data.trip), expiresAt: data.expiresAt.toDate().toISOString() };
  }
  async delete(owner: string, id: string) {
    await this.db.runTransaction(async tx => {
      const ref = this.db.collection('daywiseShares').doc(id), row = (await tx.get(ref)).data();
      if (!row || row.owner !== owner) throw missing();
      tx.delete(ref);
    });
  }
}
