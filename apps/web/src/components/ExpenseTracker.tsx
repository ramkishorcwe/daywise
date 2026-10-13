import { useState } from 'react';
import { Download, Pencil, Trash2 } from 'lucide-react';
import { expenseCategories, type City, type Plan, type TripSession, type ExpenseCategory, type ExpenseRecord, type ExpenseLedger } from '../../../../packages/contracts/src';
import { expenseSummary, recordExpense, removeExpense } from '../../../../packages/domain/src/expenses';
import { formatMoney, formatRange, parseMoney } from '../../../../packages/domain/src/money';
import Budget from './Budget';
import './expenses.css';

const names: Record<ExpenseCategory, string> = { tickets: 'Tickets & activities', food: 'Food & drinks', transport: 'Car transport', parking: 'Parking', other: 'Other expenses' };
export default function ExpenseTracker({ session, city, draft, changed, planner }: { session: TripSession; city: City; draft: Plan | null; changed: (ledger: ExpenseLedger, expectedId: string) => void; planner: () => void }) {
  const [category, setCategory] = useState<ExpenseCategory>('tickets'), [status, setStatus] = useState<ExpenseRecord['status']>('booked');
  const [amount, setAmount] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const confirmed = session.confirmed;
  if (!confirmed) return <div className="budget-page">{draft && <Budget city={city} plan={draft} full />}<section className="expense-card"><span className="eyebrow">BOOKED & ACTUAL COSTS</span><h2>Confirm a day to track costs.</h2><p>Keep estimates separate from the whole-group amounts you report. A booked amount is a total commitment; an actual amount is the final total for that category.</p><button className="button secondary" onClick={planner}>Review my itinerary</button></section></div>;
  const summary = expenseSummary(confirmed, session.expenses);
  const records = session.expenses?.records ?? [];
  function edit(record: ExpenseRecord) { setCategory(record.category); setStatus(record.status); setAmount((record.amountMinor / 10 ** city.currencyExponent).toFixed(city.currencyExponent)); setError(''); setNotice('Review this whole-category amount, then save it for the current accepted plan.'); document.getElementById('expense-amount')?.focus(); }
  function download() {
    const file = new Blob([JSON.stringify({ schemaVersion: 1, scope: 'browser-budget', estimateDataMode: 'software_fixture', expenseSource: 'user_reported_unverified', exportedAt: new Date().toISOString(), date: confirmed!.input.date, confirmed, expenses: session.expenses ?? { cityId: city.id, currency: city.currency, records: [] } }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file), link = document.createElement('a'); link.href = url; link.download = `daywise-budget-${session.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Budget downloaded. This private copy includes the accepted test plan and reported amounts; deleting the saved day does not delete the file.');
  }
  return <div className="budget-page expense-page">
    <div><span className="eyebrow">ACCEPTED PLAN · {confirmed.input.date}</span><Budget city={city} plan={confirmed.plan} full /><p className="field-note">This original estimate stays unchanged. Draft edits and the planner’s feasibility checks remain separate from your reported costs.</p></div>
    <section className="expense-card" aria-label="Expense tracking">
      <span className="eyebrow">REPORTED BY YOU · WHOLE GROUP · {city.currency}</span><h2>What the day may cost.</h2>
      <p className="expense-total" data-testid="projected-total">{formatRange(summary.projected, city)}</p><p className="field-note">Reported totals plus estimates for categories you haven’t recorded, including the accepted reserve allowance.</p>
      <p className={summary.remaining < 0 ? 'expense-overrun' : 'expense-remaining'} role="status">{formatMoney(Math.abs(summary.remaining), city)} {summary.remaining < 0 ? 'over budget at the upper projection' : 'left at the upper projection'}</p>
      <div className="expense-statistics"><div><small>Actual category totals</small><b data-testid="actual-total">{formatMoney(summary.actual, city)}</b></div><div><small>Booked · no actual yet</small><b data-testid="booked-total">{formatMoney(summary.booked, city)}</b></div></div>
      <div className="expense-breakdown">{summary.rows.map(row => <div key={row.category}><span>{names[row.category]}<small>{row.source === 'estimate' ? 'Test estimate' : `${row.source === 'actual' ? 'Actual' : 'Booked'} · replaces estimate`}</small></span><b>{formatRange(row.amount, city)}</b></div>)}<div><span>Contingency reserve<small>Accepted allowance · not spent</small></span><b>{formatRange(confirmed.plan.budget.reserve, city)}</b></div></div>
      {summary.needsReview.length > 0 && <div className="expense-review" role="status"><b>{summary.needsReview.length} record(s) need review.</b><p>The accepted plan changed. Previous amounts stay below and are excluded from this projection. Edit and save each amount you still want to use.</p></div>}
      <form className="expense-form" noValidate onSubmit={event => {
        event.preventDefault(); setError(''); setNotice(''); const minor = parseMoney(amount.trim(), city.currencyExponent);
        if (minor === null) { setError(`Enter a nonnegative ${city.currency} amount with up to ${city.currencyExponent} decimal places (maximum ${formatMoney(1_000_000_000, city)}).`); return; }
        changed(recordExpense(confirmed, session.expenses, { category, status, amountMinor: minor, confirmedId: confirmed.id, updatedAt: new Date().toISOString() }), confirmed.id);
        setAmount(''); setNotice('Amount updated in this day. Check the device save status before closing.');
      }}>
        <h3>Record a category total</h3><p className="field-note">Enter the full category cost for everyone, including taxes and fees. For partial payments or individual purchases, total the category first. Saving replaces its previous amount; zero is allowed.</p>
        <div className="expense-fields"><label>Expense category<select value={category} onChange={event => { setCategory(event.target.value as ExpenseCategory); setAmount(''); setError(''); }}>{expenseCategories.map(key => <option key={key} value={key}>{names[key]}</option>)}</select></label><label>Cost status<select value={status} onChange={event => { setStatus(event.target.value as ExpenseRecord['status']); setAmount(''); setError(''); }}><option value="booked">Booked commitment</option><option value="actual">Actual final total</option></select></label><label className="expense-amount">Whole-category amount ({city.currency})<input id="expense-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} aria-invalid={!!error} aria-describedby="expense-help" /></label></div>
        <p id="expense-help" className="field-note">Actual replaces booked for the same category. These are your records; saving does not make a booking or payment. Reserve is an allowance, never an expense record.</p>
        {error && <p className="expense-overrun" role="alert">{error}</p>}<button className="button primary" type="submit">Save category amount</button>
      </form>
      {records.length > 0 && <div className="expense-records"><h3>Your recorded amounts</h3>{records.map(record => <article key={`${record.category}:${record.status}`}><div><b>{names[record.category]} · {record.status}</b><span>{formatMoney(record.amountMinor, city)} · {record.confirmedId !== confirmed.id ? 'Needs review' : record.status === 'booked' && records.some(other => other.category === record.category && other.status === 'actual' && other.confirmedId === confirmed.id) ? 'Retained; actual takes precedence' : 'Current accepted plan'}</span></div><div><button className="icon-button" aria-label={`Edit ${names[record.category]} ${record.status}`} onClick={() => edit(record)}><Pencil size={16} /></button><button className="icon-button" aria-label={`Remove ${names[record.category]} ${record.status}`} onClick={() => { changed(removeExpense(session.expenses!, record.category, record.status), confirmed.id); setNotice('Amount removed. The projection uses the next available booked amount or estimate.'); }}><Trash2 size={16} /></button></div></article>)}</div>}
      {notice && <p className="expense-notice" role="status">{notice}</p>}<button className="button secondary" onClick={download}><Download size={16} />Export this budget</button><p className="field-note">Saved only with this browser day. Backend trip exports and account sync do not include these amounts. Download for a separate copy; import is not available yet.</p>
    </section>
  </div>;
}
