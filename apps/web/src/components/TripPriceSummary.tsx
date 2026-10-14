import { useState } from 'react';
import type { GuidePlan } from '../../../../packages/contracts/src/guide';
import { priceAllowancesSchema, priceCategories, priceLabels, pricePlanKey, priceRange, tripPrice, type PriceAllowances } from '../trip-price';

export default function TripPriceSummary({ plan, allowances, update }: { plan: GuidePlan; allowances?: PriceAllowances; update: (value: PriceAllowances | undefined) => void }) {
  const p = tripPrice(plan, allowances), [error, setError] = useState('');
  return <section className="live-card trip-price" aria-label="Trip price summary"><h2>Trip price summary</h2>
    <p className="trip-price-total" data-testid="trip-price-range">{priceRange(p.minimum, p.maximum, p.currency)}</p>
    <p>For the whole group · {p.partial ? 'partial estimate; unpriced costs remain' : 'estimated range'} · actual prices may vary.</p>
    {plan.budget.breakdown && <p>Per-person trip estimate: <b>{priceRange(p.minimum / plan.budget.breakdown.people, p.maximum / plan.budget.breakdown.people, p.currency)}</b> · averaged across {plan.budget.breakdown.people} travelers.</p>}
    <dl>{plan.budget.breakdown && (['tickets', 'food', 'transport'] as const).map(category => <div key={`included-${category}`}><dt>Included {priceLabels[category].toLowerCase()}</dt><dd>{priceRange(plan.budget.breakdown![category].minimum, plan.budget.breakdown![category].maximum, p.currency)}</dd></div>)}<div><dt>Itinerary estimates already included</dt><dd>{priceRange(plan.budget.groupKnownMinimum, plan.budget.groupKnownMaximum, p.currency)}</dd></div>{priceCategories.map(category => <div key={category}><dt>Additional {priceLabels[category].toLowerCase()}</dt><dd>{p.extra[category] ? priceRange(p.extra[category]!.minimum, p.extra[category]!.maximum, p.currency) : 'Not supplied'}</dd></div>)}</dl>
    {plan.budget.groupLimit !== null && <p>Group budget limit: {p.currency ? new Intl.NumberFormat('en', { style: 'currency', currency: p.currency }).format(plan.budget.groupLimit) : plan.budget.groupLimit}{p.overBudget && <strong> · Estimate exceeds your budget.</strong>}</p>}
    <details><summary>Costs still to confirm</summary><ul>{plan.budget.unknowns.map((text, i) => <li key={i}>{text}</li>)}</ul><p>Additional allowances are your estimates for costs missing from the itinerary. Do not enter amounts already included above. They do not certify current venue prices.</p></details>
    {p.currency ? <details><summary>Add missing cost ranges</summary><form onSubmit={event => {
      event.preventDefault(); setError('');
      const data = new FormData(event.currentTarget), ranges: Record<string, { minimum: number; maximum: number }> = {};
      try {
        for (const category of priceCategories) {
          const min = String(data.get(`${category}-min`) ?? '').trim(), max = String(data.get(`${category}-max`) ?? '').trim();
          if (!min && !max) continue;
          if (!/^\d+(?:\.\d{1,3})?$/.test(min) || !/^\d+(?:\.\d{1,3})?$/.test(max)) throw new Error('Enter both minimum and maximum, or leave both empty.');
          ranges[category] = { minimum: Number(min), maximum: Number(max) };
        }
        const result = priceAllowancesSchema.safeParse({ planKey: pricePlanKey(plan), currency: p.currency, ranges });
        if (!result.success) throw new Error('Each maximum must be at least its minimum, with amounts between zero and one billion.');
        update(result.data);
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'Check the cost ranges.'); }
    }}><p>Whole-group additional allowances in {p.currency}. Leave unknown amounts empty; zero means you explicitly expect no extra cost.</p>{priceCategories.map(category => <fieldset key={category}><legend>{priceLabels[category]}</legend><div className="form-grid"><label>Additional {priceLabels[category].toLowerCase()} minimum<input name={`${category}-min`} inputMode="decimal" defaultValue={p.extra[category]?.minimum ?? ''} /></label><label>Additional {priceLabels[category].toLowerCase()} maximum<input name={`${category}-max`} inputMode="decimal" defaultValue={p.extra[category]?.maximum ?? ''} /></label></div></fieldset>)}<button className="button secondary" type="submit">Apply price ranges</button></form></details> : <p>Select a budget currency in the planner and regenerate to calculate monetary estimates.</p>}
    {!!Object.keys(p.extra).length && <button className="text-button" onClick={() => update(undefined)}>Clear additional allowances</button>}
    {error && <p className="error-box" role="alert">{error}</p>}
  </section>;
}
