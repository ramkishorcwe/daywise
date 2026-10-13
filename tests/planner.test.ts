import { describe, expect, it } from 'vitest';
import { cities, defaultInput } from '../fixtures/cities';
import { planSchema, sessionSchema, type City, type Plan, type TripInput } from '../packages/contracts/src';
import { generatePlan, scheduleOrder } from '../packages/domain/src/planner';
import { confirmPlan, planChanges, sameValue } from '../packages/domain/src/versioning';
import { formatTime, zonedTime } from '../packages/domain/src/time';
import { groupBudget, parseMoney } from '../packages/domain/src/money';

const city = cities[0];
const input = (): TripInput => ({ ...defaultInput(city), date: '2026-10-09' });
function feasible(data = input(), catalog = city): Plan {
  const result = generatePlan(data, catalog);
  if (result.outcome !== 'feasible') throw new Error(JSON.stringify(result));
  return result.plan;
}
function codes(result: ReturnType<typeof generatePlan>) { return result.outcome === 'feasible' ? [] : result.issues.map(issue => issue.code); }

describe('practical day constraints', () => {
  it('includes a meal, a rest break, upper-bound reserve and return travel', () => {
    const plan = feasible();
    expect(plan.stops.some(s => s.kind === 'meal')).toBe(true);
    expect(plan.stops.some(s => s.kind === 'break')).toBe(true);
    expect(plan.finishMs).toBeLessThanOrEqual(zonedTime(input().date, '18:00', city.timezone));
    expect(plan.returnLeg.toId).toBe(input().endAnchorId);
    expect(plan.total[1]).toBeLessThanOrEqual(plan.budgetLimit);
    const subtotal = Object.entries(plan.budget).filter(([key]) => key !== 'reserve').reduce((sum, [, value]) => sum + value[1], 0);
    expect(plan.budget.reserve[1]).toBe(Math.ceil(subtotal / 10));
    expect(planSchema.safeParse(plan).success).toBe(true);
  });
  it('never visits excluded places and preserves a required visit', () => {
    const plan = feasible({ ...input(), mustVisitIds: [`${city.id}-museum`], excludedPlaceIds: [`${city.id}-gallery`] });
    expect(plan.order).toContain(`${city.id}-museum`); expect(plan.order).not.toContain(`${city.id}-gallery`);
  });
  it('rejects conflicting required and excluded choices', () => {
    expect(codes(generatePlan({ ...input(), mustVisitIds: ['jaipur-test-gallery'], excludedPlaceIds: ['jaipur-test-gallery'] }, city))).toContain('CONFLICTING_PLACE');
  });
  it('checks last admission even when a visit would finish before closing', () => {
    const modified = structuredClone(city); modified.places[0].lastAdmission = '08:00';
    expect(codes(scheduleOrder(input(), modified, ['jaipur-test-gallery', 'jaipur-test-kitchen']))).toContain('CLOSING_TIME');
  });
  it('does not treat missing hours as open', () => {
    const modified = structuredClone(city); modified.places[0].opens = null;
    expect(codes(scheduleOrder(input(), modified, ['jaipur-test-gallery', 'jaipur-test-kitchen']))).toContain('HOURS_UNKNOWN');
  });
  it('rejects a day that fits visits but cannot fit the return journey', () => {
    const modified = structuredClone(city);
    modified.travel['jaipur-test-gallery|jaipur-test-stay'].durationMinutes = 300;
    expect(codes(scheduleOrder({ ...input(), endTime: '11:20' }, modified, ['jaipur-test-gallery']))).toContain('END_TIME');
  });
  it('cannot claim a zero budget fits unknown or positive costs', () => { expect(generatePlan({ ...input(), budgetMinor: 0 }, city).outcome).not.toBe('feasible'); });
  it('keeps unknown child ticket costs out of a complete budget', () => {
    const modified = structuredClone(city); modified.places[0].childCost = null;
    expect(codes(scheduleOrder({ ...input(), childAges: [4] }, modified, ['jaipur-test-gallery', 'jaipur-test-kitchen']))).toContain('COST_UNKNOWN');
  });
  it('uses adult tickets for children above the fixture eligibility age', () => {
    const plan = scheduleOrder({ ...input(), childAges: [15] }, city, ['jaipur-test-gallery', 'jaipur-test-kitchen']);
    expect(plan.outcome).toBe('feasible');
    if (plan.outcome === 'feasible') expect(plan.plan.budget.tickets).toEqual([60000, 60000]);
  });
  it('applies per-person budget to the full party', () => { expect(groupBudget({ ...input(), adults: 2, childAges: [4, 8], budgetBasis: 'per_person', budgetMinor: 125000 })).toBe(500000); });
  it('sums transport for the entire group once, including return', () => {
    const plan = feasible({ ...input(), childAges: [4, 8] });
    const sum = plan.stops.reduce((value, s) => value + s.incomingLeg.cost[1], 0) + plan.returnLeg.cost[1];
    expect(plan.budget.transport[1]).toBe(sum);
  });
  it('rejects missing travel data instead of inferring a route', () => {
    const modified = structuredClone(city); delete modified.travel['jaipur-test-stay|jaipur-test-gallery'];
    expect(codes(scheduleOrder(input(), modified, ['jaipur-test-gallery', 'jaipur-test-kitchen']))).toContain('ROUTE_UNAVAILABLE');
  });
  it('does not remove lunch just because an edit requests it', () => {
    const plan = feasible(); expect(codes(scheduleOrder(input(), city, plan.order.filter(id => !id.endsWith('kitchen') && !id.endsWith('cafe'))))).toContain('MEAL_REQUIRED');
  });
  it('keeps a must-visit from being dropped by an edit', () => {
    const data = { ...input(), mustVisitIds: ['jaipur-test-gallery'] };
    expect(codes(scheduleOrder(data, city, ['jaipur-test-garden', 'jaipur-test-kitchen']))).toContain('MUST_VISIT_MISSING');
  });
});
describe('strict dietary and mobility evidence', () => {
  it('keeps known non-child-friendly fixture places out of family plans', () => {
    expect(feasible({ ...input(), pace: 'packed', childAges: [4, 8] }).order).not.toContain('jaipur-test-viewpoint');
  });
  it('chooses a meal supporting every Jain restriction individually', () => {
    const plan = feasible({ ...input(), dietaryRules: ['pure_vegetarian', 'no_onion', 'no_garlic', 'no_root_vegetables'] });
    expect(plan.stops.find(s => s.kind === 'meal')?.id).toBe('jaipur-test-kitchen');
  });
  it('reports no match when vegan plus no-onion evidence is unavailable', () => { expect(codes(generatePlan({ ...input(), dietaryRules: ['vegan', 'no_onion'] }, city))).toContain('NO_FOOD_MATCH'); });
  it('excludes unknown step-free evidence rather than certifying it', () => {
    const modified = structuredClone(city); modified.places[0].stepFree = 'unknown';
    const plan = feasible({ ...input(), stepFree: true }, modified); expect(plan.order).not.toContain(modified.places[0].id);
  });
  it('will not silently relax mobility for a required inaccessible place', () => {
    expect(codes(generatePlan({ ...input(), stepFree: true, mustVisitIds: ['jaipur-test-viewpoint'] }, city))).toContain('MUST_VISIT_CONFLICT');
  });
  it('respects the total walking allowance including connectors', () => { expect(generatePlan({ ...input(), maxWalkingMinutes: 0 }, city).outcome).not.toBe('feasible'); });
});
describe('city and time independence', () => {
  it('runs the same engine for the synthetic USD city and a different timezone', () => {
    const second = cities[1], data = { ...defaultInput(second), date: '2026-10-09' };
    const plan = feasible(data, second);
    expect(plan.currency).toBe('USD'); expect(plan.timezone).toBe('America/New_York');
    expect(plan.order.every(id => id.startsWith(second.id))).toBe(true);
    expect(formatTime(plan.startMs, second.timezone)).toBe('09:00');
    expect(plan.startMs).not.toBe(zonedTime(data.date, '09:00', city.timezone));
  });
  it('blocks mixed currencies and cross-city places', () => {
    expect(codes(generatePlan({ ...input(), currency: 'USD' }, city))).toContain('CURRENCY_MISMATCH');
    expect(codes(generatePlan({ ...input(), mustVisitIds: [cities[1].places[0].id] }, city))).toContain('UNKNOWN_PLACE');
  });
  it('rejects nonexistent and ambiguous DST times', () => {
    expect(() => zonedTime('2026-03-08', '02:30', cities[1].timezone)).toThrow();
    expect(() => zonedTime('2026-11-01', '01:30', cities[1].timezone)).toThrow();
  });
  it('rejects an inverted time window and over-sized parties', () => {
    expect(codes(generatePlan({ ...input(), endTime: '08:00' }, city))).toContain('INVALID_WINDOW');
    expect(codes(generatePlan({ ...input(), adults: 12, childAges: [4] }, city))).toContain('INVALID_INPUT');
  });
  it('explains a must-visit count that conflicts with relaxed pace', () => {
    expect(codes(generatePlan({ ...input(), pace: 'relaxed', mustVisitIds: city.places.filter(p => p.category !== 'food').slice(0, 4).map(p => p.id) }, city))).toContain('PACE_CONFLICT');
  });
  it('parses money without floating-point drift or silent precision loss', () => { expect(parseMoney('0.29', 2)).toBe(29); expect(parseMoney('12.345', 2)).toBeNull(); expect(parseMoney('-1', 2)).toBeNull(); expect(parseMoney('100', 0)).toBe(100); });
});
describe('confirmed plans and saved records', () => {
  it('treats validated saved property ordering as the same plan', () => {
    const generated = feasible();
    expect(sameValue(generated, planSchema.parse(generated))).toBe(true);
  });
  it('creates an independent snapshot so draft changes cannot mutate it', () => {
    const draft = feasible(), data = input(), confirmed = confirmPlan(data, draft, null, null);
    draft.order.reverse(); data.adults = 8;
    expect(confirmed.input.adults).toBe(2); expect(confirmed.plan.order).not.toEqual(draft.order);
  });
  it('rejects acceptance of a stale reviewed version', () => {
    const plan = feasible(), first = confirmPlan(input(), plan, null, null);
    expect(() => confirmPlan(input(), plan, first, 'stale')).toThrow(/changed/);
  });
  it('reports changes while keeping the original snapshot intact', () => {
    const previous = feasible(), next = feasible({ ...input(), pace: 'relaxed' });
    const frozen = structuredClone(previous); expect(planChanges(previous, next).length).toBeGreaterThan(0); expect(previous).toEqual(frozen);
  });
  it('rejects unsupported saved versions and internally inconsistent budgets', () => {
    expect(sessionSchema.safeParse({ schemaVersion: 99 }).success).toBe(false);
    const corrupt = feasible(); corrupt.total[1] += 100;
    expect(planSchema.safeParse(corrupt).success).toBe(false);
  });
});
