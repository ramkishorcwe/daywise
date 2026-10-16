import type { GuideCandidate, GuidePreferences, GuideStop, GuidePlanRequest, TravelMatrix, GuidePlan } from '../../contracts/src/guide';
import type { SelectedLocation, LiveRoute } from '../../contracts/src/locations';
import { liveDeparture } from './live-itinerary';
import { zonedTime } from './time';
import { groupCost, roundedPrice } from './travel-pricing';

// Only provider-confirmed containment establishes a shared complex. Nearby distinct
// attractions are retained; straight-line distance is never a routing fallback.
export function sameAttractionComplex(a: GuideCandidate, b: GuideCandidate) {
  const ap = a.facts.containingPlaceIds ?? [], bp = b.facts.containingPlaceIds ?? [];
  const linked = ap.includes(b.location.placeId ?? '') || bp.includes(a.location.placeId ?? '') || ap.some(id => bp.includes(id));
  if (!linked) return false;
  const rad = Math.PI / 180, x = a.location.coordinates, y = b.location.coordinates;
  const h = Math.sin((x.latitude - y.latitude) * rad / 2) ** 2 + Math.cos(x.latitude * rad) * Math.cos(y.latitude * rad) * Math.sin((x.longitude - y.longitude) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h))) < 1000;
}
export function suggestedVisitMinutes(facts: GuideCandidate['facts'], p: GuidePreferences) {
  const base = facts.categories.includes('museums') || facts.categories.includes('forts') || facts.categories.includes('palaces') ? 90 : facts.categories.includes('food') ? 45 : 60;
  return Math.round(base * (p.pace === 'relaxed' ? 1.25 : p.pace === 'packed' ? 0.75 : 1) + (p.groupType === 'seniors' || p.childAges.length ? 15 : 0));
}
export function matchingGuideInterests(facts: GuideCandidate['facts'], p: GuidePreferences) {
  return p.interests.filter(interest => interest === 'hidden_gems' ? facts.reviews !== null && facts.reviews > 0 && facts.reviews < 300 : facts.categories.includes(interest));
}
export function guidePreferenceIssue(facts: GuideCandidate['facts'], p: GuidePreferences, meal = false): string | null {
  if (!meal && p.interests.length && !matchingGuideInterests(facts, p).length) return 'does not match your selected interests';
  if (!meal && p.environment !== 'any' && facts.environment !== p.environment) return `is not confirmed as ${p.environment}`;
  if (p.mobility === 'wheelchair' && facts.accessible !== true) return 'does not have a confirmed wheelchair-accessible entrance';
  if ((p.groupType === 'family' || p.childAges.length > 0) && facts.goodForChildren === false) return 'is reported unsuitable for children';
  return null;
}
export function candidateScore(candidate: Pick<GuideCandidate, 'facts' | 'location'>, p: GuidePreferences) {
  const f = candidate.facts, matched = matchingGuideInterests(f, p);
  const reasons = [matched.length ? `Matches your ${matched.join(', ').replaceAll('_', ' ')} interests.` : 'A provider-listed option for a first visit.'];
  let score = 15 + matched.length * 8 + (f.rating ?? 0) + Math.min(8, Math.log10((f.reviews ?? 0) + 1) * 2);
  if (f.hours.status === 'date_specific') { score += 3; reasons.push(f.hours.source === 'reviewed_catalog' ? 'Reviewed attraction evidence supplies periods for the travel date.' : 'Google supplies opening periods for the travel date.'); }
  if (f.hours.status === 'unknown') { score -= 3; reasons.push('Opening hours need confirmation.'); }
  if (f.admission?.maximum === 0) { score += 4; reasons.push('Reviewed admission evidence lists no entry charge; other expenses may apply.'); }
  if (p.environment !== 'any' && f.environment === p.environment) { score += 4; reasons.push(`Its provider category suits your ${p.environment} preference.`); }
  if (p.environment !== 'any' && f.environment !== 'unknown' && f.environment !== p.environment) score -= 8;
  if ((p.groupType === 'family' || p.childAges.length > 0) && f.goodForChildren === true) score += 4;
  if (p.interests.includes('hidden_gems') && f.reviews !== null && f.reviews < 300) { score += 3; reasons.push('Lower review volume suggests a less prominent option; uniqueness is unverified.'); }
  if (f.rating !== null) reasons.push(`Google rating ${f.rating}/5${f.reviews === null ? '' : ` from ${f.reviews} reviews`}; popularity is a proxy, not proof of historical importance.`);
  return { score, reasons };
}
export function budgetFor(stops: GuideStop[], candidates: GuideCandidate[], p: GuidePreferences, distanceMeters?: number, reserveMeal = false): GuidePlan['budget'] {
  const people = p.adults + p.childAges.length, unknowns: string[] = [];
  const tickets = { minimum: 0, maximum: 0 }, food = { minimum: 0, maximum: 0 }, transport = { minimum: 0, maximum: 0 };
  const add = (target: typeof tickets, cost: { minimum: number; maximum: number }) => { target.minimum += cost.minimum; target.maximum += cost.maximum; };
  for (const stop of stops) {
    const c = candidates.find(c => c.location.id === stop.locationId)!;
    const cost = stop.costEstimate ? { ...stop.costEstimate, source: 'user_estimate' as const, sourceUrl: null } : c.facts.admission;
    if (stop.mealKind && !cost) continue;
    if (!cost || !p.currency || cost.currency !== p.currency) { unknowns.push(`${c.location.name}: admission/activities unknown${cost && cost.currency !== p.currency ? ' in the selected currency' : ''}.`); continue; }
    add(tickets, groupCost(cost, p));
    if (cost.source === 'user_estimate' || cost.source === 'published_estimate') unknowns.push(`${c.location.name}: admission is a planning estimate; confirm the ticket price.`);
  }
  const meals = stops.filter(s => s.mealKind);
  if (p.mealBreak && (meals.length || reserveMeal)) {
    if (p.mealGroupEstimate !== null) add(food, { minimum: p.mealGroupEstimate, maximum: p.mealGroupEstimate });
    else {
      const costs = meals.length ? meals.map(s => candidates.find(c => c.location.id === s.locationId)?.facts.mealCost) : [candidates.find(c => c.facts.mealReserve)?.facts.mealReserve];
      for (const cost of costs) {
        if (!cost || !p.currency || cost.currency !== p.currency) unknowns.push('Meals: no usable group or per-person cost estimate supplied.');
        else { add(food, groupCost(cost, p)); unknowns.push('Meals: approximate per-person allowance, not a restaurant quote.'); }
      }
    }
  }
  if (p.transportGroupEstimate !== null) add(transport, { minimum: p.transportGroupEstimate, maximum: p.transportGroupEstimate });
  if (p.transportPerKmEstimate !== null && distanceMeters !== undefined) { const amount = p.transportPerKmEstimate * distanceMeters / 1000; add(transport, { minimum: amount, maximum: amount }); }
  if (p.transportGroupEstimate === null && p.transportPerKmEstimate === null) {
    const india = candidates.some(c => c.location.city?.countryCode === 'IN'), exchange = candidates.find(c => c.facts.pricingExchange)?.facts.pricingExchange;
    const rate = p.currency === 'INR' ? 1 : exchange?.rate;
    if (p.travelMode === 'DRIVE' && india && p.currency && rate && distanceMeters !== undefined) {
      add(transport, { minimum: roundedPrice((300 + distanceMeters / 1000 * 15) * rate, p.currency), maximum: roundedPrice((500 + distanceMeters / 1000 * 25) * rate, p.currency) });
      unknowns.push('Transport: estimated group driving allowance from route distance, not a taxi quote.');
    } else if (p.travelMode === 'DRIVE') unknowns.push('Transport: no group cost estimate supplied.');
  }
  if (p.travelMode === 'DRIVE') unknowns.push('Parking and incidental costs are unverified.');
  if (p.childAges.length && stops.some(s => !candidates.find(c => c.location.id === s.locationId)?.facts.admission?.childRate)) unknowns.push('Unconfirmed child/student concessions are excluded; standard admission is reserved.');
  const minimum = tickets.minimum + food.minimum + transport.minimum, maximum = tickets.maximum + food.maximum + transport.maximum;
  const limits = [p.groupBudget, p.perPersonBudget === null ? null : p.perPersonBudget * people].filter((v): v is number => v !== null), limit = limits.length ? Math.min(...limits) : null;
  return { currency: p.currency, groupKnownMinimum: minimum, groupKnownMaximum: maximum, perPersonKnownMinimum: minimum / people, perPersonKnownMaximum: maximum / people, groupLimit: limit, unknowns: [...new Set(unknowns)], status: limit !== null && maximum > limit ? 'over' : unknowns.length ? 'unknown' : 'within_estimates', breakdown: { people, tickets, food, transport } };
}

