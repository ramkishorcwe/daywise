import { openDB } from 'idb';
import { z } from 'zod';
import { coordinateSchema } from '../../../packages/contracts/src/api';
import { providerPlaceId, type SelectedLocation } from '../../../packages/contracts/src/locations';
import { liveExpenseSchema } from '../../../packages/contracts/src/live-expenses';
import { liveProgressSchema } from '../../../packages/contracts/src/live-progress';
import { savedGuideSchema } from '../../../packages/contracts/src/guide';

// Persist allowed place IDs and user-owned preferences/points, not Google addresses,
// suggestions, route geometry, city facts or derived traffic schedules.
const referenceSchema = z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('place'), placeId: providerPlaceId }), z.strictObject({ kind: z.literal('coordinate'), coordinates: coordinateSchema })]);
export const savedLiveDaySchema = z.strictObject({
  version: z.literal(1), id: z.string().uuid(), title: z.string().trim().min(1).max(160), updatedAt: z.iso.datetime(),
  destination: providerPlaceId, start: referenceSchema, end: referenceSchema.nullable(), returnToStart: z.boolean(),
  stops: z.array(z.strictObject({ location: referenceSchema, durationMinutes: z.number().int().min(0).max(480) })).min(1).max(7),
  date: z.iso.date(), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), optimize: z.boolean(),
  adults: z.number().int().min(1).max(12), childAges: z.array(z.number().int().min(0).max(17)).max(11), budget: z.string().regex(/^(?:|\d+(?:\.\d{1,3})?)$/).max(30), currency: z.string().regex(/^(?:|[A-Z]{3})$/), dietaryRules: z.array(z.enum(['vegetarian', 'pure_vegetarian', 'vegan', 'no_onion', 'no_garlic', 'no_root_vegetables'])).max(6),
  expenses: liveExpenseSchema.optional(),
  progress: liveProgressSchema.optional(),
  guide: savedGuideSchema.optional(),
}).refine(value => value.adults + value.childAges.length <= 12, 'A group can have at most 12 travelers.').refine(value => value.returnToStart || !!value.end, 'Choose a return location.');
export type SavedLiveDay = z.infer<typeof savedLiveDaySchema>;
export const locationReference = (location: SelectedLocation): SavedLiveDay['start'] => location.source === 'search' && location.placeId ? { kind: 'place', placeId: location.placeId } : { kind: 'coordinate', coordinates: location.coordinates };
const database = () => openDB('daywise-live', 1, { upgrade(db) { db.createObjectStore('days', { keyPath: 'id' }); } });
export async function saveLiveDay(day: SavedLiveDay) { const db = await database(); try { await db.put('days', savedLiveDaySchema.parse(day)); } finally { db.close(); } }
export async function listLiveDays() { const db = await database(); try { const rows = await db.getAll('days'); const validated = rows.map(row => savedLiveDaySchema.safeParse(row)); return { days: validated.flatMap(value => value.success ? [value.data] : []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), skipped: validated.filter(value => !value.success).length }; } finally { db.close(); } }
export async function deleteLiveDay(id: string) { const db = await database(); try { await db.delete('days', id); } finally { db.close(); } }
