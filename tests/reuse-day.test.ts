import { expect, it } from 'vitest';
import { cities, defaultInput } from '../fixtures/cities';
import type { TripSession } from '../packages/contracts/src';
import type { ReuseDay } from '../packages/contracts/src/reuse-day';
import { reuseDaySchema } from '../packages/contracts/src/reuse-day';
import { reusedDraft } from '../packages/domain/src/reuse-day';
import { generatePlan, scheduleOrder } from '../packages/domain/src/planner';
import { confirmPlan } from '../packages/domain/src/versioning';
import { reportLocalDay, reportLocalReturn } from '../packages/domain/src/local-day';
import { recordExpense } from '../packages/domain/src/expenses';

const options = (patch: Partial<ReuseDay> = {}): ReuseDay => ({ basis: 'accepted', title: 'Another family day', date: '2026-10-15', startTime: '09:00', endTime: '18:00', keepOrder: true, ...patch });
function source(city = cities[0]): TripSession {
  const input = { ...defaultInput(city), date: '2026-10-11', dietaryRules: ['no_onion'] as TripSession['input']['dietaryRules'] }, result = generatePlan(input, city); if (result.outcome !== 'feasible') throw new Error(JSON.stringify(result));
  return { schemaVersion: 1, id: crypto.randomUUID(), title: 'Original day', input, confirmed: confirmPlan(input, result.plan, null, null), draftOrder: null, updatedAt: new Date().toISOString() };
}
it('reuses completed-day preferences/order without transferring confirmation, reports, expenses or connection', () => {
  const original = source(); original.expenses = recordExpense(original.confirmed!, undefined, { category: 'food', status: 'actual', amountMinor: 20000, confirmedId: original.confirmed!.id, updatedAt: new Date().toISOString() });
  const reported = reportLocalDay(original, cities[0], original.confirmed!.plan.stops.length, 0), done = reportLocalReturn(reported, cities[0], '2026-10-11', '17:00', () => Date.parse('2026-10-12T12:00Z')), before = structuredClone(done);
  const next = reusedDraft(done, cities[0], options()); expect(next.id).not.toBe(done.id); expect(next.confirmed).toBeNull(); expect(next.assistant).toBeUndefined(); expect(next.completion).toBeUndefined(); expect(next.expenses).toBeUndefined(); expect(next.draftOrder).toEqual(done.confirmed!.plan.order); expect(next.input.dietaryRules).toEqual(['no_onion']); expect(next.input.date).toBe('2026-10-15'); expect(done).toEqual(before);
  next.input.dietaryRules.push('vegan'); next.draftOrder!.pop(); expect(done).toEqual(before);
});
it('makes accepted and unaccepted draft preference/order selection explicit in USD', () => {
  const day = source(cities[1]); day.input = { ...day.input, adults: 1, childAges: [4], budgetBasis: 'per_person', budgetMinor: 20000, dietaryRules: ['vegan'], pace: 'packed' }; day.draftOrder = [`${cities[1].id}-gallery`, `${cities[1].id}-cafe`];
  const accepted = reusedDraft(day, cities[1], options()), draft = reusedDraft(day, cities[1], options({ basis: 'draft' }));
  expect(accepted.input.dietaryRules).toEqual(['no_onion']); expect(draft.input.dietaryRules).toEqual(['vegan']); expect(draft.input.childAges).toEqual([4]); expect(draft.input.budgetBasis).toBe('per_person'); expect(draft.input.currency).toBe('USD'); expect(draft.draftOrder).toEqual(day.draftOrder); expect(accepted.draftOrder).toEqual(day.confirmed!.plan.order);
});
it('can discard retired saved order references without inventing replacements or discarding hard preferences', () => {
  const day = source(), retired = day.confirmed!.plan.order.find(id => cities[0].places.find(place => place.id === id)?.category !== 'food')!, city = { ...cities[0], places: cities[0].places.filter(place => place.id !== retired) };
  expect(() => reusedDraft(day, city, options())).toThrow('retired places'); expect(reusedDraft(day, city, options({ keepOrder: false })).draftOrder).toBeNull();
  day.confirmed!.input.mustVisitIds = [retired]; expect(() => reusedDraft(day, city, options({ keepOrder: false }))).toThrow('does not belong');
  expect(() => reusedDraft(source(), cities[1], options())).toThrow('different city');
});
it('validates name/date/window/DST and does not assume an accepted basis exists for a draft-only source', () => {
  const day = source(); for (const value of [options({ title: ' ' }), options({ date: '2026-02-30' }), { ...options(), completion: true }]) expect(reuseDaySchema.safeParse(value).success).toBe(false);
  expect(() => reusedDraft(day, cities[0], options({ startTime: '18:00', endTime: '09:00' }))).toThrow('End time');
  expect(() => reusedDraft(source(cities[1]), cities[1], options({ date: '2026-11-01', startTime: '01:30' }))).toThrow('ambiguous');
  const onlyDraft = { ...day, confirmed: null }; expect(() => reusedDraft(onlyDraft, cities[0], options())).toThrow('no accepted preferences'); expect(reusedDraft(onlyDraft, cities[0], options({ basis: 'draft' })).draftOrder).toBeNull();
});
it('keeps the new day unconfirmed and lets fresh scheduling reject copied choices that cannot fit', () => {
  const next = reusedDraft(source(), cities[0], options({ startTime: '09:00', endTime: '10:00' })); expect(next.confirmed).toBeNull(); expect(scheduleOrder(next.input, cities[0], next.draftOrder!).outcome).not.toBe('feasible');
  const fresh = reusedDraft(source(), cities[0], options({ keepOrder: false, title: '  Fresh selection  ' })); expect(fresh.title).toBe('Fresh selection'); expect(generatePlan(fresh.input, cities[0]).outcome).toBe('feasible'); expect(fresh.confirmed).toBeNull();
});
