import type { FastifyInstance, FastifyRequest } from 'fastify';
import { mealKinds, guideDiscoverSchema, guideCandidateRequestSchema, guidePlanRequestSchema, candidateSchema, guideDiscoverySchema, guidePlanSchema, guideRankingSchema, type GuideCandidate, type GuidePreferences, type GuidePlanRequest, type GuideStop, type TravelMatrix } from '../../../packages/contracts/src/guide';
import { startMatchesDestination, type SelectedLocation } from '../../../packages/contracts/src/locations';
import { candidateScore, suggestedVisitMinutes, chooseGuideOrder, guideResult } from '../../../packages/domain/src/guide-planner';
import { liveDeparture } from '../../../packages/domain/src/live-itinerary';
import { factsFor, type GuidePlacesProvider, type GuidePlace } from '../../../packages/data-adapters/src/google-guide';
import type { ServerOptions } from './server';
import type { LocationRegistry } from './locations';
import type { ProviderGuard } from './provider-guard';
import type { AssistantService } from './assistant';
import type { IntentInterpreter } from '../../../packages/data-adapters/src/assistant';
import type { CheckedCatalog } from '../../../packages/data-adapters/src/catalog';
import { ApiError } from './errors';
import { mealSearchAnchors, chooseMealInsertion, validateMealDetours } from '../../../packages/domain/src/meal-planner';

