import { randomUUID } from 'node:crypto';
import { locationSchema, type LocationData, type SelectedLocation } from '../../../packages/contracts/src/locations';
import { ApiError } from './errors';

// Owner-bound, short-lived provider data. No durable addresses/geometry cache.
export class LocationRegistry {
  private records = new Map<string, { owner: string; location: SelectedLocation }>();
  constructor(private clock = () => Date.now()) {}
  cleanup() { for (const [id, record] of this.records) if (Date.parse(record.location.expiresAt) <= this.clock()) this.records.delete(id); }
  add(owner: string, data: LocationData): SelectedLocation {
    this.cleanup(); if (this.records.size >= 500) throw new ApiError(429, 'LOCATION_CAPACITY', 'The temporary location queue is full. Retry later.');
    const location = locationSchema.parse({ ...data, receiptStatus: 'registered', id: randomUUID(), expiresAt: new Date(this.clock() + 1800000).toISOString(), persistence: 'memory_only' });
    this.records.set(location.id, { owner, location }); return structuredClone(location);
  }
  get(owner: string, id: string): SelectedLocation {
    this.cleanup(); const record = this.records.get(id);
    if (!record || record.owner !== owner) throw new ApiError(409, 'LOCATION_EXPIRED', 'A selected location expired or is unavailable in this session. Select it again; no coordinates were substituted.');
    return structuredClone(record.location);
  }
}
