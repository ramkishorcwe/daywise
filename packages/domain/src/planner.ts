import { tripInputSchema, dietNames, budgetKeys, type City, type TripInput, type Place, type PlanningResult, type PlanningIssue, type Plan, type Leg, type PlannedStop } from '../../contracts/src';
import { add, multiply, groupBudget, type Range } from './money';
import { zonedTime, minutes } from './time';
import { eligible } from './eligibility';
export { eligible } from './eligibility';

const problem = (code: string, message: string): PlanningIssue => ({ code, message });
export function validateInput(input: TripInput, city: City): PlanningIssue[] {
  const parsed = tripInputSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.map(i => problem('INVALID_INPUT', `${i.path.join('.')}: ${i.message}`));
  const errors: PlanningIssue[] = [];
  if (input.cityId !== city.id) errors.push(problem('UNSUPPORTED_CITY', 'Select an available test city.'));
  if (input.currency !== city.currency) errors.push(problem('CURRENCY_MISMATCH', 'The budget must use the destination’s currency.'));
  if (![input.startAnchorId, input.endAnchorId].every(id => city.anchors.some(a => a.id === id))) errors.push(problem('UNKNOWN_ANCHOR', 'Select starting and return points from this city’s test locations.'));
  const allIds = [...input.mustVisitIds, ...input.excludedPlaceIds];
  if (allIds.some(id => !city.places.some(p => p.id === id))) errors.push(problem('UNKNOWN_PLACE', 'A selected place does not belong to this city.'));
  if (new Set(input.mustVisitIds).size !== input.mustVisitIds.length || new Set(input.excludedPlaceIds).size !== input.excludedPlaceIds.length) errors.push(problem('DUPLICATE_PLACE', 'A place can only be selected once.'));
  if (input.mustVisitIds.some(id => input.excludedPlaceIds.includes(id))) errors.push(problem('CONFLICTING_PLACE', 'A must-visit place is also excluded. Change one of those choices.'));
  try {
    const start = zonedTime(input.date, input.startTime, city.timezone), end = zonedTime(input.date, input.endTime, city.timezone);
    if (end <= start) errors.push(problem('INVALID_WINDOW', 'End time must follow start time on the same local day.'));
  } catch { errors.push(problem('INVALID_LOCAL_TIME', 'This local time is ambiguous or does not exist in the destination’s timezone. Choose a different time.')); }
  return errors;
}
function price(place: Place, input: TripInput): Range | null {
  if (place.category === 'food') return place.foodCost ? multiply(place.foodCost, input.adults + input.childAges.length) : null;
  if (!place.adultCost) return null;
  const children = input.childAges.filter(age => age <= place.childMaxAge).length;
  if (children && !place.childCost) return null;
  return add(multiply(place.adultCost, input.adults + input.childAges.length - children), multiply(place.childCost ?? [0, 0], children));
}
function requiredMeal(input: TripInput): boolean { return input.startTime < '14:30' && input.endTime > '11:30'; }
function cachedClock(input: TripInput, city: City) {
  const values = new Map<string, number>();
  return (time: string) => {
    if (!values.has(time)) values.set(time, zonedTime(input.date, time, city.timezone));
    return values.get(time)!;
  };
}
export interface PlanningContext { completedVisits?: number; mealCompleted?: boolean; mealRequired?: boolean; allowEmptyVisits?: boolean; forcedMealId?: string }
function evaluateOrder(input: TripInput, city: City, order: string[], clock = cachedClock(input, city), context: PlanningContext = {}): PlanningResult {
  if (order.length > 6 || new Set(order).size !== order.length) return { outcome: 'no_plan_found', issues: [problem('INVALID_ORDER', 'Use at most five visits and one meal, without duplicate places.')] };
  const places = order.map(id => city.places.find(p => p.id === id));
  if (places.some(p => !p)) return { outcome: 'needs_information', issues: [problem('UNKNOWN_PLACE', 'An itinerary place is missing from this city’s catalog.')] };
  const ordered = places as Place[];
  if (ordered.filter(place => place.category !== 'food').length > 5) return { outcome: 'no_plan_found', issues: [problem('STOP_LIMIT', 'This release supports up to five visits and one meal.')] };
  if (input.mustVisitIds.some(id => !order.includes(id))) return { outcome: 'no_plan_found', issues: [problem('MUST_VISIT_MISSING', 'A must-visit place is missing. Add it back or change your preference.')] };
  if (ordered.some(p => !eligible(p, input))) return { outcome: 'needs_information', issues: [problem('REQUIREMENT_UNMET', 'A stop conflicts with your exclusions, food evidence, or step-free requirement.')] };
  const meals = ordered.filter(p => p.category === 'food').length;
  const needsMeal = context.mealRequired ?? (!context.mealCompleted && requiredMeal(input));
  if (meals > 1 || (needsMeal && meals !== 1)) return { outcome: 'no_plan_found', issues: [problem('MEAL_REQUIRED', 'Keep one lunch stop when your day overlaps 11:30–14:30.')] };
  if (context.forcedMealId && (context.mealCompleted || meals !== 1 || !ordered.some(place => place.category === 'food' && place.id === context.forcedMealId))) return { outcome: 'no_plan_found', issues: [problem('SELECTED_MEAL_REQUIRED', 'Keep the selected remaining meal; another meal cannot silently replace it.')] };
  if (!context.allowEmptyVisits && !ordered.some(p => p.category !== 'food')) return { outcome: 'no_plan_found', issues: [problem('EMPTY_DAY', 'Add at least one visit to your day.')] };
  const start = clock(input.startTime), end = clock(input.endTime);
  let cursor = start, previous = input.startAnchorId, walking = 0, visits = context.completedVisits ?? 0;
  const stops: PlannedStop[] = [];
  const budget: Plan['budget'] = { tickets: [0, 0], food: [0, 0], transport: [0, 0], parking: [0, 0], other: [...city.miscellaneous], reserve: [0, 0] };
  function leg(fromId: string, toId: string): Leg | null {
    const edge = city.travel[`${fromId}|${toId}`];
    if (!edge) return null;
    return { fromId, toId, ...edge, cost: multiply(city.travelCostPerMinute, edge.durationMinutes) };
  }
  for (const place of ordered) {
    if (!place.opens || !place.closes || !place.lastAdmission) return { outcome: 'needs_information', issues: [problem('HOURS_UNKNOWN', `Opening or last-admission hours for ${place.name} are missing. They have not been assumed.`)] };
    const incoming = leg(previous, place.id);
    if (!incoming) return { outcome: 'needs_information', issues: [problem('ROUTE_UNAVAILABLE', 'A test travel leg is missing. No route has been invented.')] };
    const cost = price(place, input);
    if (!cost) return { outcome: 'needs_information', issues: [problem('COST_UNKNOWN', `The group cost for ${place.name} is unknown. The budget is incomplete.`)] };
    const rawArrival = cursor + minutes(incoming.durationMinutes);
    const arrival = Math.max(rawArrival, clock(place.opens));
    const duration = Math.ceil(place.durationMinutes * (input.pace === 'relaxed' ? 1.15 : input.pace === 'packed' ? 0.9 : 1));
    const departure = arrival + minutes(duration);
    if (arrival > clock(place.lastAdmission) || departure > clock(place.closes)) return { outcome: 'no_plan_found', issues: [problem('CLOSING_TIME', `${place.name} cannot fit its last admission and closing time. Try a different order or replace it.`)] };
    if (place.category === 'food' && needsMeal && (arrival > clock('14:30') || arrival < clock('11:30'))) return { outcome: 'no_plan_found', issues: [problem('LUNCH_TIME', 'Lunch must begin between 11:30 and 14:30 in this fixture.')] };
    walking += incoming.walkingMinutes + place.walkingMinutes;
    budget.transport = add(budget.transport, incoming.cost);
    budget[place.category === 'food' ? 'food' : 'tickets'] = add(budget[place.category === 'food' ? 'food' : 'tickets'], cost);
    budget.parking = add(budget.parking, city.parkingPerVisit);
    stops.push({ id: place.id, placeId: place.id, name: place.name, kind: place.category === 'food' ? 'meal' : 'visit', category: place.category, arrivalMs: arrival, departureMs: departure, durationMinutes: duration, waitMinutes: (arrival - rawArrival) / 60000, cost, reason: place.reason, incomingLeg: incoming, point: place.point });
    cursor = departure; previous = place.id;
    if (place.category !== 'food' && ++visits === 2) {
      const duration = input.pace === 'relaxed' ? 20 : 15;
      stops.push({ id: `${place.id}-rest`, placeId: null, name: 'A little breathing room', kind: 'break', category: 'rest', arrivalMs: cursor, departureMs: cursor + minutes(duration), durationMinutes: duration, waitMinutes: 0, cost: [0, 0], reason: 'A planned rest break after two visits. Facilities at this test stop are not verified.', incomingLeg: { fromId: place.id, toId: place.id, durationMinutes: 0, distanceKm: 0, walkingMinutes: 0, cost: [0, 0] }, point: place.point });
      cursor += minutes(duration);
    }
  }
  const returnLeg = leg(previous, input.endAnchorId);
  if (!returnLeg) return { outcome: 'needs_information', issues: [problem('ROUTE_UNAVAILABLE', 'The return leg is unavailable.')] };
  const finish = cursor + minutes(returnLeg.durationMinutes);
  if (finish > end) return { outcome: 'no_plan_found', issues: [problem('END_TIME', 'This plan, including return travel, exceeds your end time. Remove a stop or extend the day.')] };
  walking += returnLeg.walkingMinutes;
  if (walking > input.maxWalkingMinutes) return { outcome: 'no_plan_found', issues: [problem('WALKING_LIMIT', `The plan requires ${walking} walking minutes, above your ${input.maxWalkingMinutes}-minute limit.`)] };
  budget.transport = add(budget.transport, returnLeg.cost);
  const base = budgetKeys.filter(k => k !== 'reserve').reduce((sum, key) => add(sum, budget[key]), [0, 0] as Range);
  budget.reserve = [Math.ceil(base[0] * input.reservePercent / 100), Math.ceil(base[1] * input.reservePercent / 100)];
  const total = add(base, budget.reserve), limit = groupBudget(input);
  if (total[1] > limit) return { outcome: 'no_plan_found', issues: [problem('BUDGET_EXCEEDED', 'The upper group estimate, including reserve, exceeds your budget. Try fewer paid visits or a larger budget.')] };
  return { outcome: 'feasible', plan: { cityId: city.id, currency: city.currency, timezone: city.timezone, dataMode: 'fixture', order, stops, returnLeg, finishMs: finish, startMs: start, totalWalkingMinutes: walking, budget, total, budgetLimit: limit, catalogVersion: city.catalogVersion, warnings: ['All venues, hours, prices, food evidence and travel legs are fictional test inputs.', 'Car travel and walking connectors are estimated from a test graph. No live routing, traffic or navigation is connected.', 'Accommodation is excluded. Meal costs use the same per-person range for adults and children.'] } };
}
export function scheduleOrder(input: TripInput, city: City, order: string[], context: PlanningContext = {}): PlanningResult {
  const errors = validateInput(input, city);
  if (errors.length) return { outcome: 'needs_information', issues: errors };
  return evaluateOrder(input, city, order, cachedClock(input, city), context);
}
export function generatePlan(input: TripInput, city: City, context: PlanningContext = {}): PlanningResult {
  const errors = validateInput(input, city);
  if (errors.length) return { outcome: 'needs_information', issues: errors };
  const must = city.places.filter(p => input.mustVisitIds.includes(p.id));
  if (must.some(p => !eligible(p, input))) return { outcome: 'needs_information', issues: [problem('MUST_VISIT_CONFLICT', 'A must-visit place conflicts with a strict requirement or its evidence is missing.')] };
  const visits = city.places.filter(p => p.category !== 'food' && eligible(p, input));
  const foods = city.places.filter(p => p.category === 'food' && eligible(p, input) && (!context.forcedMealId || p.id === context.forcedMealId));
  const needsMeal = context.mealRequired ?? (!context.mealCompleted && requiredMeal(input));
  if (needsMeal && !foods.length) return { outcome: 'needs_information', issues: [problem('NO_FOOD_MATCH', `${context.forcedMealId ? 'The selected test meal lacks' : 'No test meal has'} evidence for all your requirements${input.dietaryRules.length ? ` (${input.dietaryRules.map(r => dietNames[r]).join(', ')})` : ''}. Change restrictions only if appropriate; missing evidence is not a match.`)] };
  let best: Plan | null = null, bestScore = -Infinity, attempts = 0;
  const failures = new Map<string, PlanningIssue>();
  const clock = cachedClock(input, city);
  const maxVisits = Math.max(0, (input.pace === 'relaxed' ? 3 : input.pace === 'packed' ? 5 : 4) - (context.completedVisits ?? 0));
  if (must.filter(place => place.category !== 'food').length > maxVisits) return { outcome: 'no_plan_found', issues: [problem('PACE_CONFLICT', `Your ${input.pace} pace allows up to ${maxVisits} visits. Choose a fuller pace or reduce must-visits explicitly.`)] };
  function score(plan: Plan): number {
    return plan.stops.filter(s => s.kind === 'visit').reduce((sum, stop) => sum + 100 + (input.interests.includes(stop.category as TripInput['interests'][number]) ? 30 : 0), 0) - plan.stops.reduce((sum, stop) => sum + stop.incomingLeg.durationMinutes + stop.waitMinutes, 0) - plan.returnLeg.durationMinutes;
  }
  function consider(order: string[]) {
    if (++attempts > 24000) return;
    const result = evaluateOrder(input, city, order, clock, context);
    if (result.outcome === 'feasible') { const value = score(result.plan); if (value > bestScore) { bestScore = value; best = result.plan; } }
    else result.issues.forEach(issue => failures.set(issue.code, issue));
  }
  function visit(sequence: string[], remaining: Place[]) {
    if (attempts >= 24000) return;
    if ((sequence.length || context.allowEmptyVisits) && must.filter(p => p.category !== 'food').every(p => sequence.includes(p.id))) {
      if (needsMeal) {
        for (const food of foods) for (let index = 0; index <= sequence.length; index++) consider([...sequence.slice(0, index), food.id, ...sequence.slice(index)]);
      } else consider(sequence);
    }
    if (sequence.length >= maxVisits) return;
    for (const place of remaining) visit([...sequence, place.id], remaining.filter(p => p.id !== place.id));
  }
  visit([], visits);
  if (best) return { outcome: 'feasible', plan: best };
  const issues = [...failures.values()].slice(0, 4);
  return { outcome: issues.some(i => ['COST_UNKNOWN', 'ROUTE_UNAVAILABLE', 'HOURS_UNKNOWN'].includes(i.code)) ? 'needs_information' : 'no_plan_found', issues: issues.length ? issues : [problem('NO_CANDIDATES', 'No supported visits fit your choices. Review exclusions and requirements.')] };
}
