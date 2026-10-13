import { dietNames, dietRules, planSchema, type City, type EvidenceStatus, type Plan, type PlanningResult, type TripInput } from '../../contracts/src';
import { multiply, type Range } from './money';
import { scheduleOrder, validateInput } from './planner';
import { sameValue } from './versioning';

export interface FoodOption {
  placeId: string; selected: boolean; cost: Range | null;
  rules: Array<{ rule: typeof dietRules[number]; status: EvidenceStatus; required: boolean }>;
  result: PlanningResult;
}
// Replace only the meal in the supplied draft order. Never relax a requirement or
// remove a visit to make an alternative fit, and never use evidence as real facts.
export function compareFood(input: TripInput, city: City, baseline: Plan | null): FoodOption[] {
  const inputIssues = validateInput(input, city);
  const validPlan = baseline && planSchema.safeParse(baseline).success && baseline.cityId === city.id && baseline.currency === city.currency && baseline.timezone === city.timezone && baseline.catalogVersion === city.catalogVersion && sameValue(baseline.order, baseline.stops.filter(stop => stop.kind !== 'break').map(stop => stop.placeId));
  const meals = validPlan ? baseline.stops.filter(stop => stop.kind === 'meal') : [];
  return city.places.filter(place => place.category === 'food').map(place => {
    const rules = dietRules.map(rule => ({ rule, status: place.dietary[rule] ?? 'unknown', required: input.dietaryRules.includes(rule) }));
    const issues = [...inputIssues];
    for (const rule of rules.filter(rule => rule.required && rule.status !== 'supported')) issues.push({ code: 'FOOD_EVIDENCE', message: `${dietNames[rule.rule]}: ${rule.status === 'unknown' ? 'evidence is unknown' : 'not supported'} in the fixture. Missing evidence cannot satisfy a strict rule.` });
    if (input.excludedPlaceIds.includes(place.id)) issues.push({ code: 'EXCLUDED_MEAL', message: 'This meal is excluded in your preferences.' });
    if (input.stepFree && place.stepFree !== 'supported') issues.push({ code: 'MEAL_ACCESS', message: 'This meal lacks supported step-free fixture evidence.' });
    if (input.childAges.length && !place.childFriendly) issues.push({ code: 'MEAL_CHILDREN', message: 'This meal does not meet the fixture child-friendly requirement.' });
    if (place.hiddenGem && !input.includeHiddenGems && !input.mustVisitIds.includes(place.id)) issues.push({ code: 'MEAL_HIDDEN', message: 'Hidden gems are disabled in your preferences.' });
    if (!validPlan || meals.length !== 1) issues.push({ code: 'MEAL_DRAFT_REQUIRED', message: 'Build a current feasible draft with one meal to compare replacements. Saved or unavailable schedules are not recalculated here.' });
    const result: PlanningResult = issues.length ? { outcome: 'needs_information', issues } : scheduleOrder(input, city, baseline!.order.map(id => id === meals[0].placeId ? place.id : id));
    return { placeId: place.id, selected: meals[0]?.placeId === place.id, rules, cost: place.foodCost && !inputIssues.length ? multiply(place.foodCost, input.adults + input.childAges.length) : null, result };
  });
}
