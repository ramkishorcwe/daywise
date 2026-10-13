import type { City, ConfirmedPlan, Plan, PlanningResult, TripInput } from '../../contracts/src';
import { budgetKeys, planSchema } from '../../contracts/src';
import type { TripProgress } from '../../contracts/src/assistant';
import { generatePlan, scheduleOrder } from './planner';
import { add, groupBudget, type Range } from './money';
import { formatTime } from './time-format';
import { zonedTime } from './time';

export const initialProgress = (confirmed: ConfirmedPlan): TripProgress => ({ revision: 0, completedCount: 0, readyAt: new Date(confirmed.plan.startMs).toISOString() });
export function progressReadyAt(plan: Plan, completedCount: number, delayMinutes: number): number {
  if (completedCount > plan.stops.length) throw new Error('Progress exceeds the plan.');
  return (completedCount ? plan.stops[completedCount - 1].departureMs : plan.startMs) + delayMinutes * 60000;
}
export function replan(input: TripInput, city: City, baseline: Plan, progress: TripProgress, keepOrder = false, replacementMealId?: string): PlanningResult {
  const completed = baseline.stops.slice(0, progress.completedCount), ready = Date.parse(progress.readyAt);
  const lower = completed.length ? completed[completed.length - 1].departureMs : baseline.startMs;
  const end = zonedTime(input.date, input.endTime, city.timezone);
  if (!Number.isFinite(ready) || ready < lower || ready >= end) return { outcome: 'no_plan_found', issues: [{ code: 'PROGRESS_WINDOW', message: 'The reported departure cannot fit the remaining day. Your confirmed plan is preserved.' }] };
  const completedIds = completed.flatMap(stop => stop.placeId ? [stop.placeId] : []), completedVisits = completed.filter(stop => stop.kind === 'visit').length;
  const last = completed.at(-1), anchorId = last ? last.placeId ?? last.incomingLeg.toId : input.startAnchorId;
  const spent: Plan['budget'] = { tickets: [0, 0], food: [0, 0], transport: [0, 0], parking: [0, 0], other: completed.length ? baseline.budget.other : [0, 0], reserve: [0, 0] };
  let walking = 0;
  for (const stop of completed) {
    if (stop.kind !== 'break') { spent[stop.kind === 'meal' ? 'food' : 'tickets'] = add(spent[stop.kind === 'meal' ? 'food' : 'tickets'], stop.cost); spent.parking = add(spent.parking, city.parkingPerVisit); walking += city.places.find(place => place.id === stop.placeId)?.walkingMinutes ?? 0; }
    spent.transport = add(spent.transport, stop.incomingLeg.cost); walking += stop.incomingLeg.walkingMinutes;
  }
  const spentBase = budgetKeys.filter(key => key !== 'reserve').reduce((sum, key) => add(sum, spent[key]), [0, 0] as Range);
  const available = groupBudget(input) - spentBase[1] - Math.ceil(spentBase[1] * input.reservePercent / 100);
  if (available < 0 || walking > input.maxWalkingMinutes) return { outcome: 'no_plan_found', issues: [{ code: 'PAST_COST_LIMIT', message: 'The retained completed stops exceed the requested budget or walking limit. No completed stop was removed.' }] };
  const runtimeCity: City = { ...city, miscellaneous: completed.length ? [0, 0] : city.miscellaneous, anchors: city.anchors.some(anchor => anchor.id === anchorId) ? city.anchors : [...city.anchors, { id: anchorId, name: last!.name, point: last!.point }] };
  const pendingRest = baseline.stops[progress.completedCount]?.kind === 'break' ? baseline.stops[progress.completedCount] : null;
  const restDuration = input.pace === 'relaxed' ? 20 : 15;
  const rest = pendingRest ? { ...pendingRest, arrivalMs: ready, departureMs: ready + restDuration * 60000, durationMinutes: restDuration, waitMinutes: 0 } : null;
  const remainingInput: TripInput = { ...input, startTime: formatTime(rest?.departureMs ?? ready, city.timezone), startAnchorId: anchorId, budgetMinor: available, budgetBasis: 'group', maxWalkingMinutes: input.maxWalkingMinutes - walking, mustVisitIds: input.mustVisitIds.filter(id => !completedIds.includes(id)), excludedPlaceIds: [...new Set([...input.excludedPlaceIds, ...completedIds])] };
  const mealCompleted = completed.some(stop => stop.kind === 'meal');
  const pendingMeal = baseline.stops.slice(progress.completedCount).find(stop => stop.kind === 'meal');
  if (replacementMealId && (mealCompleted || !pendingMeal || !city.places.some(place => place.id === replacementMealId && place.category === 'food'))) return { outcome: 'needs_information', issues: [{ code: 'MEAL_REPLACEMENT', message: 'Only a known meal still ahead of reported progress can be replaced.' }] };
  const context = { completedVisits, mealCompleted, mealRequired: baseline.stops.some(stop => stop.kind === 'meal') && !mealCompleted, allowEmptyVisits: completedVisits > 0, forcedMealId: replacementMealId };
  const remainingOrder = baseline.order.filter(id => !completedIds.includes(id) && !input.excludedPlaceIds.includes(id)).map(id => replacementMealId && id === pendingMeal?.placeId ? replacementMealId : id);
  const result = keepOrder ? scheduleOrder(remainingInput, runtimeCity, remainingOrder, context) : generatePlan(remainingInput, runtimeCity, context);
  if (result.outcome !== 'feasible') return result;
  const budget = Object.fromEntries(budgetKeys.map(key => [key, add(spent[key], result.plan.budget[key])])) as Plan['budget'];
  const base = budgetKeys.filter(key => key !== 'reserve').reduce((sum, key) => add(sum, budget[key]), [0, 0] as Range);
  budget.reserve = [Math.ceil(base[0] * input.reservePercent / 100), Math.ceil(base[1] * input.reservePercent / 100)];
  const total = add(base, budget.reserve);
  return { outcome: 'feasible', plan: planSchema.parse({ ...result.plan, startMs: baseline.startMs, order: [...completedIds, ...result.plan.order], stops: [...completed, ...(rest ? [rest] : []), ...result.plan.stops], totalWalkingMinutes: walking + result.plan.totalWalkingMinutes, budget, total, budgetLimit: groupBudget(input), warnings: [...baseline.warnings, 'Completed stop times and projected costs are retained. User-reported delay is applied once; no live disruption was inferred.'] }) };
}
