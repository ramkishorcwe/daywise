import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { ApiError } from './errors';

export interface HostedBudget {
  consume(service: 'provider' | 'ai', limit: number): Promise<void>;
  claim(id: string, digest: string): Promise<void>;
}
// Only counts and request hashes are stored: no routes, addresses or prompts.
export class FirestoreBudget implements HostedBudget {
  constructor(private db: Firestore, private clock = () => Date.now()) {}
  async consume(service: 'provider' | 'ai', limit: number) {
    const day = new Date(this.clock()).toISOString().slice(0, 10);
    const ref = this.db.collection('daywiseUsage').doc(`${day}-${service}`);
    await this.db.runTransaction(async tx => {
      const record = await tx.get(ref), attempts = record.data()?.attempts ?? 0;
      if (!Number.isInteger(attempts) || attempts < 0) throw new Error('Invalid usage counter.');
      if (attempts >= limit) throw new ApiError(429, service === 'ai' ? 'AI_BUDGET_LIMIT' : 'PROVIDER_BUDGET_LIMIT', `The app's ${service === 'ai' ? 'AI' : 'Google Maps'} daily allowance is exhausted (${attempts}/${limit}). It resets at 00:00 UTC. Your saved trip is preserved.`);
      tx.set(ref, { attempts: attempts + 1, utcDay: day, service, expiresAt: new Date(this.clock() + 7 * 86400000) });
    });
  }
  async claim(id: string, digest: string) {
    const ref = this.db.collection('daywiseRequests').doc(createHash('sha256').update(id).digest('hex'));
    await this.db.runTransaction(async tx => {
      const record = await tx.get(ref), data = record.data();
      if (data && data.expiresAt.toMillis() > this.clock()) throw new ApiError(409, data.digest === digest ? 'PROVIDER_REQUEST_FINISHED' : 'IDEMPOTENCY_CONFLICT', 'This provider request was already submitted. Use a fresh request key if you need a new estimate.');
      tx.set(ref, { digest, expiresAt: new Date(this.clock() + 86400000) });
    });
  }
}
