import { expect, it } from 'vitest';
import { cities, defaultInput } from '../fixtures/cities';
import { expenseLedgerSchema, sessionSchema, type ExpenseRecord } from '../packages/contracts/src';
import { generatePlan } from '../packages/domain/src/planner';
import { confirmPlan } from '../packages/domain/src/versioning';
import { expenseSummary, recordExpense, removeExpense } from '../packages/domain/src/expenses';
import { parseMoney } from '../packages/domain/src/money';

function baseline(city = cities[0]) {
  const input = defaultInput(city), result = generatePlan(input, city);
  if (result.outcome !== 'feasible') throw new Error('Test baseline is required.');
  return confirmPlan(input, result.plan, null, null);
}
function record(confirmedId: string, status: ExpenseRecord['status'], amountMinor: number): ExpenseRecord { return { category: 'tickets', status, amountMinor, confirmedId, updatedAt: new Date().toISOString() }; }
it('replaces the complete category estimate with booked, then actual without double counting', () => {
  const confirmed = baseline(), original = structuredClone(confirmed);
  const booked = recordExpense(confirmed, undefined, record(confirmed.id, 'booked', 10000));
  expect(expenseSummary(confirmed, booked).projected).toEqual(confirmed.plan.total.map((amount, index) => amount - confirmed.plan.budget.tickets[index] + 10000));
  const both = recordExpense(confirmed, booked, record(confirmed.id, 'actual', 9000));
  const summary = expenseSummary(confirmed, both);
  expect(summary.actual).toBe(9000); expect(summary.booked).toBe(0);
  expect(summary.projected).toEqual(confirmed.plan.total.map((amount, index) => amount - confirmed.plan.budget.tickets[index] + 9000));
  expect(both.records).toHaveLength(2); expect(confirmed).toEqual(original);
});
it('supports zero final costs and falls back to booked then estimate on removal', () => {
  const confirmed = baseline(); let ledger = recordExpense(confirmed, undefined, record(confirmed.id, 'booked', 100));
  ledger = recordExpense(confirmed, ledger, record(confirmed.id, 'actual', 0));
  expect(expenseSummary(confirmed, ledger).rows[0]).toMatchObject({ source: 'actual', amount: [0, 0] });
  ledger = removeExpense(ledger, 'tickets', 'actual'); expect(expenseSummary(confirmed, ledger).booked).toBe(100);
  ledger = removeExpense(ledger, 'tickets', 'booked'); expect(expenseSummary(confirmed, ledger).projected).toEqual(confirmed.plan.total);
});
it('retains old-version amounts for review and excludes them until explicitly reassigned', () => {
  const confirmed = baseline(), ledger = recordExpense(confirmed, undefined, record(confirmed.id, 'actual', 110));
  const revision = confirmPlan(confirmed.input, confirmed.plan, confirmed, confirmed.id);
  const summary = expenseSummary(revision, ledger); expect(summary.actual).toBe(0); expect(summary.projected).toEqual(revision.plan.total); expect(summary.needsReview).toEqual(ledger.records);
  expect(() => recordExpense(revision, ledger, ledger.records[0])).toThrow('accepted plan changed');
  const reviewed = recordExpense(revision, ledger, { ...ledger.records[0], confirmedId: revision.id }); expect(expenseSummary(revision, reviewed).actual).toBe(110); expect(ledger.records[0].confirmedId).toBe(confirmed.id);
});
it('exposes an overrun without changing feasibility or counting the reserve as spending', () => {
  const confirmed = baseline(), ledger = recordExpense(confirmed, undefined, record(confirmed.id, 'actual', 1_000_000_000));
  const summary = expenseSummary(confirmed, ledger); expect(summary.remaining).toBeLessThan(0); expect(summary.actual).toBe(1_000_000_000);
  const expected = confirmed.plan.total[1] - confirmed.plan.budget.tickets[1] + 1_000_000_000; expect(summary.projected[1]).toBe(expected); expect(confirmed.plan.total[1]).toBeLessThanOrEqual(confirmed.plan.budgetLimit);
});
it('rejects currency/city mixing, duplicate records, unsafe amounts and reserve records', () => {
  const confirmed = baseline(), ledger = recordExpense(confirmed, undefined, record(confirmed.id, 'actual', 100));
  expect(() => expenseSummary(baseline(cities[1]), ledger)).toThrow('city or currency');
  expect(expenseLedgerSchema.safeParse({ ...ledger, records: [...ledger.records, ledger.records[0]] }).success).toBe(false);
  for (const amountMinor of [-1, 1.5, 1_000_000_001, NaN]) expect(() => recordExpense(confirmed, ledger, record(confirmed.id, 'actual', amountMinor))).toThrow();
  expect(expenseLedgerSchema.safeParse({ ...ledger, records: [{ ...ledger.records[0], category: 'reserve' }] }).success).toBe(false);
});
it('keeps old saved sessions compatible and validates local expenses against their confirmed day', () => {
  const confirmed = baseline(); const session = { schemaVersion: 1, id: 'test-day', title: 'Test', input: confirmed.input, draftOrder: null, confirmed, updatedAt: new Date().toISOString() };
  expect(sessionSchema.safeParse(session).success).toBe(true);
  const expenses = recordExpense(confirmed, undefined, record(confirmed.id, 'actual', 100));
  expect(sessionSchema.parse(JSON.parse(JSON.stringify({ ...session, expenses }))).expenses).toEqual(expenses);
  expect(sessionSchema.safeParse({ ...session, confirmed: null, expenses }).success).toBe(false);
  expect(sessionSchema.safeParse({ ...session, expenses: { ...expenses, currency: 'USD' } }).success).toBe(false);
});
it('parses minor currency units exactly and rejects negative, exponential and excessive precision input', () => {
  expect(parseMoney('12.34', 2)).toBe(1234); expect(parseMoney('0', 2)).toBe(0); expect(parseMoney('12', 0)).toBe(12);
  for (const amount of ['-1', '1e3', '1.234', '', '1,000', 'Infinity']) expect(parseMoney(amount, 2)).toBeNull();
  expect(parseMoney('1.1', 0)).toBeNull();
});
