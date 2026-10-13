import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { cities, defaultInput } from '../fixtures/cities';
import { sessionSchema, type TripSession } from '../packages/contracts/src';
import { backupByteLimit } from '../packages/contracts/src/backup';
import { generatePlan } from '../packages/domain/src/planner';
import { confirmPlan } from '../packages/domain/src/versioning';
import { makeDayBackup, encodeDayBackup, readDayBackup, restoredDay } from '../packages/domain/src/backup';
import { expenseSummary, recordExpense } from '../packages/domain/src/expenses';
import { replan, progressReadyAt } from '../packages/domain/src/replan';
import { dayPosition, resumeSnapshot } from '../packages/domain/src/day-view';

function day(city = cities[0]): TripSession {
  const input = defaultInput(city), result = generatePlan(input, city); if (result.outcome !== 'feasible') throw new Error('Feasible test baseline required.');
  return { schemaVersion: 1, id: randomUUID(), title: `A day in ${city.name}`, input, draftOrder: null, confirmed: confirmPlan(input, result.plan, null, null), updatedAt: new Date().toISOString() };
}
it('round-trips the draft, accepted snapshot and both current/stale expenses as a separate day', () => {
  const source = day(), original = structuredClone(source), confirmed = source.confirmed!;
  source.input = { ...source.input, budgetMinor: source.input.budgetMinor + 100 };
  source.draftOrder = confirmed.plan.order.slice(1);
  source.expenses = recordExpense(confirmed, undefined, { category: 'tickets', status: 'actual', amountMinor: 12345, confirmedId: confirmed.id, updatedAt: new Date().toISOString() });
  source.expenses.records.push({ category: 'food', status: 'booked', amountMinor: 123, confirmedId: randomUUID(), updatedAt: new Date().toISOString() });
  const backup = readDayBackup(encodeDayBackup(makeDayBackup(source, cities[0])), cities), restored = restoredDay(backup, cities[0]);
  expect(restored.id).not.toBe(source.id); expect(restored.title).toContain('(restored)'); expect(restored.input).toEqual(source.input); expect(restored.draftOrder).toEqual(source.draftOrder); expect(restored.confirmed).toEqual(confirmed); expect(restored.expenses).toEqual(source.expenses);
  expect(expenseSummary(restored.confirmed!, restored.expenses).actual).toBe(12345); expect(expenseSummary(restored.confirmed!, restored.expenses).needsReview).toHaveLength(1);
  restored.input.adults++; expect(source.input.adults).toBe(original.input.adults);
});
it('preserves accepted delay times and progress while removing the backend workspace identity', () => {
  const source = day(), previous = source.confirmed!, remoteId = randomUUID();
  const progress = { revision: 1, completedCount: 1, readyAt: new Date(progressReadyAt(previous.plan, 1, 30)).toISOString() };
  const result = replan(source.input, cities[0], previous.plan, progress); if (result.outcome !== 'feasible') throw new Error('Feasible test revision required.');
  source.confirmed = confirmPlan(source.input, result.plan, previous, previous.id); source.draftOrder = result.plan.order; source.assistant = { tripId: remoteId, baseId: source.confirmed.id, progress };
  const text = encodeDayBackup(makeDayBackup(source, cities[0])); expect(text).not.toContain(remoteId);
  const restored = restoredDay(readDayBackup(text, cities), cities[0]); expect(restored.assistant!.tripId).toBeNull(); expect(dayPosition(restored.confirmed!, restored.assistant).completedCount).toBe(1); expect(resumeSnapshot(restored)).toEqual(result.plan);
  expect(source.assistant.tripId).toBe(remoteId);
});
it('drops an unstarted workspace and supports draft-only backups and independent currencies', () => {
  for (const city of cities) {
    const source = day(city); source.assistant = { tripId: randomUUID(), baseId: source.confirmed!.id, progress: { revision: 0, completedCount: 0, readyAt: new Date(source.confirmed!.plan.startMs).toISOString() } };
    expect(makeDayBackup(source, city).session.assistant).toBeUndefined();
    source.confirmed = null; source.assistant = undefined;
    const restored = restoredDay(readDayBackup(encodeDayBackup(makeDayBackup(source, city)), cities), city); expect(restored.confirmed).toBeNull(); expect(restored.input.currency).toBe(city.currency);
  }
});
it('rejects unsupported, oversized, future-version, connected and unrelated files without changing the source', () => {
  const source = day(), original = structuredClone(source), backup = makeDayBackup(source, cities[0]);
  const invalid = [ 'not JSON', '<html>travel copy</html>', JSON.stringify({ scope: 'browser-budget' }), JSON.stringify({ ...backup, formatVersion: 2 }), JSON.stringify({ ...backup, token: 'must-not-import' }), JSON.stringify({ ...backup, session: { ...backup.session, assistant: { tripId: randomUUID(), baseId: source.confirmed!.id } } }) ];
  for (const text of invalid) expect(() => readDayBackup(text, cities)).toThrow('supported Daywise');
  expect(() => readDayBackup('x'.repeat(backupByteLimit + 1), cities)).toThrow('1 MiB');
  expect(() => readDayBackup(encodeDayBackup(backup), [cities[1]])).toThrow('city is not supported'); expect(source).toEqual(original);
});
it('rejects cross-city IDs, currency/timezone mismatch and a corrupt travel sequence', () => {
  const original = makeDayBackup(day(), cities[0]);
  const mutations = [
    (value: typeof original) => { value.session.input.startAnchorId = cities[1].anchors[0].id; },
    (value: typeof original) => { value.session.draftOrder = [cities[1].places[0].id]; },
    (value: typeof original) => { value.session.confirmed!.plan.timezone = cities[1].timezone; },
    (value: typeof original) => { value.session.confirmed!.plan.stops[0].incomingLeg.fromId = cities[1].anchors[0].id; },
    (value: typeof original) => { value.session.confirmed!.plan.returnLeg.toId = cities[1].anchors[0].id; },
    (value: typeof original) => { value.session.input.currency = 'USD'; },
    (value: typeof original) => { value.session.confirmed!.plan.order.reverse(); },
  ];
  for (const mutate of mutations) { const value = structuredClone(original); mutate(value); expect(() => readDayBackup(JSON.stringify(value), cities)).toThrow(); }
});
it('accepts old catalogs only when references are still supported and validates detached progress', () => {
  const source = day(); source.confirmed!.plan.catalogVersion = 'fixture-older'; const backup = makeDayBackup(source, cities[0]); expect(readDayBackup(encodeDayBackup(backup), cities).session.confirmed!.plan.catalogVersion).toBe('fixture-older');
  const progress = { revision: 1, completedCount: 1, readyAt: new Date(source.confirmed!.plan.stops[0].departureMs).toISOString() };
  expect(sessionSchema.safeParse({ ...source, assistant: { tripId: null, baseId: source.confirmed!.id, progress } }).success).toBe(true);
  for (const workspace of [{ tripId: null, baseId: randomUUID(), progress }, { tripId: null, baseId: source.confirmed!.id }, { tripId: null, baseId: source.confirmed!.id, progress: { ...progress, completedCount: 12 } }, { tripId: null, baseId: source.confirmed!.id, progress: { ...progress, readyAt: new Date(source.confirmed!.plan.startMs).toISOString() } }]) expect(sessionSchema.safeParse({ ...source, assistant: workspace }).success).toBe(false);
  for (const completedCount of [-1, 1.5, 13]) expect(sessionSchema.safeParse({ ...source, assistant: { tripId: null, baseId: source.confirmed!.id, progress: { ...progress, completedCount } } }).success).toBe(false);
});
