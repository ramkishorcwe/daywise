import { z } from 'zod';
import { progressSchema } from './progress';
import { returnReportSchema } from './return-report';
import { expenseLedgerSchema } from './expenses';
export { expenseCategories, expenseRecordSchema, expenseLedgerSchema, type ExpenseCategory, type ExpenseRecord, type ExpenseLedger } from './expenses';

export const dietRules = ['vegetarian', 'pure_vegetarian', 'vegan', 'no_onion', 'no_garlic', 'no_root_vegetables'] as const;
export type DietRule = typeof dietRules[number];
export type EvidenceStatus = 'supported' | 'unknown' | 'not_supported';
export type Category = 'history' | 'nature' | 'culture' | 'shopping' | 'food';
export const categoryNames: Record<Category, string> = { history: 'History', nature: 'Nature', culture: 'Culture', shopping: 'Shopping', food: 'Food' };
export const dietNames: Record<DietRule, string> = { vegetarian: 'Vegetarian options', pure_vegetarian: 'Pure vegetarian kitchen', vegan: 'Vegan', no_onion: 'No onion', no_garlic: 'No garlic', no_root_vegetables: 'No root vegetables' };
export const tripInputSchema = z.strictObject({
  cityId: z.string().min(1).max(80),
  date: z.iso.date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  startAnchorId: z.string().min(1),
  endAnchorId: z.string().min(1),
  adults: z.number().int().min(1).max(12),
  childAges: z.array(z.number().int().min(0).max(17)).max(11),
  budgetMinor: z.number().int().nonnegative().max(1_000_000_000),
  budgetBasis: z.enum(['group', 'per_person']),
  currency: z.string().length(3),
  reservePercent: z.number().int().min(0).max(30),
  pace: z.enum(['relaxed', 'balanced', 'packed']),
  interests: z.array(z.enum(['history', 'nature', 'culture', 'shopping'])).max(4),
  dietaryRules: z.array(z.enum(dietRules)).max(6),
  stepFree: z.boolean(),
  maxWalkingMinutes: z.number().int().min(0).max(240),
  includeHiddenGems: z.boolean(),
  mustVisitIds: z.array(z.string()).max(5),
  excludedPlaceIds: z.array(z.string()).max(12),
}).refine(i => i.adults + i.childAges.length <= 12, { message: 'This release supports a party of up to 12.', path: ['adults'] });
export type TripInput = z.infer<typeof tripInputSchema>;

