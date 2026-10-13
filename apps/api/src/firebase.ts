import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { remoteTripSchema, type RemoteTrip } from '../../../packages/contracts/src/api';
import type { Authenticator } from './auth';
import type { TripStore } from './store';
import { ApiError, missing, stale } from './errors';

export function firebaseAdapters(projectId: string): { auth: Authenticator; store: TripStore } {
  const app = getApps()[0] ?? initializeApp({ projectId, credential: applicationDefault() });
  const auth = getAuth(app);
  return { auth: { mode: 'firebase', async verify(token) { try { return (await auth.verifyIdToken(token, true)).uid; } catch { throw new ApiError(401, 'UNAUTHENTICATED', 'Your session is unavailable. Reconnect and try again.'); } } }, store: new FirestoreTripStore(getFirestore(app)) };
}
export class FirestoreTripStore implements TripStore {
  constructor(private db: Firestore) {}
  private reference(id: string) { return this.db.collection('trips').doc(id); }
  async create(trip: RemoteTrip) { const value = remoteTripSchema.parse(trip); await this.reference(trip.id).create(value); return value; }
  async get(owner: string, id: string) { const record = await this.reference(id).get(); if (!record.exists) throw missing(); const trip = remoteTripSchema.parse(record.data()); if (trip.ownerId !== owner) throw missing(); return trip; }
  async list(owner: string) { const snapshot = await this.db.collection('trips').where('ownerId', '==', owner).orderBy('updatedAt', 'desc').limit(50).get(); return snapshot.docs.map(doc => remoteTripSchema.parse(doc.data())); }
  async change(owner: string, id: string, revision: number, update: (trip: RemoteTrip) => RemoteTrip) {
    return this.db.runTransaction(async transaction => {
      const ref = this.reference(id), snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw missing(); const trip = remoteTripSchema.parse(snapshot.data());
      if (trip.ownerId !== owner) throw missing(); if (trip.revision !== revision) throw stale();
      const next = remoteTripSchema.parse(update(trip));
      if (next.id !== id || next.ownerId !== owner || next.revision !== revision + 1) throw new Error('Repository invariant failed.');
      transaction.set(ref, next); return next;
    });
  }
  async delete(owner: string, id: string, revision: number) {
    await this.db.runTransaction(async transaction => { const ref = this.reference(id), snapshot = await transaction.get(ref); if (!snapshot.exists) throw missing(); const trip = remoteTripSchema.parse(snapshot.data()); if (trip.ownerId !== owner) throw missing(); if (trip.revision !== revision) throw stale(); transaction.delete(ref); });
  }
}