export function registerGuideRoutes(app: FastifyInstance, context: { options: ServerOptions; locations: LocationRegistry; guard: ProviderGuard; owner: (request: FastifyRequest) => string; interpreter: IntentInterpreter; assistant: AssistantService; catalog: CheckedCatalog }) {
  const { options, locations, guard, owner, interpreter, assistant, catalog } = context;
  const records = new Map<string, { owner: string; date: string; candidate: GuideCandidate }>();
  const cleanup = () => { for (const [id, row] of records) if (Date.parse(row.candidate.location.expiresAt) <= Date.now()) records.delete(id); };
  const timer = setInterval(cleanup, 60000); timer.unref(); app.addHook('onClose', async () => { clearInterval(timer); records.clear(); });
  const provider = (): GuidePlacesProvider => { if (!options.guide || !options.locations) throw new ApiError(503, 'GUIDE_NOT_CONFIGURED', 'Configure Places API (New), Geocoding and Time Zone server keys for guide discovery.'); return options.guide; };
  const destinationFor = (who: string, id: string) => { const destination = locations.get(who, id); if (!destination.city || !destination.timezone || destination.source !== 'search') throw new ApiError(422, 'DESTINATION_UNRESOLVED', 'Select a validated destination city first.'); return destination; };
  const candidateFor = (who: string, id: string, date: string) => { cleanup(); locations.get(who, id); const row = records.get(id); if (!row || row.owner !== who || row.date !== date) throw new ApiError(409, 'GUIDE_EVIDENCE_EXPIRED', 'Guide evidence expired or belongs to another date. Discover or add this place again.'); return row.candidate; };
  function save(who: string, location: SelectedLocation, raw: GuidePlace, date: string, timezone: string, p: GuidePreferences) {
    cleanup(); if (records.size >= 500) throw new ApiError(429, 'GUIDE_CAPACITY', 'The temporary guide queue is full. Retry later.');
    const facts = factsFor(raw, date, timezone);
    const reviewed = catalog.available().flatMap(c => c.locations).find(l => l.googlePlaceId === location.placeId && Date.parse(l.evidence.validUntil) >= Date.parse(`${date}T23:59:59Z`));
    if (reviewed?.admission) facts.admission = { ...reviewed.admission, source: 'reviewed_catalog', sourceUrl: reviewed.evidence.sourceUrl };
    if (reviewed?.openingHours?.date === date) facts.hours = { status: reviewed.openingHours.windows.length ? 'date_specific' : 'closed', windows: reviewed.openingHours.windows, description: ['Independently reviewed date-specific opening evidence.'], source: 'reviewed_catalog', sourceUrl: reviewed.evidence.sourceUrl };
    const candidate = candidateSchema.parse({ location, facts, suggestedMinutes: suggestedVisitMinutes(facts, p), ...candidateScore({ location, facts }, p) });
    records.set(location.id, { owner: who, date, candidate }); return candidate;
  }
  async function addMeals(who: string, body: GuidePlanRequest, destination: SelectedLocation, start: SelectedLocation, end: SelectedLocation, originalCandidates: GuideCandidate[], originalOrder: GuideStop[], originalMatrix: TravelMatrix, departure: number) {
    let order = originalOrder, candidates = originalCandidates, matrix = originalMatrix;
    for (const kind of mealKinds.filter(kind => body.preferences.meals?.[kind].enabled)) {
      const source = provider();
      if (!source.nearbyRestaurants) throw new ApiError(503, 'MEALS_NOT_CONFIGURED', 'Nearby restaurant discovery is unavailable. Configure Places API (New), or turn the requested meal off.');
      const indices = [0, ...order.map(s => candidates.findIndex(c => c.location.id === s.locationId) + 1), candidates.length + 1];
      const legs = indices.slice(1).map((to, i) => matrix[indices[i]][to]!);
      const anchors = mealSearchAnchors(order, candidates, body, destination, legs, kind);
      if (!anchors.length) throw new ApiError(422, 'MEAL_INFEASIBLE', `No preceding visit leaves time for ${kind}. Adjust the meal window or trip times.`);
      const groups: GuidePlace[][] = [];
      const used = new Set(order.map(s => candidates.find(c => c.location.id === s.locationId)!.location.placeId));
      for (const anchor of anchors) {
        guard.consume(); const results = await source.nearbyRestaurants(anchor.location.coordinates, body.preferences.meals!.nearbyMeters);
        groups.push(results.filter(raw => {
          const facts = factsFor(raw, body.date, destination.timezone!);
          return !used.has(raw.id) && facts.categories.includes('food') && facts.mealServices?.[kind] !== false && !['unknown', 'closed'].includes(facts.hours.status) && !(body.preferences.mobility === 'wheelchair' && facts.accessible === false) && !(body.preferences.childAges.length && facts.goodForChildren === false) && !(body.preferences.dietaryRules.length && facts.vegetarianOptions === false);
        }));
      }
      // Keep the existing ten-point matrix bound, sharing the shortlist across anchors.
      const base = order.map(s => candidates.find(c => c.location.id === s.locationId)!);
      const limit = 10 - base.length - 2, shortlist: GuidePlace[] = [];
      for (let rank = 0; rank < 8 && shortlist.length < limit; rank++) for (const group of groups) {
        const raw = group[rank]; if (raw && shortlist.length < limit && !shortlist.some(r => r.id === raw.id)) shortlist.push(raw);
      }
      const restaurants: GuideCandidate[] = [];
      for (const raw of shortlist) {
        guard.consume(); const reversed = await options.locations!.reverse(raw.location);
        if (reversed.city?.countryCode !== destination.city!.countryCode) continue;
        const location = locations.add(who, { ...reversed, provider: 'google', source: 'search', placeId: raw.id, name: raw.displayName.text, address: raw.formattedAddress, coordinates: raw.location, types: raw.types, ...(raw.attributions ? { attributions: raw.attributions } : {}) });
        restaurants.push(save(who, location, raw, body.date, destination.timezone!, body.preferences));
      }
      if (!restaurants.length) throw new ApiError(422, 'MEAL_NOT_FOUND', `No nearby ${kind} restaurant with usable opening hours and location evidence was found. Adjust the meal options or turn this meal off; no restaurant was invented.`);
      candidates = [...base, ...restaurants];
      guard.consume(); matrix = await options.liveRoutes!.matrix!([start.coordinates, ...candidates.map(c => c.location.coordinates), end.coordinates], new Date(departure).toISOString(), body.preferences.travelMode);
      try { order = chooseMealInsertion(order, candidates, restaurants, body, destination, matrix, kind); }
      catch (error) { throw new ApiError(422, 'MEAL_INFEASIBLE', error instanceof Error ? error.message : 'No nearby meal fits the day.'); }
    }
    return { order, candidates, matrix };
  }
  app.post('/api/guide/discover', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async request => {
    const body = guideDiscoverSchema.parse(request.body), who = owner(request), destination = destinationFor(who, body.destinationId), source = provider();
    const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: destination.timezone!, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (body.date < localToday || Date.parse(body.date) > Date.parse(localToday) + 7 * 86400000) throw new ApiError(422, 'GUIDE_DATE', 'Choose today or a date in the next seven days.');
    guard.consume(); const raw = await source.discover(destination.name, destination.coordinates, body.preferences), candidates: GuideCandidate[] = [], warnings: string[] = [];
    const ranked = raw.filter(r => !body.preferences.visitedPlaceIds.includes(r.id)).map(r => ({ raw: r, facts: factsFor(r, body.date, destination.timezone!) })).filter(r => r.facts.categories.length && r.facts.hours.status !== 'closed' && !(body.preferences.mobility === 'wheelchair' && r.facts.accessible === false)).sort((a, b) => candidateScore({ location: { ...destination, name: a.raw.displayName.text }, facts: b.facts }, body.preferences).score - candidateScore({ location: { ...destination, name: b.raw.displayName.text }, facts: a.facts }, body.preferences).score).slice(0, 8);
    for (const item of ranked) {
      try {
        guard.consume(); const reversed = await options.locations!.reverse(item.raw.location);
        if (reversed.city?.countryCode !== destination.city!.countryCode) { warnings.push('A discovery result could not be verified in the destination country and was excluded.'); continue; }
        const location = locations.add(who, { ...reversed, provider: 'google', source: 'search', placeId: item.raw.id, name: item.raw.displayName.text, address: item.raw.formattedAddress, coordinates: item.raw.location, types: item.raw.types, ...(item.raw.attributions ? { attributions: item.raw.attributions } : {}) });
        candidates.push(save(who, location, item.raw, body.date, destination.timezone!, body.preferences));
      } catch (error) { if (error instanceof ApiError) throw error; warnings.push('A result could not be location-validated and was excluded. Check Geocoding if this repeats.'); }
    }
    if (!candidates.length) throw new ApiError(422, 'NO_GUIDE_CANDIDATES', 'No suitable real attractions could be verified. Try different interests, relax optional preferences or add places by search.');
    warnings.push('Only a bounded provider shortlist is reviewed. Ratings indicate popularity; cultural significance, admission and special events may be unknown.');
    return guideDiscoverySchema.parse({ candidates, warnings, assistantMode: interpreter.mode });
  });
  app.post('/api/guide/candidate', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async request => {
    const body = guideCandidateRequestSchema.parse(request.body), who = owner(request), destination = destinationFor(who, body.destinationId), location = locations.get(who, body.locationId);
    if (!location.placeId || location.source !== 'search') throw new ApiError(422, 'GUIDE_PLACE_REQUIRED', 'Search and select a real attraction before adding it to the guide.');
    guard.consume(); const raw = await provider().facts(location.placeId); return save(who, location, raw, body.date, destination.timezone!, body.preferences);
  });
  app.post('/api/guide/plan', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async request => {
    const body = guidePlanRequestSchema.parse(request.body), who = owner(request), destination = destinationFor(who, body.destinationId), start = locations.get(who, body.startId), end = body.returnToStart ? start : locations.get(who, body.endId!);
    if (body.stops.some(s => s.mealKind)) throw new ApiError(422, 'MEAL_SERVER_SELECTED', 'Request meals through the meal preferences. Restaurants are validated and selected by the server.');
    if (typeof request.headers['idempotency-key'] !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(request.headers['idempotency-key'])) throw new ApiError(400, 'IDEMPOTENCY_REQUIRED', 'Use a fresh valid request key for guide planning.');
    if (!startMatchesDestination(start, destination) && !body.allowOutsideStart) throw new ApiError(422, 'START_CITY_MISMATCH', 'Review and consent to the starting city difference before guide planning.');
    if (!options.liveRoutes?.matrix) throw new ApiError(503, 'GUIDE_ROUTING_NOT_CONFIGURED', 'Configure Google Routes API for real travel-time comparison.');
    let departure: number; try { departure = liveDeparture(body, destination).departure; } catch (error) { throw new ApiError(422, 'INVALID_DEPARTURE', error instanceof Error ? error.message : 'Invalid departure.'); }
    const candidates = body.stops.map(s => candidateFor(who, s.locationId, body.date));
    return guard.run(who, `${request.headers['idempotency-key']}-guide`, body, async () => {
    const coordinates = [start.coordinates, ...candidates.map(c => c.location.coordinates), end.coordinates];
    // Matrix data informs both AI priorities and deterministic constrained ordering.
    const matrix = await options.liveRoutes!.matrix!(coordinates, new Date(departure).toISOString(), body.preferences.travelMode);
    const facts = candidates.map(c => ({ id: c.location.id, name: c.location.name, categories: c.facts.categories, rating: c.facts.rating, reviews: c.facts.reviews, facts: c.facts, suggestedMinutes: c.suggestedMinutes }));
    let ranking: string[] = [], mode: 'local' | 'openai' | 'gemini' = 'local';
    if (body.orderMode === 'smart' && body.preferences.useAI && interpreter.mode !== 'local' && interpreter.rankGuide) {
      assistant.reserveAI(); const result = guideRankingSchema.parse(await interpreter.rankGuide({ preferences: body.preferences, candidates: facts, trip: { city: destination.name, date: body.date, timezone: destination.timezone!, startTime: body.startTime, endTime: body.endTime }, travelMatrix: matrix }));
      const suppliedIds = [...result.rankedIds, ...(result.visits ?? []).map(v => v.locationId)];
      if (new Set(result.rankedIds).size !== result.rankedIds.length || new Set(result.visits?.map(v => v.locationId)).size !== (result.visits?.length ?? 0) || suppliedIds.some(id => !candidates.some(c => c.location.id === id))) throw new ApiError(422, 'AI_UNKNOWN_CANDIDATE', 'AI referenced an unverified place. Your itinerary was not changed.');
      ranking = result.rankedIds; mode = interpreter.mode;
      if (mode === 'gemini' && !result.visits?.length) throw new ApiError(422, 'AI_NO_SUITABLE_VISITS', 'Gemini did not recommend suitable verified visits. Adjust preferences or turn AI planning off.');
      if (mode === 'gemini') body.stops = body.stops.filter(stop => stop.mustVisit || stop.locked || result.visits?.some(v => v.locationId === stop.locationId)).map(stop => { const decision = result.visits?.find(v => v.locationId === stop.locationId); return decision && stop.durationSource !== 'user' ? { ...stop, durationMinutes: decision.durationMinutes, durationSource: 'gemini_estimate', timeBand: decision.timeBand } : stop; });
    }
    const banned = new Set<string>(); let maxVisits = 5;
    for (let attempt = 0; attempt < (body.orderMode === 'manual' ? 1 : 2); attempt++) {
      let selected: ReturnType<typeof chooseGuideOrder>;
      try { selected = chooseGuideOrder(body, destination, candidates, matrix, ranking, Date.now(), banned, maxVisits); } catch (error) { throw new ApiError(422, 'GUIDE_INFEASIBLE', error instanceof Error ? error.message : 'No feasible day.'); }
      const final = await addMeals(who, body, destination, start, end, candidates, selected.order, matrix, departure);
      guard.consume(); const route = await options.liveRoutes!.itinerary(start.coordinates, end.coordinates, final.order.map(s => final.candidates.find(c => c.location.id === s.locationId)!.location.coordinates), new Date(departure).toISOString(), false, undefined, body.preferences.travelMode);
      try {
        const result = guideResult(body, destination, start, end, final.candidates, final.order, route, { originalTravelMinutes: selected.originalTravelMinutes, selectedTravelMinutes: route.durationSeconds / 60, evaluatedSequences: selected.evaluated }, mode);
        const detours = validateMealDetours(final.order, final.candidates, final.matrix, body, route);
        result.stops.forEach((stop, i) => { if (detours[i]) { stop.mealDetour = detours[i]; stop.reasons.push(stop.facts.mealServices?.[stop.mealKind!] === true ? `Google reports ${stop.mealKind} service; confirm current availability.` : `${stop.mealKind} service is unverified; check directly with the restaurant.`, 'Selected near the preceding visit, with the onward route and meal window checked.', 'Food preparation and meal prices remain unverified; confirm directly with the restaurant.'); } });
        return guidePlanSchema.parse(result);
      }
      catch (error) { if (mealKinds.some(kind => body.preferences.meals?.[kind].enabled)) throw new ApiError(422, 'MEAL_FINAL_ROUTE_INFEASIBLE', error instanceof Error ? error.message : 'The final meal route no longer fits. Adjust the meal options and retry.'); const indices = [0, ...selected.order.map(s => candidates.findIndex(c => c.location.id === s.locationId) + 1), candidates.length + 1]; route.legs.forEach((leg, i) => { matrix[indices[i]][indices[i + 1]] = { durationSeconds: leg.durationSeconds, distanceMeters: leg.distanceMeters }; }); maxVisits = Math.max(1, selected.order.length - 1); banned.add(selected.order.map(s => s.locationId).join(':')); if (attempt === 1 || body.orderMode === 'manual') throw new ApiError(422, 'GUIDE_FINAL_ROUTE_INFEASIBLE', error instanceof Error ? error.message : 'Final route is infeasible.'); }
    }
    throw new ApiError(422, 'GUIDE_FINAL_ROUTE_INFEASIBLE', 'No final Google route fits the available day. Keep your choices and adjust the schedule.');
    });
  });
}
