import { z } from 'zod';
import { coordinateSchema } from '../../contracts/src/api';
import { providerPlaceId } from '../../contracts/src/locations';
// Persistent catalog content must be independently collected or explicitly licensed.
// Google enrichment is transient and is never merged into this file.
export const evidenceSchema = z.strictObject({
  sourceUrl: z.url().refine(value => value.startsWith('https://'), 'Use an HTTPS source.'),
  method: z.enum(['official_source', 'direct_confirmation', 'licensed']),
  checkedAt: z.iso.datetime(), validUntil: z.iso.datetime(), rights: z.string().min(5).max(500),
}).refine(value => Date.parse(value.validUntil) > Date.parse(value.checkedAt), 'Evidence expiry must follow its checking date.');
const admissionSchema = z.strictObject({ minimum: z.number().nonnegative(), maximum: z.number().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/), basis: z.enum(['person', 'group']) }).refine(c => c.maximum >= c.minimum, 'Admission range is invalid.');
const publishedHours = z.strictObject({ date: z.iso.date(), windows: z.array(z.strictObject({ opens: z.iso.datetime(), closes: z.iso.datetime() }).refine(w => Date.parse(w.closes) > Date.parse(w.opens), 'Closing must follow opening.')).max(10) });
const locationSchema = z.strictObject({ id: z.string().regex(/^[a-z0-9-]{1,80}$/), name: z.string().min(1).max(160), coordinates: coordinateSchema, evidence: evidenceSchema, googlePlaceId: providerPlaceId.optional(), admission: admissionSchema.optional(), openingHours: publishedHours.optional() });
export const checkedCitySchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,80}$/).refine(id => !id.endsWith('-test'), 'Checked city IDs cannot use the test suffix.'),
  name: z.string().min(1).max(160), country: z.string().min(1).max(80), timezone: z.string().refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }),
  currency: z.string().regex(/^[A-Z]{3}$/), catalogVersion: z.string().min(1).max(80),
  status: z.enum(['staging', 'route_review']), locations: z.array(locationSchema).min(2).max(20),
}).refine(city => new Set(city.locations.map(location => location.id)).size === city.locations.length, 'Location IDs must be unique.');
export const checkedCatalogSchema = z.strictObject({ schemaVersion: z.literal(1), cities: z.array(checkedCitySchema).max(50) }).refine(value => new Set(value.cities.map(city => city.id)).size === value.cities.length, 'City IDs must be unique.');
export type CheckedCity = z.infer<typeof checkedCitySchema>;
export class CheckedCatalog {
  constructor(public cities: CheckedCity[], private clock = () => Date.now()) {}
  available() { return this.cities.filter(city => city.status === 'route_review').map(city => ({ ...city, locations: city.locations.filter(location => Date.parse(location.evidence.checkedAt) <= this.clock() && Date.parse(location.evidence.validUntil) > this.clock()) })).filter(city => city.locations.length >= 2); }
  city(id: string) { return this.available().find(city => city.id === id); }
}
