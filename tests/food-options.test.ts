import { describe, expect, it } from 'vitest';
import { cities, defaultInput } from '../fixtures/cities';
import type { City, Plan, TripInput } from '../packages/contracts/src';
import { compareFood } from '../packages/domain/src/food-options';
import { generatePlan } from '../packages/domain/src/planner';
import { sameValue } from '../packages/domain/src/versioning';

const city = cities[0], input = () => ({ ...defaultInput(city), date: '2026-10-11' });
function baseline(data: TripInput = input(), catalog: City = city): Plan {
  const result = generatePlan(data, catalog); if (result.outcome !== 'feasible') throw new Error(JSON.stringify(result)); return result.plan;
}
const codes = (result: ReturnType<typeof compareFood>[number]['result']) => result.outcome === 'feasible' ? [] : result.issues.map(issue => issue.code);

describe('meal comparison without relaxed requirements', () => {
  it('replaces only a meal and preserves input, visits, baseline and return constraints', () => {
    const data = input(), plan = baseline(data), saved = structuredClone({ data, plan, city });
    const options = compareFood(data, city, plan); expect(options).toHaveLength(2); expect(options.filter(option => option.selected)).toHaveLength(1);
    for (const option of options) {
      expect(option.result.outcome).toBe('feasible'); if (option.result.outcome !== 'feasible') continue;
      expect(option.result.plan.order.filter(id => city.places.find(place => place.id === id)?.category !== 'food')).toEqual(plan.order.filter(id => city.places.find(place => place.id === id)?.category !== 'food'));
      expect(option.result.plan.stops.filter(stop => stop.kind === 'meal')[0].placeId).toBe(option.placeId);
      expect(option.result.plan.returnLeg.toId).toBe(data.endAnchorId); expect(option.result.plan.total[1]).toBeLessThanOrEqual(option.result.plan.budgetLimit);
    }
    expect(sameValue({ data, plan, city }, saved)).toBe(true);
  });
  it('does not treat unknown or negative dietary evidence as support', () => {
    const data = { ...input(), dietaryRules: ['no_onion', 'vegan'] as TripInput['dietaryRules'] }, catalog = structuredClone(city);
    catalog.places.find(place => place.category === 'food')!.dietary.vegan = 'not_supported';
    const options = compareFood(data, catalog, baseline());
    expect(options.every(option => codes(option.result).includes('FOOD_EVIDENCE'))).toBe(true);
    expect(options[0].rules.find(rule => rule.rule === 'vegan')?.status).toBe('not_supported');
    expect(options[1].rules.find(rule => rule.rule === 'no_onion')?.status).toBe('unknown');
    expect(options[1].rules.find(rule => rule.rule === 'vegetarian')?.required).toBe(false);
  });
  it('cannot remove a required meal or choose an excluded replacement', () => {
    const plan = baseline(), meal = plan.stops.find(stop => stop.kind === 'meal')!.placeId!;
    const alternative = city.places.find(place => place.category === 'food' && place.id !== meal)!;
    expect(codes(compareFood({ ...input(), mustVisitIds: [meal] }, city, plan).find(option => option.placeId === alternative.id)!.result)).toContain('MUST_VISIT_MISSING');
    expect(codes(compareFood({ ...input(), excludedPlaceIds: [alternative.id] }, city, plan).find(option => option.placeId === alternative.id)!.result)).toContain('EXCLUDED_MEAL');
  });
  it('checks hours, costs, routes and walking instead of promising a dietary match will fit', () => {
    const plan = baseline();
    const scenarios = [
      ['CLOSING_TIME', (catalog: City) => { catalog.places.filter(place => place.category === 'food').forEach(place => { place.lastAdmission = '09:00'; }); }],
      ['COST_UNKNOWN', (catalog: City) => { catalog.places.filter(place => place.category === 'food').forEach(place => { delete place.foodCost; }); }],
      ['ROUTE_UNAVAILABLE', (catalog: City) => { catalog.travel = {}; }],
      ['WALKING_LIMIT', (catalog: City) => { catalog.places.filter(place => place.category === 'food').forEach(place => { place.walkingMinutes = 240; }); }],
      ['BUDGET_EXCEEDED', (catalog: City) => { catalog.places.filter(place => place.category === 'food').forEach(place => { place.foodCost = [1_000_000, 1_000_000]; }); }],
    ] as const;
    for (const [code, change] of scenarios) { const catalog = structuredClone(city); change(catalog); expect(compareFood(input(), catalog, plan).every(option => codes(option.result).includes(code))).toBe(true); }
  });
  it('uses whole-party meal prices, destination currency and per-person budget separately', () => {
    const catalog = cities[1], data = { ...defaultInput(catalog), date: '2026-10-11', adults: 1, childAges: [4, 8], budgetBasis: 'per_person' as const };
    for (const option of compareFood(data, catalog, baseline(data, catalog))) {
      const cost = catalog.places.find(place => place.id === option.placeId)!.foodCost!;
      expect(option.cost).toEqual(cost.map(value => value * 3)); expect(option.placeId.startsWith(catalog.id)).toBe(true);
      expect(option.result.outcome).toBe('feasible'); if (option.result.outcome === 'feasible') { expect(option.result.plan.currency).toBe('USD'); expect(option.result.plan.budgetLimit).toBe(data.budgetMinor * 3); }
    }
  });
  it('shows evidence without proposing a replacement for missing, stale or foreign plans', () => {
    const plan = baseline();
    for (const value of [null, { ...plan, catalogVersion: 'fixture-old' }, { ...plan, stops: [] }, baseline(defaultInput(cities[1]), cities[1])]) {
      const options = compareFood(input(), city, value); expect(options.every(option => codes(option.result).includes('MEAL_DRAFT_REQUIRED'))).toBe(true); expect(options[0].rules).toHaveLength(6);
    }
    expect(compareFood({ ...input(), currency: 'USD' }, city, plan).every(option => codes(option.result).includes('CURRENCY_MISMATCH'))).toBe(true);
  });
  it('protects child and mobility requirements and handles empty city food coverage', () => {
    const catalog = structuredClone(city), data = { ...input(), childAges: [4], stepFree: true };
    catalog.places.filter(place => place.category === 'food').forEach(place => { place.childFriendly = false; place.stepFree = 'unknown'; });
    for (const option of compareFood(data, catalog, baseline())) { expect(codes(option.result)).toContain('MEAL_CHILDREN'); expect(codes(option.result)).toContain('MEAL_ACCESS'); }
    catalog.places = catalog.places.filter(place => place.category !== 'food'); expect(compareFood(input(), catalog, null)).toEqual([]);
  });
});
