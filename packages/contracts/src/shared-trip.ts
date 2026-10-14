import { z } from 'zod';
import { coordinateSchema, routeEstimateSchema } from './api';
const range = z.strictObject({ minimum: z.number().finite().nonnegative().max(1e9), maximum: z.number().finite().nonnegative().max(1e9) }).refine(r => r.maximum >= r.minimum);
export const sharedPointSchema = z.strictObject({ name: z.string().min(1).max(300), address: z.string().max(1000).nullable(), coordinates: coordinateSchema });
const mapsUrl = z.url().max(2048).refine(s => { const u = new URL(s); return u.protocol === 'https:' && u.hostname === 'www.google.com' && ['/maps/dir/', '/maps/search/'].includes(u.pathname); });
export const sharedTripSchema = z.strictObject({
  schemaVersion: z.literal(1), title: z.string().max(300), city: z.string().min(1).max(300), timezone: z.string().max(100).refine(s => { try { new Intl.DateTimeFormat('en', { timeZone: s }); return true; } catch { return false; } }),
  departureAt: z.iso.datetime(), finishAt: z.iso.datetime(),
  travel: z.strictObject({ meters: z.number().finite().nonnegative(), seconds: z.number().finite().nonnegative(), mode: z.enum(['DRIVE', 'WALK', 'BICYCLE', 'TRANSIT', 'TWO_WHEELER']) }),
  start: sharedPointSchema.optional(), end: sharedPointSchema.optional(), route: routeEstimateSchema.optional(),
  stops: z.array(z.strictObject({ point: sharedPointSchema, arrivalAt: z.iso.datetime(), departureAt: z.iso.datetime(), durationMinutes: z.number().finite().nonnegative().max(480), meal: z.boolean(), priceLines: z.array(z.string().max(1000)).max(12) })).min(1).max(7),
  mapUrl: mapsUrl, mapSections: z.array(mapsUrl).max(4),
  price: z.strictObject({ total: range, currency: z.string().regex(/^[A-Z]{3}$/).nullable(), people: z.number().int().min(1).max(100).optional(), limit: z.number().finite().nonnegative().nullable(), partial: z.boolean(), rows: z.array(z.strictObject({ label: z.string().max(100), ...range.shape }).refine(r => r.maximum >= r.minimum)).max(12), unknowns: z.array(z.string().max(1000)).max(100) }).optional(),
}).superRefine((v, c) => {
  if (!!v.start !== !!v.end || (v.route && !v.start)) c.addIssue({ code: 'custom', message: 'Shared route geometry needs explicitly included endpoints.' });
});
export type SharedTrip = z.infer<typeof sharedTripSchema>;
export const sharedIdSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
