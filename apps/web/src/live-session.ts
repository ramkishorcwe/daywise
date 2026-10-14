import { z } from 'zod';
import { locationSchema, liveItinerarySchema } from '../../../packages/contracts/src/locations';
import { guidePlanSchema, savedGuideSchema } from '../../../packages/contracts/src/guide';
import { liveExpenseSchema } from '../../../packages/contracts/src/live-expenses';
import { liveProgressSchema } from '../../../packages/contracts/src/live-progress';
import { priceAllowancesSchema } from './trip-price';

export const localTripKey = 'daywise-live-active-v1';
export const localTripSchema = z.strictObject({
  version: z.literal(1), updatedAt: z.iso.datetime(), savedDayId: z.string().uuid().optional(),
  destination: locationSchema.nullable(), start: locationSchema.nullable(), end: locationSchema.nullable(),
  sameReturn: z.boolean(), outsideConsent: z.boolean(), stops: z.array(z.strictObject({ key: z.string().uuid(), location: locationSchema.nullable(), durationMinutes: z.number().int().min(0).max(480) })).min(1).max(7),
  date: z.string().regex(/^(?:|\d{4}-\d{2}-\d{2})$/), startTime: z.string().max(5), endTime: z.string().max(5), optimize: z.boolean(),
  adults: z.number().int().min(1).max(12), children: z.array(z.number().int().min(0).max(17)).max(11), budget: z.string().max(30), currency: z.string().regex(/^(?:|[A-Z]{3})$/), diet: z.array(z.string().max(40)).max(8), title: z.string().max(160),
  preview: liveItinerarySchema.nullable(), accepted: liveItinerarySchema.nullable(), guideReview: guidePlanSchema.nullable(), acceptedGuide: guidePlanSchema.nullable(), guideSaved: savedGuideSchema.optional(), acceptedId: z.string().uuid().nullable(),
  expenses: liveExpenseSchema.optional(), progress: liveProgressSchema.optional(), priceAllowances: priceAllowancesSchema.optional(), acceptedPriceAllowances: priceAllowancesSchema.optional(), view: z.enum(['plan', 'saved', 'budget', 'day']),
}).superRefine((s, ctx) => {
  if (!!s.accepted !== !!s.acceptedId) ctx.addIssue({ code: 'custom', message: 'Accepted itinerary identity is missing.' });
  if (s.acceptedGuide && JSON.stringify(s.acceptedGuide.itinerary) !== JSON.stringify(s.accepted)) ctx.addIssue({ code: 'custom', message: 'Accepted guide does not match the accepted route.' });
});
export type LocalTrip = z.infer<typeof localTripSchema>;
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function readLocalTrip(storage: Storage): { trip: LocalTrip | null; error: string } {
  try {
    const raw = storage.getItem(localTripKey);
    if (!raw) return { trip: null, error: '' };
    if (raw.length > 4_000_000) throw new Error('oversized');
    return { trip: localTripSchema.parse(JSON.parse(raw)), error: '' };
  } catch { return { trip: null, error: 'The local trip could not be read. Its stored copy has been preserved. Retry or delete the local trip to start fresh.' }; }
}
export function writeLocalTrip(storage: Storage, value: LocalTrip) {
  const raw = JSON.stringify(localTripSchema.parse(value));
  if (raw.length > 4_000_000) throw new Error('This itinerary is too large for local saving.');
  storage.setItem(localTripKey, raw);
}
export function removeLocalTrip(storage: Storage) { storage.removeItem(localTripKey); }
