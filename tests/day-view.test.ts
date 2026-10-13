import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { cities, defaultInput } from '../fixtures/cities';
import { generatePlan } from '../packages/domain/src/planner';
import { confirmPlan } from '../packages/domain/src/versioning';
import { replan, progressReadyAt } from '../packages/domain/src/replan';
import { resumeSnapshot, dayPosition } from '../packages/domain/src/day-view';
import type { TripSession } from '../packages/contracts/src';

function session(): TripSession {
  const input = defaultInput(cities[0]), result = generatePlan(input, cities[0]);
  if (result.outcome !== 'feasible') throw new Error('A test baseline is required.');
  return { schemaVersion: 1, id: randomUUID(), title: 'Synthetic saved day', input, draftOrder: null, confirmed: confirmPlan(input, result.plan, null, null), updatedAt: new Date().toISOString() };
}
it('restores the exact accepted delay revision including completed times and shifted remaining times', () => {
  const value = session(), baseline = value.confirmed!;
  const progress = { revision: 1, completedCount: 1, readyAt: new Date(progressReadyAt(baseline.plan, 1, 30)).toISOString() };
  const revision = replan(value.input, cities[0], baseline.plan, progress);
  if (revision.outcome !== 'feasible') throw new Error('A feasible test revision is required.');
  value.confirmed = confirmPlan(value.input, revision.plan, baseline, baseline.id); value.draftOrder = revision.plan.order;
  value.assistant = { tripId: randomUUID(), baseId: value.confirmed.id, progress };
  expect(resumeSnapshot(value)).toEqual(revision.plan); expect(resumeSnapshot(value)!.stops[0]).toEqual(baseline.plan.stops[0]);
  expect(revision.plan.finishMs).not.toBe(baseline.plan.finishMs);
});
it('preserves historical confirmation as a copy and leaves unaccepted draft calculations separate', () => {
  const value = session(); const restored = resumeSnapshot(value)!; restored.stops[0].name = 'Changed returned copy';
  expect(value.confirmed!.plan.stops[0].name).not.toBe('Changed returned copy');
  value.input = { ...value.input, budgetMinor: value.input.budgetMinor + 100 }; expect(resumeSnapshot(value)).toBeNull();
  expect(dayPosition(value.confirmed!, value.assistant).next).toEqual(value.confirmed!.plan.stops[0]);
});
it('requires reported progress rather than the clock and keeps meals/rest in the completed prefix', () => {
  const value = session(), confirmed = value.confirmed!;
  expect(dayPosition(confirmed, undefined).completedCount).toBe(0);
  const rest = confirmed.plan.stops.findIndex(stop => stop.kind === 'break'); expect(rest).toBeGreaterThan(-1);
  const workspace = { tripId: randomUUID(), baseId: confirmed.id, progress: { revision: 1, completedCount: rest, readyAt: new Date(confirmed.plan.startMs).toISOString() } };
  expect(dayPosition(confirmed, workspace).next!.kind).toBe('break');
  workspace.progress.completedCount = confirmed.plan.stops.length;
  expect(dayPosition(confirmed, workspace)).toMatchObject({ next: null, returnRemaining: true });
  expect(dayPosition(confirmed, workspace).completed).toHaveLength(confirmed.plan.stops.length);
});
it('does not apply progress from another confirmation or past the accepted timeline', () => {
  const value = session(), confirmed = value.confirmed!;
  const workspace = { tripId: randomUUID(), baseId: randomUUID() as string, progress: { revision: 1, completedCount: 1, readyAt: new Date().toISOString() } };
  expect(dayPosition(confirmed, workspace).completedCount).toBe(0);
  workspace.baseId = confirmed.id; workspace.progress.completedCount = confirmed.plan.stops.length + 1;
  expect(dayPosition(confirmed, workspace).completedCount).toBe(0);
});
