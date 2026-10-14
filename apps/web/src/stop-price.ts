import type { GuidePlan } from '../../../packages/contracts/src/guide';
import { priceRange } from './trip-price';
import { roundedPrice } from '../../../packages/domain/src/travel-pricing';

export function mapStopPrice(detail: GuidePlan['stops'][number], people?: number) {
  if (!detail.cost && !detail.mealCost && !detail.facts.mealCost) return;
  return stopPriceLines(detail, people).find(line => line.startsWith(detail.mealKind ? 'Food per person:' : 'Admission:'));
}

export function stopPriceLines(detail: GuidePlan['stops'][number], people?: number) {
  const lines: string[] = [], cost = detail.cost;
  if (cost) {
    const provenance = cost.source === 'user_estimate' ? 'your estimate' : cost.source === 'reviewed_catalog' ? 'official published ticket' : 'published planning estimate';
    lines.push(`${detail.mealKind ? 'Entry/cover charge' : 'Admission'}: ${priceRange(cost.minimum, cost.maximum, cost.currency)} per ${cost.basis} · ${provenance}.`);
    if (cost.tariff) lines.push(`Standard adult tariffs: Indian INR ${cost.tariff.indianAdult}; foreign INR ${cost.tariff.foreignAdult}. Using ${cost.tariff.category ?? 'unconfirmed'} visitor category${cost.tariff.suggestedByCurrency ? ' (suggested from currency)' : ''}.`);
    if (detail.groupCost) lines.push(`Admission for your group: ${priceRange(detail.groupCost.minimum, detail.groupCost.maximum, detail.groupCost.currency)}${cost.childRate ? `; published child rate applies below age ${cost.childRate.belowAge}` : ''}.`);
    if (cost.note) lines.push(cost.note);
    if (cost.exchange) lines.push(`Converted from ${cost.original?.currency ?? 'INR'} using the ${cost.exchange.date} reference rate; rounded upward for planning.`);
  } else lines.push(`${detail.mealKind ? 'Entry/cover charge' : 'Admission'}: unknown; not assumed free.`);
  if (detail.mealKind) {
    const meal = detail.mealCost ?? detail.facts.mealCost;
    if (meal) {
      const divisor = meal.basis === 'group' ? people : 1;
      if (divisor) {
        const low = meal.minimum / divisor, high = meal.maximum / divisor;
        lines.push(`Food per person: ${priceRange(low, high, meal.currency)} · approx. ${new Intl.NumberFormat('en', { style: 'currency', currency: meal.currency, maximumFractionDigits: 0 }).format(roundedPrice((low + high) / 2, meal.currency))} midpoint allowance.`);
      }
      if (people || meal.basis === 'group') lines.push(`Food for your group: ${priceRange(meal.minimum * (meal.basis === 'person' ? people! : 1), meal.maximum * (meal.basis === 'person' ? people! : 1), meal.currency)}.`);
      lines.push(meal.source === 'user_estimate' ? 'Your group meal estimate overrides the automatic allowance.' : meal.note ?? 'Approximate meal allowance, not a menu quote or measured average.');
    } else lines.push('Food price unknown; no automatic estimate available for this restaurant.');
  }
  return lines;
}
