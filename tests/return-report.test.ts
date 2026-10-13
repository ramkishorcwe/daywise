import { expect, it } from 'vitest';
import { cities, defaultInput } from '../fixtures/cities';
import { sessionSchema, type TripSession } from '../packages/contracts/src';
import { generatePlan } from '../packages/domain/src/planner';
import { confirmPlan } from '../packages/domain/src/versioning';
import { acceptLocalDay, previewLocalDay, reportLocalDay, reportLocalReturn } from '../packages/domain/src/local-day';
import { makeDayBackup, restoredDay } from '../packages/domain/src/backup';
import { recordExpense } from '../packages/domain/src/expenses';
import { travelCopy, travelCopyHtml } from '../packages/domain/src/travel-copy';

const clock = () => Date.parse('2026-10-14T12:00:00Z');
function day(city = cities[0]): TripSession {
  const input = { ...defaultInput(city), date: '2026-10-12' }, result = generatePlan(input, city); if (result.outcome !== 'feasible') throw new Error(JSON.stringify(result));
  return { schemaVersion: 1, id: crypto.randomUUID(), title: 'A private day', input, confirmed: confirmPlan(input, result.plan, null, null), draftOrder: null, updatedAt: new Date().toISOString() };
}
function all(city = cities[0]) { const source = day(city); return reportLocalDay(source, city, source.confirmed!.plan.stops.length, 0); }
it('requires every reported stop, then preserves the snapshot/progress and locks local revisions', () => {
  expect(() => reportLocalReturn(day(), cities[0], '2026-10-12', '17:00', clock)).toThrow('every itinerary stop');
  const source = all(), proposal = previewLocalDay(source, cities[0]).proposal!, done = reportLocalReturn(source, cities[0], '2026-10-12', '17:00', clock);
  expect(done.confirmed).toEqual(source.confirmed); expect(done.assistant).toEqual(source.assistant); expect(source.completion).toBeUndefined(); expect(done.completion?.source).toBe('user_reported_unverified');
  expect(() => reportLocalDay(done, cities[0], done.confirmed!.plan.stops.length, 0)).toThrow('Return has been reported');
  expect(() => previewLocalDay(done, cities[0])).toThrow('Return has been reported'); expect(() => acceptLocalDay(done, cities[0], proposal)).toThrow('Return has been reported');
});
it('rejects future/before-departure/invalid and ambiguous times while accepting a late next-day return', () => {
  const source = all();
  expect(() => reportLocalReturn(source, cities[0], '2026-10-12', '09:00', clock)).toThrow('before your last');
  expect(() => reportLocalReturn(source, cities[0], '2026-10-15', '17:00', clock)).toThrow('future');
  for (const [date, time] of [['2026-02-30', '17:00'], ['2026-10-12', '25:00'], ['2026-10-12', '']]) expect(() => reportLocalReturn(source, cities[0], date, time, clock)).toThrow('valid, unambiguous');
  const done = reportLocalReturn(all(cities[1]), cities[1], '2026-10-13', '00:15', clock); expect(done.completion?.arrivedAt).toBe('2026-10-13T04:15:00.000Z');
  expect(() => reportLocalReturn(all(cities[1]), cities[1], '2026-11-01', '01:30', () => Date.parse('2026-11-02T12:00Z'))).toThrow('unambiguous');
});
it('refuses backend/unaccepted contexts but does not renew an old catalog to record a return', () => {
  const source = all();
  expect(() => reportLocalReturn({ ...source, assistant: { ...source.assistant!, tripId: crypto.randomUUID() } }, cities[0], '2026-10-12', '17:00', clock)).toThrow('backend workspace');
  expect(() => reportLocalReturn({ ...source, input: { ...source.input, pace: 'relaxed' } }, cities[0], '2026-10-12', '17:00', clock)).toThrow('Unaccepted');
  const done = reportLocalReturn(source, { ...cities[0], catalogVersion: 'fixture-new' }, '2026-10-12', '17:00', clock); expect(done.confirmed!.plan.catalogVersion).toBe(source.confirmed!.plan.catalogVersion);
});
it('backs up completed days and corrects only the return report, leaving expenses and public copies independent', () => {
  const source = all(); source.expenses = recordExpense(source.confirmed!, undefined, { category: 'food', status: 'actual', amountMinor: 20000, confirmedId: source.confirmed!.id, updatedAt: new Date().toISOString() });
  const done = reportLocalReturn(source, cities[0], '2026-10-12', '17:47', clock), restored = restoredDay(makeDayBackup(done, cities[0]), cities[0]);
  expect(restored.id).not.toBe(done.id); expect(restored.completion).toEqual(done.completion); expect(restored.expenses).toEqual(done.expenses);
  const corrected = reportLocalReturn(restored, cities[0], '2026-10-12', '17:50', clock); expect(corrected.confirmed).toEqual(done.confirmed); expect(corrected.assistant).toEqual(done.assistant); expect(corrected.expenses).toEqual(done.expenses); expect(corrected.completion?.arrivedAt).not.toBe(done.completion?.arrivedAt);
  expect(travelCopyHtml(travelCopy(corrected.confirmed!, cities[0]))).not.toContain('17:50');
});
it('validates completion references, chronological bounds and source without requiring old records to migrate', () => {
  const source = all(), done = reportLocalReturn(source, cities[0], '2026-10-12', '17:00', clock); expect(sessionSchema.safeParse(source).success).toBe(true);
  const report = done.completion!;
  for (const completion of [{ ...report, confirmedId: crypto.randomUUID() }, { ...report, source: 'gps' }, { ...report, arrivedAt: '2026-10-12T00:00:00Z' }, { ...report, arrivedAt: '2026-10-15T12:00:00Z' }, { ...report, extra: true }]) expect(sessionSchema.safeParse({ ...done, completion }).success).toBe(false);
  expect(sessionSchema.safeParse({ ...done, assistant: { ...done.assistant!, progress: { ...done.assistant!.progress!, completedCount: 1 } } }).success).toBe(false);
});
