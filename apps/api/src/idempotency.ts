import { createHash } from 'node:crypto';
import { ApiError } from './errors';

// One-process development guard. Provider responses are explicitly excluded.
// Hosted multi-instance deployment needs the durable shared lease described in Phase C.
export class IdempotencyGuard {
  private entries = new Map<string, { digest: string; expires: number; result: Promise<unknown> | null }>();
  constructor(private clock = () => Date.now()) {}
  cleanup() { const now = this.clock(); for (const [id, entry] of this.entries) if (entry.expires <= now) this.entries.delete(id); }
  eraseOwner(owner: string, exceptScope: string) {
    // Retain a metadata tombstone, release private result references and stop late responses.
    for (const [id, entry] of this.entries) if (id.startsWith(`${owner}:`) && !id.startsWith(`${exceptScope}:`)) entry.result = null;
  }
  async run<T>(scope: string, key: unknown, body: unknown, work: () => Promise<T>): Promise<T> {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw new ApiError(400, 'IDEMPOTENCY_REQUIRED', 'Supply an Idempotency-Key of 8–100 letters, numbers, underscores or hyphens.');
    const now = this.clock(); this.cleanup();
    const id = `${scope}:${key}`, digest = createHash('sha256').update(JSON.stringify(body)).digest('hex'), previous = this.entries.get(id);
    if (previous) {
      if (previous.digest !== digest) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This request key was already used for different input.');
      if (!previous.result) throw new ApiError(410, 'REQUEST_RESULT_REMOVED', 'A private result was removed after trip deletion. Reload before making a new request.');
      const value = await previous.result as T;
      if (!previous.result) throw new ApiError(410, 'REQUEST_RESULT_REMOVED', 'This result was removed after trip deletion. Reload before making a new request.');
      return value;
    }
    if (this.entries.size >= 1000) throw new ApiError(429, 'BUSY', 'The local request guard is full. Retry later.');
    const result = Promise.resolve().then(work), entry = { digest, expires: now + 24 * 60 * 60000, result: result as Promise<unknown> | null }; this.entries.set(id, entry);
    try { const value = await result; if (!entry.result) throw new ApiError(410, 'REQUEST_RESULT_REMOVED', 'This result was removed after trip deletion. Reload the latest workspace.'); return value; } catch (error) { if (entry.result) this.entries.delete(id); throw error; }
  }
}
