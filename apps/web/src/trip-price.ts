import { z } from 'zod';
import type { GuidePlan } from '../../../packages/contracts/src/guide';

export const priceCategories = ['tickets', 'food', 'transport', 'parking', 'other'] as const;
export const priceLabels = { tickets: 'Tickets & activities', food: 'Food & drinks', transport: 'Transport', parking: 'Parking & tolls', other: 'Other expenses' };
const rangeSchema = z.strictObject({ minimum: z.number().finite().nonnegative().max(1e9), maximum: z.number().finite().nonnegative().max(1e9) }).refine(r => r.maximum >= r.minimum, 'Maximum must be at least the minimum.');
export const priceAllowancesSchema = z.strictObject({ planKey: z.string().max(12000), currency: z.string().regex(/^[A-Z]{3}$/), ranges: z.partialRecord(z.enum(priceCategories), rangeSchema) });
export type PriceAllowances = z.infer<typeof priceAllowancesSchema>;
export const pricePlanKey = (plan: GuidePlan) => JSON.stringify([plan.itinerary.route.fetchedAt, plan.itinerary.start.id, plan.itinerary.end.id, plan.stops.map(s => s.locationId), plan.budget]);
export function tripPrice(plan: GuidePlan, allowances?: PriceAllowances) {
  const extra = allowances?.planKey === pricePlanKey(plan) && allowances.currency === plan.budget.currency ? allowances.ranges : {};
  const minimum = plan.budget.groupKnownMinimum + Object.values(extra).reduce((n, r) => n + (r?.minimum ?? 0), 0);
  const maximum = plan.budget.groupKnownMaximum + Object.values(extra).reduce((n, r) => n + (r?.maximum ?? 0), 0);
  return { minimum, maximum, currency: plan.budget.currency, extra, partial: plan.budget.unknowns.length > 0, overBudget: plan.budget.groupLimit !== null && maximum > plan.budget.groupLimit };
}
export function priceRange(minimum: number, maximum: number, currency: string | null) {
  if (!currency) return 'Select a currency to show a price range';
  const f = new Intl.NumberFormat('en', { style: 'currency', currency });
  return `${f.format(minimum)} – ${f.format(maximum)}`;
}
