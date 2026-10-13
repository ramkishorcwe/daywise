import { createHash } from 'node:crypto';
import { ApiError } from './errors';

// Metadata only: route geometry, durations and provider responses never enter this guard.
export class ProviderGuard {
  private records = new Map<string, { digest: string; state: 'pending' | 'finished'; expires: number }>();
  private day = ''; private calls = 0;
  constructor(private dailyLimit = 100, private clock = () => Date.now()) {}
  cleanup() { const now = this.clock(); for (const [id, record] of this.records) if (record.expires <= now) this.records.delete(id); }
  private resetDay() {
    const day = new Date(this.clock()).toISOString().slice(0, 10);
    if (day !== this.day) { this.day = day; this.calls = 0; }
  }
  usage() { this.resetDay(); return { utcDay: this.day, attempts: this.calls, limit: this.dailyLimit, remaining: Math.max(0, this.dailyLimit - this.calls), scope: 'one_process' }; }
  consume() {
    this.resetDay();
    if (this.calls >= this.dailyLimit) throw new ApiError(429, 'PROVIDER_BUDGET_LIMIT', 'The local provider request allowance is exhausted. Try again after the UTC day changes.');
    this.calls++;
  }
  async run<T>(owner: string, key: unknown, body: unknown, work: () => Promise<T>): Promise<T> {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw new ApiError(400, 'IDEMPOTENCY_REQUIRED', 'A valid Idempotency-Key is required for routing.');
    const now = this.clock(); this.cleanup();
    const id = `${owner}:${key}`, digest = createHash('sha256').update(JSON.stringify(body)).digest('hex'), existing = this.records.get(id);
    if (existing) {
      if (existing.digest !== digest) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This request key belongs to different route input.');
      throw new ApiError(409, existing.state === 'pending' ? 'PROVIDER_REQUEST_IN_PROGRESS' : 'PROVIDER_REQUEST_FINISHED', 'This provider request was already submitted. Responses are not cached; request a fresh estimate with a new key if needed.');
    }
    if (this.records.size >= 500) throw new ApiError(429, 'PROVIDER_GUARD_CAPACITY', 'The local provider guard is full. Retry later.');
    this.consume(); const record = { digest, state: 'pending' as 'pending' | 'finished', expires: now + 86400000 }; this.records.set(id, record);
    try { return await work(); } finally { record.state = 'finished'; }
  }
}
