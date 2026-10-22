import type { GuidePlan } from '../../../packages/contracts/src/guide';
import { priceCategories, priceAllowancesSchema, type PriceAllowances } from '../../../packages/contracts/src/price-allowances';
export { priceCategories, priceAllowancesSchema, type PriceAllowances };
export const priceLabels = { tickets: 'Tickets & activities', food: 'Food & drinks', transport: 'Transport', parking: 'Parking & tolls', other: 'Other expenses' };
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
