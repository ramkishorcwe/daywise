import { sessionSchema, type City, type Plan, type TripInput, type TripSession } from '../../contracts/src';
import { localDayChangeSchema, type LocalDayChange } from '../../contracts/src/local-day';
import { validateBackupDay } from './backup';
import { initialProgress, progressReadyAt, replan } from './replan';
import { confirmPlan, planChanges, sameValue } from './versioning';
import type { TripProgress } from '../../contracts/src/progress';
import { z } from 'zod';
import { zonedTime } from './time';

export interface LocalRevision { sessionId: string; confirmedId: string; progress: TripProgress; catalogVersion: string; input: TripInput; change: LocalDayChange; plan: Plan; changes: string[] }
export type LocalPreview = { proposal: LocalRevision; issues?: never } | { issues: string[]; proposal?: never };
function context(session: TripSession, city: City, calculation = true, allowCompletion = false) {
  sessionSchema.parse(session); validateBackupDay(session, city);
  if (!session.confirmed) throw new Error('Confirm a day before recording local progress.');
  if (session.assistant?.tripId) throw new Error('This day has a backend workspace. Use its assistant so progress stays in one place.');
  if (session.completion && !allowCompletion) throw new Error('Return has been reported. This day cannot be replanned or have progress changed; start a separate day.');
  const confirmed = session.confirmed;
  if (calculation && confirmed.plan.catalogVersion !== city.catalogVersion) throw new Error('This saved day uses an older catalog. Start a fresh day before calculating local updates.');
  if (!sameValue(session.input, confirmed.input) || (session.draftOrder !== null && !sameValue(session.draftOrder, confirmed.plan.order))) throw new Error('Unaccepted draft changes are present. Review them or keep the confirmed plan before recording local updates.');
  return { confirmed, progress: session.assistant?.progress ?? initialProgress(confirmed) };
}
export function reportLocalReturn(session: TripSession, city: City, date: string, time: string, clock = () => Date.now()): TripSession {
  const { confirmed, progress } = context(session, city, false, true);
  if (!progress.revision || progress.completedCount !== confirmed.plan.stops.length) throw new Error('Report every itinerary stop complete before reporting arrival at the return point.');
  let arrived: number;
  try { z.iso.date().parse(date); z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).parse(time); arrived = zonedTime(date, time, city.timezone); }
  catch { throw new Error('Enter a valid, unambiguous local arrival date and time in this city timezone.'); }
  const now = clock();
  if (arrived < Date.parse(progress.readyAt)) throw new Error('Arrival cannot be before your last reported departure.');
  if (!Number.isFinite(now) || arrived > now) throw new Error('Arrival cannot be in the future. Report the date and time you arrived.');
  return sessionSchema.parse({ ...structuredClone(session), completion: { confirmedId: confirmed.id, arrivedAt: new Date(arrived).toISOString(), reportedAt: new Date(now).toISOString(), source: 'user_reported_unverified' }, updatedAt: new Date(now).toISOString() });
}
export function reportLocalDay(session: TripSession, city: City, completedCount: number, delayMinutes: number): TripSession {
  const { confirmed, progress } = context(session, city);
  if (!Number.isInteger(completedCount) || completedCount < progress.completedCount || completedCount > confirmed.plan.stops.length || !Number.isInteger(delayMinutes) || delayMinutes < 0 || delayMinutes > 180) throw new Error('Select a growing completed-stop prefix and whole-minute lateness from 0 to 180.');
  const ready = progressReadyAt(confirmed.plan, completedCount, delayMinutes);
  if (ready < Date.parse(progress.readyAt)) throw new Error('Reported departure cannot move backwards. Check the lateness at the selected stop.');
  return sessionSchema.parse({ ...structuredClone(session), assistant: { tripId: null, baseId: confirmed.id, progress: { revision: progress.revision + 1, completedCount, readyAt: new Date(ready).toISOString() } }, updatedAt: new Date().toISOString() });
}
export function previewLocalDay(session: TripSession, city: City, requested: LocalDayChange = { kind: 'delay' }): LocalPreview {
  const { confirmed, progress } = context(session, city);
  if (!progress.revision) throw new Error('Record local progress before requesting a revision.');
  const change = localDayChangeSchema.parse(requested), input = structuredClone(confirmed.input);
  let replacementMealId: string | undefined;
  if (change.kind === 'skip') {
    const stop = confirmed.plan.stops.find(stop => stop.placeId === change.placeId);
    const completed = confirmed.plan.stops.slice(0, progress.completedCount);
    if (!stop || !city.places.some(place => place.id === change.placeId) || stop.kind !== 'visit' || completed.some(stop => stop.placeId === change.placeId) || input.mustVisitIds.includes(change.placeId)) throw new Error('Only an optional remaining visit can be skipped. Completed stops, must-visits, meals and rest stay protected.');
    input.excludedPlaceIds = [...new Set([...input.excludedPlaceIds, change.placeId])];
  } else if (change.kind === 'meal') {
    const meal = confirmed.plan.stops.slice(progress.completedCount).find(stop => stop.kind === 'meal');
    if (!meal) throw new Error('There is no remaining meal to replace. Completed meals stay preserved.');
    if (input.mustVisitIds.includes(meal.placeId!)) throw new Error('The current meal is a must-visit and cannot be replaced through local updates.');
    if (!city.places.some(place => place.id === change.placeId && place.category === 'food') || change.placeId === meal.placeId) throw new Error('Choose a different meal from this city’s food catalog.');
    replacementMealId = change.placeId;
  } else if (change.kind === 'pace') {
    if (progress.completedCount === confirmed.plan.stops.length) throw new Error('All stops are complete; no visit or rest remains to change pace. Review the return with saved lateness only.');
    if (change.pace === input.pace) throw new Error('Choose a different pace for the remaining day.');
    input.pace = change.pace;
  }
  const kept = replan(input, city, confirmed.plan, progress, true, replacementMealId);
  const result = kept.outcome === 'feasible' ? kept : replan(input, city, confirmed.plan, progress, false, replacementMealId);
  if (result.outcome !== 'feasible') return { issues: result.issues.map(issue => issue.message) };
  const changes = planChanges(confirmed.plan, result.plan);
  if (change.kind === 'pace') changes.unshift(`Change remaining pace from ${confirmed.input.pace} to ${change.pace}`);
  return { proposal: { sessionId: session.id, confirmedId: confirmed.id, progress: structuredClone(progress), catalogVersion: city.catalogVersion, input, change, plan: result.plan, changes } };
}
export function acceptLocalDay(session: TripSession, city: City, proposal: LocalRevision): TripSession {
  const { confirmed, progress } = context(session, city);
  if (proposal.sessionId !== session.id || proposal.confirmedId !== confirmed.id || proposal.catalogVersion !== city.catalogVersion || !sameValue(proposal.progress, progress)) throw new Error('This local revision is stale. Preview the current reported day again.');
  const fresh = previewLocalDay(session, city, proposal.change);
  if (!fresh.proposal || !sameValue(fresh.proposal, proposal)) throw new Error('The proposed schedule changed. Request a fresh local preview.');
  const next = confirmPlan(fresh.proposal.input, fresh.proposal.plan, confirmed, confirmed.id);
  return sessionSchema.parse({ ...structuredClone(session), input: next.input, draftOrder: next.plan.order, confirmed: next, assistant: { tripId: null, baseId: next.id, progress }, updatedAt: new Date().toISOString() });
}
