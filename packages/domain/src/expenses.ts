import { expenseCategories, expenseLedgerSchema, expenseRecordSchema, type ConfirmedPlan, type ExpenseLedger, type ExpenseRecord } from '../../contracts/src';
import { add, type Range } from './money';

function validate(confirmed: ConfirmedPlan, ledger?: ExpenseLedger) {
  if (!ledger) return;
  expenseLedgerSchema.parse(ledger);
  if (ledger.cityId !== confirmed.plan.cityId || ledger.currency !== confirmed.plan.currency) throw new Error('Expenses belong to a different city or currency.');
}
export function expenseSummary(confirmed: ConfirmedPlan, ledger?: ExpenseLedger) {
  validate(confirmed, ledger);
  const current = (ledger?.records ?? []).filter(record => record.confirmedId === confirmed.id);
  const rows = expenseCategories.map(category => {
    const actual = current.find(record => record.category === category && record.status === 'actual');
    const booked = current.find(record => record.category === category && record.status === 'booked');
    const record = actual ?? booked;
    return { category, source: record?.status ?? 'estimate', amount: record ? [record.amountMinor, record.amountMinor] as Range : confirmed.plan.budget[category] };
  });
  // Keep the accepted reserve allowance unchanged; it is neither spent nor booked.
  const projected = rows.reduce((sum, row) => add(sum, row.amount), [...confirmed.plan.budget.reserve] as Range);
  const totalFor = (source: string) => rows.filter(row => row.source === source).reduce((sum, row) => sum + row.amount[0], 0);
  return { rows, projected, actual: totalFor('actual'), booked: totalFor('booked'), remaining: confirmed.plan.budgetLimit - projected[1], needsReview: (ledger?.records ?? []).filter(record => record.confirmedId !== confirmed.id) };
}
export function recordExpense(confirmed: ConfirmedPlan, ledger: ExpenseLedger | undefined, record: ExpenseRecord): ExpenseLedger {
  validate(confirmed, ledger); expenseRecordSchema.parse(record);
  if (record.confirmedId !== confirmed.id) throw new Error('The accepted plan changed. Review the expense before saving.');
  return expenseLedgerSchema.parse({ cityId: confirmed.plan.cityId, currency: confirmed.plan.currency, records: [...(ledger?.records ?? []).filter(previous => previous.category !== record.category || previous.status !== record.status), record] });
}
export function removeExpense(ledger: ExpenseLedger, category: ExpenseRecord['category'], status: ExpenseRecord['status']): ExpenseLedger {
  return expenseLedgerSchema.parse({ ...ledger, records: ledger.records.filter(record => record.category !== category || record.status !== status) });
}
