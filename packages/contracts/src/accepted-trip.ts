import { z } from 'zod';
import { locationSchema, liveItinerarySchema } from './locations';
import { guidePlanSchema, savedGuideSchema } from './guide';
import { liveExpenseSchema } from './live-expenses';
import { liveProgressSchema } from './live-progress';
import { priceAllowancesSchema } from './price-allowances';

export const localTripSchema = z.strictObject({
  version: z.literal(1), updatedAt: z.iso.datetime(), savedDayId: z.string().uuid().optional(),
  destination: locationSchema.nullable(), start: locationSchema.nullable(), end: locationSchema.nullable(),
  destinationMode: z.enum(['starting_city', 'custom']).optional(),
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
export const acceptedTripSchema = localTripSchema.refine(t => !!t.accepted && !!t.acceptedId, 'Accept an itinerary before saving it.');
export const tripReferenceSchema = z.strictObject({ version: z.literal(2), acceptedId: z.string().uuid().nullable(), ids: z.array(z.string().uuid()).max(100), pendingIds: z.array(z.string().uuid()).max(100) }).refine(v => new Set(v.ids).size === v.ids.length && (!v.acceptedId || v.ids.includes(v.acceptedId)) && v.pendingIds.every(id => v.ids.includes(id)), 'Invalid saved itinerary references.');
export type TripReferences = z.infer<typeof tripReferenceSchema>;
