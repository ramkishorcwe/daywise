import type { TripSession, ConfirmedPlan } from '../../contracts/src';
import { sameValue } from './versioning';

export function matchingProgress(confirmed: ConfirmedPlan, workspace: TripSession['assistant']) {
  const progress = workspace?.progress;
  return workspace?.baseId === confirmed.id && progress && progress.completedCount <= confirmed.plan.stops.length ? progress : null;
}
// Resuming is reading an accepted snapshot, never a fresh calculation or approval.
export function resumeSnapshot(session: TripSession) {
  if (!session.confirmed) return null;
  const progress = matchingProgress(session.confirmed, session.assistant);
  const unchanged = sameValue(session.input, session.confirmed.input) && (session.draftOrder === null || sameValue(session.draftOrder, session.confirmed.plan.order));
  return progress?.revision || unchanged ? structuredClone(session.confirmed.plan) : null;
}
export function dayPosition(confirmed: ConfirmedPlan, workspace: TripSession['assistant']) {
  const progress = matchingProgress(confirmed, workspace);
  const completedCount = progress?.completedCount ?? 0;
  return { completedCount, progress, completed: confirmed.plan.stops.slice(0, completedCount), next: confirmed.plan.stops[completedCount] ?? null, returnRemaining: completedCount === confirmed.plan.stops.length };
}
