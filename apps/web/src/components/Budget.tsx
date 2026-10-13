import { Wallet, ArrowUpRight } from 'lucide-react';
import { budgetKeys, type BudgetKey, type City, type Plan } from '../../../../packages/contracts/src';
import { formatMoney, formatRange } from '../../../../packages/domain/src/money';
const names: Record<BudgetKey, string> = { tickets: 'Tickets & activities', food: 'Food & drinks', transport: 'Car transport', parking: 'Parking allowance', other: 'Other expenses', reserve: 'Contingency reserve' };
export default function Budget({ city, plan, full = false, open }: { city: City; plan: Plan; full?: boolean; open?: () => void }) {
  const remaining = plan.budgetLimit - plan.total[1];
  return <section className={`budget-card ${full ? 'full' : ''}`}>
    <div className="card-heading"><span><Wallet size={17} /> Your group budget</span><span className="pill pale">ESTIMATE</span></div>
    <p className="budget-total">{formatRange(plan.total, city)}</p><p className="muted">of {formatMoney(plan.budgetLimit, city)} available · whole group</p>
    <div className="budget-meter"><div style={{ width: `${Math.min(100, plan.budgetLimit ? plan.total[1] / plan.budgetLimit * 100 : 0)}%` }} /></div>
    <div className="budget-left"><span className="status-dot" /> {formatMoney(remaining, city)} left at the upper estimate</div>
    <div className="budget-rows">{budgetKeys.map(key => <div key={key}><span>{names[key]}</span><b>{formatRange(plan.budget[key], city)}</b></div>)}</div>
    <p className="field-note">Original fictional estimates, including reserve and return travel. Accommodation is excluded. Reported costs are separate in Trip budget.</p>
    {!full && open && <button className="text-button" onClick={open}>View budget breakdown <ArrowUpRight size={15} /></button>}
  </section>;
}