type Schedule = { rows: Array<{ candidate: GuideCandidate; stop: GuideStop; arrival: number; departure: number; travel: number; wait: number }>; breaks: GuidePlan['breaks']; finish: number; travelSeconds: number; distance: number };
export const middayMealRequested = (input: GuidePlanRequest) => input.preferences.mealBreak && input.startTime < '14:00' && input.endTime > '13:00';
export const middayMealDue = (input: GuidePlanRequest, destination: SelectedLocation, finish: number) => middayMealRequested(input) && finish > zonedTime(input.date, '13:00', destination.timezone!);

type Timing = ReturnType<typeof liveDeparture> & { lunchStart: number; appointments: Map<string, number> };
export function scheduleGuide(order: GuideStop[], candidates: GuideCandidate[], input: GuidePlanRequest, destination: SelectedLocation, legs: Array<{ durationSeconds: number; distanceMeters: number }>, now = Date.now(), timing?: Timing): Schedule | null {
  const { departure, deadline } = timing ?? liveDeparture(input, destination, now), p = input.preferences;
  if (legs.length !== order.length + 1) return null;
  let cursor = departure, travelSeconds = 0, distance = 0, lastBreak = departure;
  const rows: Schedule['rows'] = [], breaks: GuidePlan['breaks'] = [];
  const lunchStart = timing?.lunchStart ?? zonedTime(input.date, '13:00', destination.timezone!);
  for (let i = 0; i < order.length; i++) {
    const stop = order[i], candidate = candidates.find(c => c.location.id === stop.locationId)!;
    if (!candidate || candidate.facts.hours.status === 'closed') return null;
    if (guidePreferenceIssue(candidate.facts, p, !!stop.mealKind)) return null;
    const leg = legs[i]; if (!Number.isFinite(leg.durationSeconds) || leg.durationSeconds < 0) return null;
    travelSeconds += leg.durationSeconds; distance += leg.distanceMeters; cursor += leg.durationSeconds * 1000 + p.bufferMinutes * 60000;
    const reached = cursor, duration = stop.durationMinutes * 60000;
    if (stop.preferredTime) { const appointment = timing?.appointments.get(stop.locationId) ?? zonedTime(input.date, stop.preferredTime, destination.timezone!); if (cursor > appointment) return null; cursor = appointment; }
    const hours = candidate.facts.hours;
    const meal = stop.mealKind === 'lunch' && middayMealRequested(input) ? p.meals?.lunch : undefined;
    const mealEnd = meal ? zonedTime(input.date, meal.endTime, destination.timezone!) : Infinity;
    if (stop.mealKind) {
      if (!meal?.enabled || candidate.facts.mealServices?.[stop.mealKind] === false || hours.status === 'unknown' || !candidate.facts.categories.includes('food') || (p.dietaryRules.some(r => ['vegetarian', 'pure_vegetarian', 'vegan', 'no_onion', 'no_garlic', 'no_root_vegetables'].includes(r)) && candidate.facts.vegetarianOptions === false)) return null;
      cursor = Math.max(cursor, zonedTime(input.date, meal.startTime, destination.timezone!));
    }
    if (hours.status !== 'unknown') {
      const slot = hours.windows.find(w => Math.max(cursor, Date.parse(w.opens)) + duration <= Date.parse(w.closes));
      if (!slot) return null;
      const entry = Math.max(cursor, Date.parse(slot.opens)); if (stop.preferredTime && entry !== cursor) return null; cursor = entry;
    }
    const arrival = cursor; cursor += duration;
    if (arrival > mealEnd) return null;
    rows.push({ candidate, stop, arrival, departure: cursor, travel: leg.durationSeconds / 60, wait: (arrival - reached) / 60000 });
    if (candidate.facts.categories.includes('food')) lastBreak = cursor;
    if (p.restBreaks && (p.groupType === 'seniors' || p.childAges.length || p.pace === 'relaxed') && cursor - lastBreak >= 2 * 3600000) {
      const starts = new Date(cursor).toISOString(); cursor += 15 * 60000;
      breaks.push({ kind: 'rest', afterLocationId: candidate.location.id, starts, ends: new Date(cursor).toISOString(), note: 'Personal rest break; a seat, restroom and accessible facilities are not confirmed.' }); lastBreak = cursor;
    }
  }
  const lastLeg = legs.at(-1)!; cursor += lastLeg.durationSeconds * 1000; travelSeconds += lastLeg.durationSeconds; distance += lastLeg.distanceMeters;
  const missingMealAllowance = middayMealRequested(input) && cursor > lunchStart && !order.some(s => s.mealKind === 'lunch') ? (p.meals?.lunch.durationMinutes ?? 45) + p.bufferMinutes + (p.meals?.maxExtraMinutes ?? 15) : 0;
  return cursor + missingMealAllowance * 60000 <= deadline ? { rows, breaks, finish: cursor, travelSeconds, distance } : null;
}
function sequences<T>(items: T[], prefix: T[] = []): T[][] { if (prefix.length === 5) return [prefix]; return prefix.length ? [prefix, ...items.flatMap((item, i) => sequences(items.filter((_, j) => i !== j), [...prefix, item]))] : items.flatMap((item, i) => sequences(items.filter((_, j) => i !== j), [item])); }
export function chooseGuideOrder(input: GuidePlanRequest, destination: SelectedLocation, candidates: GuideCandidate[], matrix: TravelMatrix, ranking: string[] = [], now = Date.now(), banned = new Set<string>(), maxVisits = 5) {
  const p = input.preferences;
  const timing: Timing = { ...liveDeparture(input, destination, now), lunchStart: zonedTime(input.date, '13:00', destination.timezone!), appointments: new Map(input.stops.filter(s => s.preferredTime).map(s => [s.locationId, zonedTime(input.date, s.preferredTime!, destination.timezone!)])) };
  const bands = { morning: [zonedTime(input.date, '06:00', destination.timezone!), zonedTime(input.date, '12:00', destination.timezone!)], afternoon: [zonedTime(input.date, '12:00', destination.timezone!), zonedTime(input.date, '16:00', destination.timezone!)], evening: [zonedTime(input.date, '16:00', destination.timezone!), zonedTime(input.date, '21:00', destination.timezone!)] };
  const eligible = input.stops.filter(s => { const c = candidates.find(c => c.location.id === s.locationId); return c && !p.visitedPlaceIds.includes(c.location.placeId ?? '') && c.facts.hours.status !== 'closed' && !guidePreferenceIssue(c.facts, p, !!s.mealKind); });
  if (eligible.length !== input.stops.length && input.stops.some(s => (s.mustVisit || s.locked) && !eligible.includes(s))) throw new Error('A must-visit or locked place conflicts with your preferences, is closed, already visited or unavailable. Review it before planning.');
  const pool = input.orderMode === 'manual' ? input.stops : [...eligible].sort((a, b) => Number(b.mustVisit || b.locked) - Number(a.mustVisit || a.locked) || candidateScore(candidates.find(c => c.location.id === b.locationId)!, p).score - candidateScore(candidates.find(c => c.location.id === a.locationId)!, p).score);
  if (input.stops.filter(s => s.mustVisit || s.locked).length > 5 || (input.orderMode === 'manual' && pool.length > 5) || input.stops.some((s, i) => s.locked && i >= 5)) throw new Error('A final route supports five visits. For manual ordering choose at most five, or move a locked place into the first five positions before locking it.');
  const index = (id: string) => candidates.findIndex(c => c.location.id === id) + 1;
  const legsFor = (order: GuideStop[]) => { const indices = [0, ...order.map(s => index(s.locationId)), candidates.length + 1]; return indices.slice(1).map((to, i) => matrix[indices[i]]?.[to] ?? null); };
  const originalLegs = legsFor(input.stops), originalTravelMinutes = originalLegs.every(Boolean) ? originalLegs.reduce((sum, leg) => sum + leg!.durationSeconds, 0) / 60 : null;
  let best: { order: GuideStop[]; schedule: Schedule; score: number } | null = null, evaluated = 0;
  for (const order of input.orderMode === 'manual' ? [pool] : sequences(pool)) {
    if (order.length > maxVisits) continue;
    if (banned.has(order.map(s => s.locationId).join(':')) || !order.some(s => candidates.find(c => c.location.id === s.locationId)?.location.city?.placeId === destination.city?.placeId)) continue;
    if (input.stops.some((s, i) => (s.mustVisit && !order.includes(s)) || (s.locked && order[i]?.locationId !== s.locationId))) continue;
    const legs = legsFor(order); if (legs.some(l => !l)) continue; evaluated++;
    const schedule = scheduleGuide(order, candidates, input, destination, legs as NonNullable<TravelMatrix[0][0]>[], now, timing); if (!schedule) continue;
    const budget = budgetFor(order, candidates, p, schedule.distance, middayMealDue(input, destination, schedule.finish)); if (budget.status === 'over') continue;
    const timePreferencePenalty = schedule.rows.reduce((sum, row) => { const band = row.stop.timeBand; if (!band || band === 'any') return sum; const [opens, closes] = bands[band]; return sum + Math.min(180, Math.max(opens - row.arrival, row.arrival - closes, 0) / 60000) * 0.04; }, 0);
    const repeatedComplexPenalty = order.reduce((sum, stop, i) => sum + order.slice(i + 1).filter(other => sameAttractionComplex(candidates.find(c => c.location.id === stop.locationId)!, candidates.find(c => c.location.id === other.locationId)!)).length * 70, 0);
    const coverage = new Set(order.flatMap(s => matchingGuideInterests(candidates.find(c => c.location.id === s.locationId)!.facts, p))).size;
    const score = coverage * 12 + order.reduce((sum, s) => sum + candidateScore(candidates.find(c => c.location.id === s.locationId)!, p).score + Math.max(0, ranking.length - ranking.indexOf(s.locationId)) * (ranking.includes(s.locationId) ? 2 : 0), 0) - schedule.travelSeconds / 60 * 0.08 - schedule.distance / 1000 * 0.025 - schedule.rows.reduce((sum, r) => sum + r.wait, 0) * 0.1 - timePreferencePenalty - repeatedComplexPenalty;
    if (!best || score > best.score || (score === best.score && schedule.travelSeconds < best.schedule.travelSeconds)) best = { order, schedule, score };
  }
  if (!best) throw new Error('No feasible day fits these opening windows, travel times, visit allowances, locks and budget estimates. Remove optional visits, adjust times or revise your estimates.');
  return { ...best, evaluated, originalTravelMinutes };
}
export function guideResult(input: GuidePlanRequest, destination: SelectedLocation, start: SelectedLocation, end: SelectedLocation, candidates: GuideCandidate[], order: GuideStop[], route: LiveRoute, comparison: GuidePlan['comparison'], assistantMode: 'local' | 'openai' | 'gemini', now = Date.now()): GuidePlan {
  const schedule = scheduleGuide(order, candidates, input, destination, route.legs, now); if (!schedule) throw new Error('The final Google route no longer fits the opening windows or return deadline. Adjust the day and recalculate.');
  if (middayMealDue(input, destination, schedule.finish) && !order.some(s => s.mealKind === 'lunch')) throw new Error('The route now overlaps 13:00–14:00 and needs a meal stop. Recalculate or uncheck Include meal.');
  const budget = budgetFor(order, candidates, input.preferences, route.distanceMeters), { deadline } = liveDeparture(input, destination, now);
  if (budget.status === 'over') throw new Error('The final route exceeds your known cost limit. Review transport estimates or choose fewer places.');
  const warnings = [route.mode === 'DRIVE' ? 'Travel times are Google predictions for one departure; traffic on later legs can change. Opening hours can change after lookup.' : 'Walking/cycling travel times are static estimates, not live traffic observations. Confirm date-specific access and opening changes.'];
  if (budget.unknowns.length) warnings.push('Essential costs are unknown. This itinerary does not claim to fit your budget.');
  if (schedule.rows.some(r => r.candidate.facts.hours.status !== 'date_specific')) warnings.push('Some hours are unknown or usual weekly hours. Confirm date-specific availability before visiting.');
  if (input.preferences.mobility !== 'standard') warnings.push('Provider entrance accessibility is not a complete mobility assessment. Confirm paths, vehicles and facilities directly.');
  if (input.preferences.dietaryRules.length) warnings.push('Dietary preparation is unverified. Vegetarian options do not establish a pure vegetarian or Jain kitchen.');
  return { orderMode: input.orderMode, assistantMode, comparison, budget, assumptions: [`Visit allowances are estimates for a ${input.preferences.pace} pace; edit each duration.`, `${input.preferences.bufferMinutes} minutes per arrival for entry, walking or delays; this is your allowance.`, 'Per-person estimates divide group costs across all travelers; published child concessions are used where available; otherwise standard admission is reserved.', 'Gemini time-of-day suggestions are soft preferences, not verified best visiting times; actual opening windows take precedence.', 'Provider-confirmed sub-attractions in the same nearby complex are deprioritized to avoid duplicate long visits; explicit must-visits and locks take precedence.', 'Categories and indoor/outdoor suitability are inferred from provider types; detailed significance, shade and facilities may be unknown.', 'Published INR tariffs are converted with dated reference exchange rates when needed and rounded upward for planning; actual payment rates may differ.', ...(assistantMode === 'local' ? ['Local deterministic guide ranking is active; no AI model was called.'] : [`${assistantMode === 'gemini' ? 'Gemini' : 'AI'} prioritizes validated candidates; scheduling, budgets and factual checks remain deterministic.`])], excluded: input.stops.filter(s => !order.some(v => v.locationId === s.locationId)).map(s => ({ locationId: s.locationId, reason: 'Not selected in the highest-scoring feasible day under the current time, opening and budget constraints.' })), breaks: schedule.breaks,
    stops: schedule.rows.map(r => { const cost = r.stop.costEstimate ? { ...r.stop.costEstimate, source: 'user_estimate' as const, sourceUrl: null } : r.candidate.facts.admission; const mealCost = r.stop.mealKind ? input.preferences.mealGroupEstimate !== null ? { minimum: input.preferences.mealGroupEstimate, maximum: input.preferences.mealGroupEstimate, currency: input.preferences.currency!, basis: 'group' as const, source: 'user_estimate' as const, sourceUrl: null } : r.candidate.facts.mealCost : undefined; return ({ ...(r.stop.mealKind ? { mealKind: r.stop.mealKind } : {}), locationId: r.candidate.location.id, facts: r.candidate.facts, cost, ...(cost && cost.currency === input.preferences.currency ? { groupCost: { ...groupCost(cost, input.preferences), currency: cost.currency, basis: 'group' as const } } : {}), ...(mealCost ? { mealCost } : {}), reasons: [...candidateScore(r.candidate, input.preferences).reasons, r.stop.mustVisit ? 'Preserved as your must-visit.' : 'Selected within the feasible day.', r.candidate.facts.hours.status === 'unknown' ? 'Arrival uses your visit allowance; opening availability needs confirmation.' : r.wait ? 'Waiting aligns this visit with an opening period or your preferred time.' : 'Arrival fits the available opening evidence.'], durationSource: r.stop.durationSource ?? 'category_estimate', timeBand: r.stop.timeBand ?? 'any', bufferMinutes: input.preferences.bufferMinutes, travelMinutes: r.travel, waitingMinutes: r.wait, hoursStatus: r.candidate.facts.hours.status === 'closed' ? 'unknown' : r.candidate.facts.hours.status }); }),
    itinerary: { route, destination, start, end, stops: schedule.rows.map(r => ({ location: r.candidate.location, durationMinutes: r.stop.durationMinutes, arrivalAt: new Date(r.arrival).toISOString(), departureAt: new Date(r.departure).toISOString() })), finishAt: new Date(schedule.finish).toISOString(), deadlineAt: new Date(deadline).toISOString(), withinTime: true, warnings } };
}
