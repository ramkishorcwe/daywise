import type { GuideCandidate, GuidePlanRequest, GuideStop, MealKind, TravelMatrix } from '../../contracts/src/guide';
import type { LiveRoute, SelectedLocation } from '../../contracts/src/locations';
import { budgetFor, scheduleGuide } from './guide-planner';
import { zonedTime } from './time';

export function mealSearchAnchors(order: GuideStop[], candidates: GuideCandidate[], input: GuidePlanRequest, destination: SelectedLocation, legs: LiveRoute['legs'], kind: MealKind) {
  const meal = input.preferences.meals?.[kind];
  if (!meal?.enabled) return [];
  const schedule = scheduleGuide(order, candidates, input, destination, legs);
  if (!schedule) return [];
  const opens = zonedTime(input.date, meal.startTime, destination.timezone!), closes = zonedTime(input.date, meal.endTime, destination.timezone!);
  // Search at up to two preceding visits closest to the requested meal window.
  // A restaurant can wait until the window opens, but must leave time to eat.
  return schedule.rows.filter(r => !r.stop.mealKind && r.departure < closes - meal.durationMinutes * 60000)
    .sort((a, b) => Math.abs(a.departure - opens) - Math.abs(b.departure - opens)).slice(0, 2).map(r => r.candidate);
}

export function chooseMealInsertion(order: GuideStop[], candidates: GuideCandidate[], restaurants: GuideCandidate[], input: GuidePlanRequest, destination: SelectedLocation, matrix: TravelMatrix, kind: MealKind) {
  const preferences = input.preferences, meal = preferences.meals?.[kind];
  if (!meal?.enabled) throw new Error('This meal was not requested.');
  const index = (id: string) => candidates.findIndex(c => c.location.id === id) + 1;
  let best: { order: GuideStop[]; score: number } | undefined;
  for (const restaurant of restaurants) {
    if (order.some(s => candidates.find(c => c.location.id === s.locationId)?.location.placeId === restaurant.location.placeId)) continue;
    for (let gap = 1; gap <= order.length; gap++) {
      const previous = index(order[gap - 1].locationId), next = gap === order.length ? candidates.length + 1 : index(order[gap].locationId), point = index(restaurant.location.id);
      const anchor = order.slice(0, gap).filter(s => !s.mealKind).at(-1);
      const nearby = anchor ? matrix[index(anchor.locationId)]?.[point] : null;
      const direct = matrix[previous]?.[next], incoming = matrix[previous]?.[point], outgoing = matrix[point]?.[next];
      if (!nearby || !direct || !incoming || !outgoing) continue;
      const extraSeconds = Math.max(0, incoming.durationSeconds + outgoing.durationSeconds - direct.durationSeconds);
      const extraMeters = Math.max(0, incoming.distanceMeters + outgoing.distanceMeters - direct.distanceMeters);
      if (nearby.distanceMeters > preferences.meals!.nearbyMeters || extraSeconds > preferences.meals!.maxExtraMinutes * 60 || extraMeters > preferences.meals!.maxExtraMeters) continue;
      const stop: GuideStop = { locationId: restaurant.location.id, durationMinutes: meal.durationMinutes, mustVisit: false, locked: false, preferredTime: null, costEstimate: null, durationSource: 'user', timeBand: 'any', mealKind: kind };
      const trial = [...order.slice(0, gap), stop, ...order.slice(gap)];
      const indices = [0, ...trial.map(s => index(s.locationId)), candidates.length + 1];
      const legs = indices.slice(1).map((to, i) => matrix[indices[i]]?.[to]);
      if (legs.some(l => !l)) continue;
      const schedule = scheduleGuide(trial, candidates, input, destination, legs as LiveRoute['legs']);
      if (!schedule || budgetFor(trial, candidates, preferences, schedule.distance).status === 'over') continue;
      const waiting = schedule.rows.reduce((sum, row) => sum + row.wait, 0);
      // Route overhead takes priority; ratings only break close choices.
      const score = extraSeconds / 60 + extraMeters / 1000 * 5 + incoming.distanceMeters / 1000 + waiting * 0.2 + (restaurant.facts.mealServices?.[kind] === true ? 0 : 3) - (restaurant.facts.rating ?? 0) * 0.05;
      if (!best || score < best.score) best = { order: trial, score };
    }
  }
  if (!best) throw new Error(`No ${kind} restaurant fits the opening hours, nearby and detour limits, food preferences and return deadline. Adjust the meal window or duration, allow a little more detour, remove an optional visit, or turn this meal off.`);
  return best.order;
}

export function validateMealDetours(order: GuideStop[], candidates: GuideCandidate[], matrix: TravelMatrix, input: GuidePlanRequest, route: LiveRoute) {
  return order.map((stop, i) => {
    if (!stop.mealKind) return undefined;
    const previous = candidates.findIndex(c => c.location.id === order[i - 1]?.locationId) + 1;
    const next = i + 1 < order.length ? candidates.findIndex(c => c.location.id === order[i + 1].locationId) + 1 : candidates.length + 1;
    const direct = matrix[previous]?.[next], incoming = route.legs[i], outgoing = route.legs[i + 1], limits = input.preferences.meals!;
    const anchor = order.slice(0, i).filter(s => !s.mealKind).at(-1);
    const anchorIndex = candidates.findIndex(c => c.location.id === anchor?.locationId) + 1;
    const point = candidates.findIndex(c => c.location.id === stop.locationId) + 1;
    const nearby = order[i - 1]?.mealKind ? matrix[anchorIndex]?.[point]?.distanceMeters : incoming?.distanceMeters;
    if (!anchorIndex || nearby === undefined || !previous || !direct || !incoming || !outgoing) throw new Error('The final meal route has incomplete comparison data. Recalculate.');
    const result = { extraMinutes: Math.max(0, incoming.durationSeconds + outgoing.durationSeconds - direct.durationSeconds) / 60, extraMeters: Math.max(0, incoming.distanceMeters + outgoing.distanceMeters - direct.distanceMeters), fromPreviousMeters: nearby };
    if (result.fromPreviousMeters > limits.nearbyMeters || result.extraMinutes > limits.maxExtraMinutes || result.extraMeters > limits.maxExtraMeters) throw new Error('The final Google route exceeds your meal detour limits. Recalculate or adjust those limits.');
    return result;
  });
}
