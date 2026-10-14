import { randomUUID } from 'node:crypto';
import type { TripStore } from './store';
import { ApiError, missing, stale } from './errors';
import { getCity } from '../../../fixtures/cities';
import { dietRules, dietNames, type City, type TripInput } from '../../../packages/contracts/src';
import type { RemoteTrip } from '../../../packages/contracts/src/api';
import { assistantReplySchema, type AssistantReply, type Proposal, type TripProgress } from '../../../packages/contracts/src/assistant';
import { initialProgress, progressReadyAt, replan } from '../../../packages/domain/src/replan';
import { confirmPlan, planChanges } from '../../../packages/domain/src/versioning';
import { formatMoney } from '../../../packages/domain/src/money';
import { formatTime } from '../../../packages/domain/src/time-format';
import { explicitDelay, type IntentInterpreter } from '../../../packages/data-adapters/src/assistant';
import { ProviderGuard } from './provider-guard';

export class AssistantService {
  private proposals = new Map<string, { owner: string; value: Proposal; state: 'pending' | 'resolving' }>();
  private aiBudget: ProviderGuard;
  constructor(private store: TripStore, private interpreter: IntentInterpreter, private fixtures: boolean, private clock = () => Date.now(), aiDailyLimit = 20) { this.aiBudget = new ProviderGuard(aiDailyLimit, clock, 'ai'); }
  usage() { return this.aiBudget.usage(); }
  reserveAI() { if (this.interpreter.mode !== 'local') this.aiBudget.consume(); }
  cleanup() { const now = this.clock(); for (const [id, record] of this.proposals) if (Date.parse(record.value.expiresAt) <= now) this.proposals.delete(id); this.aiBudget.cleanup(); }
  forget(owner: string, tripId: string) { for (const [id, record] of this.proposals) if (record.owner === owner && record.value.tripId === tripId) this.proposals.delete(id); }
  private context(trip: RemoteTrip) {
    if (!this.fixtures) throw new ApiError(422, 'CITY_NOT_READY', 'The assistant currently requires fixture planning.');
    const city = getCity(trip.input.cityId); if (!city || !trip.confirmed) throw new ApiError(422, 'CONFIRM_FIRST', 'Confirm a baseline plan before using the assistant.');
    return { city, confirmed: trip.confirmed, progress: trip.progress ?? initialProgress(trip.confirmed) };
  }
  async progress(owner: string, tripId: string, revision: number, progressRevision: number, completedCount: number, delayMinutes: number) {
    return this.store.change(owner, tripId, revision, trip => {
      const { confirmed, progress } = this.context(trip);
      if (progress.revision !== progressRevision) throw stale();
      if (completedCount < progress.completedCount || completedCount > confirmed.plan.stops.length) throw new ApiError(422, 'PROGRESS_CONFLICT', 'Completed stops must be a growing prefix of the confirmed day.');
      const ready = progressReadyAt(confirmed.plan, completedCount, delayMinutes);
      if (ready < Date.parse(progress.readyAt)) throw new ApiError(422, 'PROGRESS_CONFLICT', 'Reported departure cannot move backwards.');
      return { ...trip, progress: { revision: progress.revision + 1, completedCount, readyAt: new Date(ready).toISOString() }, revision: trip.revision + 1, updatedAt: new Date(this.clock()).toISOString() };
    });
  }
  async turn(owner: string, id: string, revision: number, message: string): Promise<{ reply: AssistantReply; trip: RemoteTrip }> {
    let trip = await this.store.get(owner, id); if (trip.revision !== revision) throw stale();
    const { city, confirmed } = this.context(trip);
    this.reserveAI();
    const action = await this.interpreter.interpret(message, city);
    if ((await this.store.get(owner, id)).revision !== trip.revision) throw stale();
    // Interpreter output never gets mutation privileges or trusted travel facts.
    const reply: AssistantReply = { mode: this.interpreter.mode, message: '', proposal: null, food: [] };
    if (action.intent === 'summary') reply.message = `${confirmed.plan.stops.filter(stop => stop.kind === 'visit').length} visits; upper group estimate ${formatMoney(confirmed.plan.total[1], city)} including reserve and return travel. Return ${formatTime(confirmed.plan.finishMs, city.timezone)} ${city.timezone}. All facts are fictional test data.`;
    else if (action.intent === 'unavailable') reply.message = 'Live traffic, closures, crowds, weather and events are not connected. Report an explicit additional delay in minutes to test a revision; no disruption or detour will be invented.';
    else if (action.intent === 'clarify') reply.message = 'Please request one supported action: summarize my plan, show food evidence, delay 30 minutes, use relaxed pace, or remove one named optional stop. Group/age/budget/strict-requirement changes belong in preferences and require a new baseline.';
    else if (action.intent === 'food') {
      const rules = new Set(trip.input.dietaryRules);
      if (/\bjain\b/i.test(message)) ['pure_vegetarian', 'no_onion', 'no_garlic', 'no_root_vegetables'].forEach(rule => rules.add(rule as typeof dietRules[number]));
      if (/\bvegan\b/i.test(message)) rules.add('vegan');
      if (/pure vegetarian/i.test(message)) rules.add('pure_vegetarian');
      reply.food = city.places.filter(place => place.category === 'food').map(place => ({ id: place.id, name: place.name, matches: [...rules].every(rule => place.dietary[rule] === 'supported'), rules: [...rules].map(rule => ({ rule: dietNames[rule], status: place.dietary[rule] ?? 'unknown' })), source: 'software_fixture', checkedAt: null }));
      reply.message = 'Food evidence comes only from the software fixture, with no real-world checking date. Every requested rule must be supported; unknown evidence is not a match. Your dietary preferences were not changed.';
    } else {
      let input: TripInput = structuredClone(trip.input);
      let progress: TripProgress = trip.progress ?? initialProgress(confirmed);
      if (action.intent === 'delay') {
        if (action.minutes === null || action.minutes <= 0 || explicitDelay(message) !== action.minutes) throw new ApiError(422, 'DELAY_REQUIRED', 'Specify an explicit additional delay of 1–180 minutes. A model cannot infer or invent the amount.');
        // Recording a user's factual delay updates progress, never confirmation.
        const ready = Date.parse(progress.readyAt) + action.minutes * 60000;
        trip = await this.store.change(owner, id, revision, value => ({ ...value, progress: { ...progress, revision: progress.revision + 1, readyAt: new Date(ready).toISOString() }, revision: value.revision + 1, updatedAt: new Date(this.clock()).toISOString() }));
        progress = trip.progress!;
      } else if (action.intent === 'pace') {
        if (!action.pace) throw new ApiError(422, 'PACE_REQUIRED', 'Choose a supported pace.'); input.pace = action.pace;
      } else if (action.intent === 'remove') {
        const place = city.places.find(place => place.id === action.placeId);
        const completed = confirmed.plan.stops.slice(0, progress.completedCount);
        if (!place || !confirmed.plan.order.includes(place.id)) throw new ApiError(422, 'PLACE_UNAVAILABLE', 'That stop is not in the confirmed city plan.');
        if (completed.some(stop => stop.placeId === place.id) || input.mustVisitIds.includes(place.id) || place.category === 'food') throw new ApiError(422, 'HARD_CONSTRAINT', 'Completed stops, must-visits and the meal cannot be removed by the assistant.');
        input.excludedPlaceIds = [...new Set([...input.excludedPlaceIds, place.id])];
      }
      const kept = action.intent === 'delay' ? replan(input, city, confirmed.plan, progress, true) : null;
      const result = kept?.outcome === 'feasible' ? kept : replan(input, city, confirmed.plan, progress);
      if (result.outcome !== 'feasible') reply.message = `No evaluated revision satisfies the retained constraints: ${result.issues.map(issue => issue.message).join(' ')} Your confirmation is unchanged. Reported progress remains recorded; adjust preferences explicitly if needed.`;
      else {
        const now = this.clock(); this.cleanup();
        if (this.proposals.size >= 500) throw new ApiError(429, 'PROPOSAL_CAPACITY', 'The local proposal queue is full. Retry later.');
        const proposal: Proposal = { id: randomUUID(), tripId: id, baseRevision: trip.revision, baseConfirmedId: confirmed.id, progressRevision: progress.revision, input, plan: result.plan, changes: planChanges(confirmed.plan, result.plan), trigger: action.intent, expiresAt: new Date(now + 10 * 60000).toISOString(), catalogVersion: city.catalogVersion };
        if (input.pace !== trip.input.pace) proposal.changes.unshift(`Change pace from ${trip.input.pace} to ${input.pace}`);
        this.proposals.set(proposal.id, { owner, value: structuredClone(proposal), state: 'pending' }); reply.proposal = proposal;
        reply.message = 'A fixture revision is ready for review. Completed stops, strict food/mobility requirements, budget, must-visits and return deadline were retained. Your confirmed plan is unchanged until you accept.';
      }
    }
    return { reply: assistantReplySchema.parse(reply), trip };
  }
  async decide(owner: string, tripId: string, proposalId: string, expectedRevision: number, progressRevision: number, confirmedId: string, accept: boolean) {
    const record = this.proposals.get(proposalId); if (!record || record.owner !== owner || record.value.tripId !== tripId) throw missing();
    if (record.state !== 'pending') throw new ApiError(409, 'PROPOSAL_DECISION_IN_PROGRESS', 'This proposal is already being accepted or rejected. Reload the trip.');
    record.state = 'resolving';
    const proposal = record.value;
    const check = (trip: RemoteTrip) => {
      const { city, confirmed, progress } = this.context(trip);
      if (trip.revision !== expectedRevision || trip.revision !== proposal.baseRevision || confirmed.id !== confirmedId || confirmed.id !== proposal.baseConfirmedId || progress.revision !== progressRevision || progress.revision !== proposal.progressRevision) throw stale();
      if (Date.parse(proposal.expiresAt) <= this.clock() || city.catalogVersion !== proposal.catalogVersion) throw new ApiError(409, 'PROPOSAL_EXPIRED', 'This proposal expired or its catalog changed. Request a fresh revision.');
    };
    try {
      if (!accept) { const trip = await this.store.get(owner, tripId); check(trip); this.proposals.delete(proposalId); return trip; }
      const updated = await this.store.change(owner, tripId, expectedRevision, trip => {
      check(trip); const confirmed = confirmPlan(proposal.input, proposal.plan, trip.confirmed, proposal.baseConfirmedId);
      return { ...trip, input: proposal.input, order: proposal.plan.order, confirmed, revision: trip.revision + 1, updatedAt: new Date(this.clock()).toISOString(), history: [...(trip.history ?? []), { id: proposal.id, previousConfirmedId: proposal.baseConfirmedId, confirmedId: confirmed.id, trigger: proposal.trigger, acceptedAt: new Date(this.clock()).toISOString() }].slice(-20) };
      }); this.proposals.delete(proposalId); return updated;
    } catch (error) { record.state = 'pending'; throw error; }
  }
}