export interface Point { x: number; y: number }
export interface Place {
  id: string; name: string; category: Category; description: string; reason: string;
  point: Point; durationMinutes: number; opens: string | null; closes: string | null; lastAdmission: string | null;
  adultCost: [number, number] | null; childCost: [number, number] | null; childMaxAge: number;
  foodCost?: [number, number] | null; dietary: Partial<Record<DietRule, EvidenceStatus>>;
  stepFree: EvidenceStatus; walkingMinutes: number; childFriendly: boolean; hiddenGem: boolean;
}
export interface Anchor { id: string; name: string; point: Point }
export interface TravelEdge { durationMinutes: number; distanceKm: number; walkingMinutes: number }
export interface City {
  id: string; name: string; country: string; timezone: string; currency: string; currencyExponent: number;
  catalogVersion: string; places: Place[]; anchors: Anchor[]; travel: Record<string, TravelEdge>;
  travelCostPerMinute: [number, number]; parkingPerVisit: [number, number]; miscellaneous: [number, number];
}
const rangeSchema = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).refine(v => v[0] <= v[1]);
const legSchema = z.strictObject({ fromId: z.string(), toId: z.string(), durationMinutes: z.number().nonnegative(), distanceKm: z.number().nonnegative(), walkingMinutes: z.number().nonnegative(), cost: rangeSchema });
const stopSchema = z.strictObject({
  id: z.string(), placeId: z.string().nullable(), name: z.string(), kind: z.enum(['visit', 'meal', 'break']),
  category: z.enum(['history', 'nature', 'culture', 'shopping', 'food', 'rest']),
  arrivalMs: z.number(), departureMs: z.number(), durationMinutes: z.number().nonnegative(), waitMinutes: z.number().nonnegative(),
  cost: rangeSchema, reason: z.string(), incomingLeg: legSchema, point: z.strictObject({ x: z.number(), y: z.number() }),
});
export type PlannedStop = z.infer<typeof stopSchema>;
export type Leg = z.infer<typeof legSchema>;
const budgetKeys = ['tickets', 'food', 'transport', 'parking', 'other', 'reserve'] as const;
export type BudgetKey = typeof budgetKeys[number];
export const planSchema = z.strictObject({
  cityId: z.string(), currency: z.string().length(3), timezone: z.string(), dataMode: z.literal('fixture'),
  order: z.array(z.string()).max(6), stops: z.array(stopSchema).max(12), returnLeg: legSchema,
  finishMs: z.number(), startMs: z.number(), totalWalkingMinutes: z.number().nonnegative(),
  budget: z.strictObject({ tickets: rangeSchema, food: rangeSchema, transport: rangeSchema, parking: rangeSchema, other: rangeSchema, reserve: rangeSchema }),
  total: rangeSchema, budgetLimit: z.number().int().nonnegative(), warnings: z.array(z.string()), catalogVersion: z.string(),
}).superRefine((plan, context) => {
  const totals = budgetKeys.reduce((sum, key) => [sum[0] + plan.budget[key][0], sum[1] + plan.budget[key][1]], [0, 0]);
  if (totals[0] !== plan.total[0] || totals[1] !== plan.total[1] || plan.total[1] > plan.budgetLimit) context.addIssue({ code: 'custom', message: 'Saved plan budget is inconsistent.' });
  if (new Set(plan.order).size !== plan.order.length || plan.stops.some(stop => stop.departureMs < stop.arrivalMs || stop.departureMs - stop.arrivalMs !== stop.durationMinutes * 60000) || plan.finishMs < plan.startMs) context.addIssue({ code: 'custom', message: 'Saved plan schedule is inconsistent.' });
});
export type Plan = z.infer<typeof planSchema>;
export interface PlanningIssue { code: string; message: string }
export type PlanningResult = { outcome: 'feasible'; plan: Plan } | { outcome: 'needs_information' | 'no_plan_found'; issues: PlanningIssue[] };
export const confirmedSchema = z.strictObject({ id: z.string(), input: tripInputSchema, plan: planSchema, confirmedAt: z.string() });
export type ConfirmedPlan = z.infer<typeof confirmedSchema>;
export const sessionSchema = z.strictObject({
  schemaVersion: z.literal(1), id: z.string(), title: z.string().max(160), input: tripInputSchema,
  draftOrder: z.array(z.string()).max(6).nullable(), confirmed: confirmedSchema.nullable(), updatedAt: z.string(),
  assistant: z.strictObject({ tripId: z.string().uuid().nullable(), baseId: z.string().uuid(), progress: progressSchema.optional() }).optional(),
  expenses: expenseLedgerSchema.optional(),
  completion: returnReportSchema.optional(),
}).refine(session => !session.confirmed || (session.confirmed.input.cityId === session.input.cityId && session.confirmed.plan.cityId === session.confirmed.input.cityId && session.confirmed.plan.currency === session.confirmed.input.currency), { message: 'Saved confirmed plan does not match its city or currency.' })
  .refine(session => !session.expenses || (session.expenses.cityId === session.input.cityId && session.expenses.currency === session.input.currency && !!session.confirmed), { message: 'Saved expenses must belong to a confirmed day in the same city and currency.' })
  .refine(session => !session.completion || (!!session.confirmed && session.completion.confirmedId === session.confirmed.id && session.assistant?.tripId === null && session.assistant.baseId === session.confirmed.id && !!session.assistant.progress?.revision && session.assistant.progress.completedCount === session.confirmed.plan.stops.length && Date.parse(session.completion.arrivedAt) >= Date.parse(session.assistant.progress.readyAt)), { message: 'A return report must match a fully reported local day and its last departure.' })
  .refine(session => session.assistant?.tripId !== null || (!!session.confirmed && session.assistant.baseId === session.confirmed.id && !!session.assistant.progress?.revision && session.assistant.progress.completedCount <= session.confirmed.plan.stops.length && Date.parse(session.assistant.progress.readyAt) >= (session.assistant.progress.completedCount ? (session.confirmed.plan.stops[session.assistant.progress.completedCount - 1]?.departureMs ?? Infinity) : session.confirmed.plan.startMs)), { message: 'Detached restored progress must match the accepted day.' });
export type TripSession = z.infer<typeof sessionSchema>;
export { budgetKeys };
