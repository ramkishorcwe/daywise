import { describe, expect, it } from 'vitest';
import { cities, defaultInput } from '../fixtures/cities';
import type { TripInput, TripSession } from '../packages/contracts/src';
import { generatePlan } from '../packages/domain/src/planner';
import { confirmPlan } from '../packages/domain/src/versioning';
import { acceptLocalDay, previewLocalDay, reportLocalDay } from '../packages/domain/src/local-day';
import { expenseSummary, recordExpense } from '../packages/domain/src/expenses';
import { makeDayBackup, restoredDay } from '../packages/domain/src/backup';
import { localDayChangeSchema } from '../packages/contracts/src/local-day';

function day(city = cities[0], preferences: Partial<TripInput> = {}): TripSession {
  const input = { ...defaultInput(city), ...preferences, date: '2026-10-12' }, result = generatePlan(input, city);
  if (result.outcome !== 'feasible') throw new Error(JSON.stringify(result));
  return { schemaVersion: 1, id: crypto.randomUUID(), title: 'A private day', input, confirmed: confirmPlan(input, result.plan, null, null), draftOrder: null, updatedAt: new Date().toISOString() };
}
describe('local reported progress and accepted revisions', () => {
  it('records only a growing prefix and cannot move departure backwards or accept fractional reports', () => {
    const source = day(), reported = reportLocalDay(source, cities[0], 1, 30);
    expect(reported.confirmed).toEqual(source.confirmed); expect(reported.assistant?.tripId).toBeNull(); expect(reported.assistant?.progress?.completedCount).toBe(1);
    for (const [count, delay] of [[0, 30], [1, 0], [-1, 30], [1.5, 30], [1, -1], [1, 181], [1, 0.5], [13, 0]]) expect(() => reportLocalDay(reported, cities[0], count, delay)).toThrow();
    expect(reportLocalDay(reported, cities[0], 1, 40).assistant?.progress?.revision).toBe(2);
  });
  it('previews without accepting or compounding lateness, with exact completed stops retained', () => {
    const source = reportLocalDay(day(), cities[0], 1, 30), before = structuredClone(source);
    const first = previewLocalDay(source, cities[0]), second = previewLocalDay(source, cities[0]);
    expect(first).toEqual(second); expect(source).toEqual(before); expect(first.proposal).toBeDefined();
    expect(first.proposal!.plan.stops[0]).toEqual(source.confirmed!.plan.stops[0]);
    expect(first.proposal!.plan.stops[1].arrivalMs).toBe(source.confirmed!.plan.stops[1].arrivalMs + 30 * 60000);
    expect(first.proposal!.plan.total[1]).toBeLessThanOrEqual(first.proposal!.plan.budgetLimit);
  });
  it('accepts a fresh version, protects progress and rejects stale or tampered schedules', () => {
    const source = reportLocalDay(day(), cities[0], 1, 30), proposal = previewLocalDay(source, cities[0]).proposal!;
    const accepted = acceptLocalDay(source, cities[0], proposal);
    expect(accepted.confirmed!.id).not.toBe(source.confirmed!.id); expect(accepted.assistant?.baseId).toBe(accepted.confirmed!.id); expect(accepted.assistant?.progress).toEqual(source.assistant?.progress);
    expect(accepted.confirmed!.plan.stops[0]).toEqual(source.confirmed!.plan.stops[0]);
    expect(() => acceptLocalDay(accepted, cities[0], proposal)).toThrow('stale');
    expect(() => acceptLocalDay(reportLocalDay(source, cities[0], 1, 40), cities[0], proposal)).toThrow('stale');
    expect(() => acceptLocalDay(source, cities[0], { ...proposal, plan: { ...proposal.plan, finishMs: proposal.plan.finishMs + 60000 } })).toThrow('schedule changed');
  });
  it('keeps reported facts and the original confirmation when the remaining return cannot fit', () => {
    const original = day(), source = reportLocalDay(original, cities[0], original.confirmed!.plan.stops.length, 180);
    expect(previewLocalDay(source, cities[0]).issues?.length).toBeGreaterThan(0); expect(source.confirmed).toEqual(original.confirmed);
    expect(source.assistant?.progress?.completedCount).toBe(original.confirmed!.plan.stops.length);
  });
  it('refuses connected workspaces, unsupported catalogs, unaccepted edits and missing confirmations', () => {
    const source = day();
    expect(() => reportLocalDay({ ...source, assistant: { tripId: crypto.randomUUID(), baseId: source.confirmed!.id } }, cities[0], 0, 0)).toThrow('backend workspace');
    expect(() => reportLocalDay(source, { ...cities[0], catalogVersion: 'new-catalog' }, 0, 0)).toThrow('older catalog');
    expect(() => reportLocalDay({ ...source, input: { ...source.input, pace: 'relaxed' } }, cities[0], 0, 0)).toThrow('Unaccepted');
    expect(() => reportLocalDay({ ...source, confirmed: null }, cities[0], 0, 0)).toThrow('Confirm a day');
    expect(() => previewLocalDay(source, cities[0])).toThrow('Record local progress');
  });
  it('preserves expense records and marks old amounts for review after confirmation changes', () => {
    const source = day(); source.expenses = recordExpense(source.confirmed!, undefined, { category: 'food', status: 'actual', amountMinor: 20000, confirmedId: source.confirmed!.id, updatedAt: new Date().toISOString() });
    const reported = reportLocalDay(source, cities[0], 1, 30), accepted = acceptLocalDay(reported, cities[0], previewLocalDay(reported, cities[0]).proposal!);
    expect(accepted.expenses).toEqual(source.expenses); expect(expenseSummary(accepted.confirmed!, accepted.expenses).needsReview).toHaveLength(1);
  });
  it('works in USD and allows a valid restored offline report to continue without a backend connection', () => {
    const city = cities[1], source = reportLocalDay(day(city), city, 1, 30), restored = restoredDay(makeDayBackup(source, city), city);
    const proposal = previewLocalDay(restored, city).proposal!; expect(proposal.plan.currency).toBe('USD'); expect(proposal.plan.timezone).toBe(city.timezone);
    const next = acceptLocalDay(restored, city, proposal); expect(next.assistant?.tripId).toBeNull(); expect(next.confirmed!.plan.stops[0]).toEqual(source.confirmed!.plan.stops[0]);
    expect(makeDayBackup(next, city).session.assistant?.progress).toEqual(source.assistant?.progress);
  });
  it('skips only the chosen remaining optional visit without changing requirements or progress', () => {
    const source = reportLocalDay(day(), cities[0], 1, 0), before = structuredClone(source);
    const target = source.confirmed!.plan.stops.find((stop, index) => index >= 1 && stop.kind === 'visit')!.placeId!;
    const proposal = previewLocalDay(source, cities[0], { kind: 'skip', placeId: target }).proposal!;
    expect(proposal.plan.order).not.toContain(target); expect(proposal.input.excludedPlaceIds).toContain(target);
    expect({ ...proposal.input, excludedPlaceIds: [] }).toEqual({ ...source.input, excludedPlaceIds: [] });
    expect(source).toEqual(before); expect(proposal.plan.stops[0]).toEqual(source.confirmed!.plan.stops[0]);
    const accepted = acceptLocalDay(source, cities[0], proposal); expect(accepted.input.excludedPlaceIds).toContain(target); expect(accepted.assistant?.progress).toEqual(source.assistant?.progress);
    expect(accepted.confirmed!.plan.stops.some(stop => stop.kind === 'meal')).toBe(true); expect(accepted.confirmed!.plan.stops.some(stop => stop.kind === 'break')).toBe(true);
    expect(makeDayBackup(accepted, cities[0]).session.confirmed!.plan.order).not.toContain(target);
  });
  it('rejects skips of completed or required visits, food, breaks and foreign/unknown places', () => {
    const base = day(), plan = base.confirmed!.plan;
    const required = plan.stops.find((stop, index) => index > 0 && stop.kind === 'visit')!.placeId!;
    base.input.mustVisitIds = [required]; base.confirmed!.input.mustVisitIds = [required];
    const source = reportLocalDay(base, cities[0], 1, 0);
    for (const id of [plan.stops[0].placeId!, required, plan.stops.find(stop => stop.kind === 'meal')!.placeId!, plan.stops.find(stop => stop.kind === 'break')!.id, 'harbor-test-museum', 'missing-place']) expect(() => previewLocalDay(source, cities[0], { kind: 'skip', placeId: id })).toThrow('optional remaining');
  });
  it('applies a new pace only to remaining visits and rest while retaining all strict constraints', () => {
    const source = reportLocalDay(day(), cities[0], 2, 0), proposal = previewLocalDay(source, cities[0], { kind: 'pace', pace: 'relaxed' }).proposal!;
    expect(proposal.plan.stops.slice(0, 2)).toEqual(source.confirmed!.plan.stops.slice(0, 2));
    expect(proposal.plan.stops[2].kind).toBe('break'); expect(proposal.plan.stops[2].durationMinutes).toBe(20);
    expect({ ...proposal.input, pace: source.input.pace }).toEqual(source.input); expect(proposal.changes[0]).toContain('remaining pace from balanced to relaxed');
    expect(proposal.plan.total[1]).toBeLessThanOrEqual(proposal.plan.budgetLimit);
    const accepted = acceptLocalDay(source, cities[0], proposal); expect(accepted.input.pace).toBe('relaxed'); expect(accepted.assistant?.progress).toEqual(source.assistant?.progress);
    expect(() => previewLocalDay(accepted, cities[0], { kind: 'pace', pace: 'relaxed' })).toThrow('different pace');
    const finished = reportLocalDay(day(), cities[0], source.confirmed!.plan.stops.length, 0);
    expect(() => previewLocalDay(finished, cities[0], { kind: 'pace', pace: 'packed' })).toThrow('All stops are complete');
  });
  it('does not grant arbitrary preference edits through a local change or tampered proposal', () => {
    for (const value of [{ kind: 'skip', placeId: 'museum', budgetMinor: 100000000 }, { kind: 'pace', pace: 'fast' }, { kind: 'delay', dietaryRules: [] }, { kind: 'closure', placeId: 'museum' }, { kind: 'skip', placeId: '' }]) expect(localDayChangeSchema.safeParse(value).success).toBe(false);
    const source = reportLocalDay(day(), cities[0], 1, 0), proposal = previewLocalDay(source, cities[0], { kind: 'pace', pace: 'relaxed' }).proposal!;
    expect(() => acceptLocalDay(source, cities[0], { ...proposal, input: { ...proposal.input, dietaryRules: [] } })).toThrow('schedule changed');
    expect(() => acceptLocalDay(source, cities[0], { ...proposal, change: { kind: 'pace', pace: 'packed' } })).toThrow('schedule changed');
  });
  it('replaces exactly the selected pending meal while preserving preferences, progress and completed stops', () => {
    const source = reportLocalDay(day(), cities[0], 1, 0), before = structuredClone(source), current = source.confirmed!.plan.stops.find(stop => stop.kind === 'meal')!;
    const target = cities[0].places.find(place => place.category === 'food' && place.id !== current.placeId)!;
    const proposal = previewLocalDay(source, cities[0], { kind: 'meal', placeId: target.id }).proposal!;
    expect(proposal.plan.stops.filter(stop => stop.kind === 'meal').map(stop => stop.placeId)).toEqual([target.id]);
    expect(proposal.input).toEqual(source.input); expect(proposal.plan.stops[0]).toEqual(source.confirmed!.plan.stops[0]); expect(source).toEqual(before);
    const accepted = acceptLocalDay(source, cities[0], proposal); expect(accepted.assistant?.progress).toEqual(source.assistant?.progress); expect(makeDayBackup(accepted, cities[0]).session.confirmed!.plan.order).toContain(target.id);
    expect(() => acceptLocalDay(accepted, cities[0], proposal)).toThrow('stale');
  });
  it('cannot replace completed or required meals, pick the existing meal, or choose a foreign/non-food place', () => {
    const base = day(), mealIndex = base.confirmed!.plan.stops.findIndex(stop => stop.kind === 'meal'), meal = base.confirmed!.plan.stops[mealIndex].placeId!;
    const target = cities[0].places.find(place => place.category === 'food' && place.id !== meal)!.id;
    const completed = reportLocalDay(base, cities[0], mealIndex + 1, 0);
    expect(() => previewLocalDay(completed, cities[0], { kind: 'meal', placeId: target })).toThrow('no remaining meal');
    const required = structuredClone(base); required.input.mustVisitIds = [meal]; required.confirmed!.input.mustVisitIds = [meal];
    expect(() => previewLocalDay(reportLocalDay(required, cities[0], 0, 0), cities[0], { kind: 'meal', placeId: target })).toThrow('must-visit');
    for (const id of [meal, 'harbor-test-kitchen', 'jaipur-test-gallery', 'missing-meal']) expect(() => previewLocalDay(reportLocalDay(base, cities[0], 0, 0), cities[0], { kind: 'meal', placeId: id })).toThrow('different meal');
  });
  it('does not relax dietary evidence or silently substitute another meal when the requested one cannot fit', () => {
    const source = reportLocalDay(day(cities[0], { dietaryRules: ['no_onion'] }), cities[0], 1, 0);
    const target = cities[0].places.find(place => place.id === 'jaipur-test-cafe')!;
    const failed = previewLocalDay(source, cities[0], { kind: 'meal', placeId: target.id }); expect(failed.proposal).toBeUndefined(); expect(failed.issues?.join(' ')).toContain('selected test meal lacks evidence'); expect(source.input.dietaryRules).toEqual(['no_onion']);
    const ordinary = reportLocalDay(day(), cities[0], 1, 0), alternate = cities[0].places.find(place => place.category === 'food' && place.id !== ordinary.confirmed!.plan.stops.find(stop => stop.kind === 'meal')!.placeId)!;
    for (const mutation of ['price', 'hours', 'missing', 'route', 'excluded']) {
      const catalog = structuredClone(cities[0]), place = catalog.places.find(place => place.id === alternate.id)!;
      if (mutation === 'price') place.foodCost = [1000000, 1000000];
      if (mutation === 'hours') place.lastAdmission = '09:00';
      if (mutation === 'missing') delete place.foodCost;
      if (mutation === 'route') for (const key of Object.keys(catalog.travel).filter(key => key.endsWith(`|${place.id}`))) delete catalog.travel[key];
      const value = structuredClone(ordinary); if (mutation === 'excluded') { value.input.excludedPlaceIds = [place.id]; value.confirmed!.input.excludedPlaceIds = [place.id]; }
      const result = previewLocalDay(value, catalog, { kind: 'meal', placeId: place.id }); expect(result.proposal).toBeUndefined(); expect(result.issues?.length).toBeGreaterThan(0);
    }
  });
  it('keeps USD meal choices city-scoped and rejects tampered meal actions before saving', () => {
    const city = cities[1], source = reportLocalDay(day(city), city, 1, 0), current = source.confirmed!.plan.stops.find(stop => stop.kind === 'meal')!.placeId;
    const target = city.places.find(place => place.category === 'food' && place.id !== current)!.id, proposal = previewLocalDay(source, city, { kind: 'meal', placeId: target }).proposal!;
    expect(proposal.plan.currency).toBe('USD'); expect(proposal.plan.timezone).toBe(city.timezone);
    expect(() => acceptLocalDay(source, city, { ...proposal, change: { kind: 'delay' } })).toThrow('schedule changed');
    expect(localDayChangeSchema.safeParse({ kind: 'meal', placeId: target, dietaryRules: [] }).success).toBe(false);
  });
});
