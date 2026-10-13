import { useEffect, useState } from 'react';
import { LoaderCircle, Utensils } from 'lucide-react';
import { dietNames, type Plan, type TripSession } from '../../../../packages/contracts/src';
import type { FoodOption } from '../../../../packages/domain/src/food-options';
import { getCity } from '../../../../fixtures/cities';
import { formatMoney, formatRange } from '../../../../packages/domain/src/money';
import { formatTime } from '../../../../packages/domain/src/time-format';
import Dialog from './Dialog';
import './food-options.css';

export default function FoodOptions({ session, plan, close, choose }: { session: TripSession; plan: Plan | null; close: () => void; choose: (order: string[]) => void }) {
  const [options, setOptions] = useState<FoodOption[]>([]), [busy, setBusy] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const city = getCity(session.input.cityId)!, locked = !!session.assistant?.progress?.revision;
  useEffect(() => {
    let active = true, worker: Worker | undefined;
    setBusy(true); setError(''); setOptions([]);
    const fail = (message: string) => { if (active) { setError(message); setBusy(false); } worker?.terminate(); };
    const timer = setTimeout(() => fail('Food comparison took too long. Retry or keep your current day.'), 20000);
    try {
      worker = new Worker(new URL('../food-worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = event => { clearTimeout(timer); worker?.terminate(); if (!active) return; if (event.data.error) fail(event.data.error); else { setOptions(event.data.options); setBusy(false); } };
      worker.onerror = () => { clearTimeout(timer); fail('Food comparison is unavailable. Retry or keep your current day.'); };
      worker.postMessage({ input: session.input, plan });
    } catch { clearTimeout(timer); fail('Food comparison is unavailable. Retry or keep your current day.'); }
    return () => { active = false; clearTimeout(timer); worker?.terminate(); };
  }, [session, plan, retry]);
  return <Dialog title="A meal that fits your day" close={close} wide><div className="meal-space">
    <p className="muted">{city.name} · {session.input.date} · {city.timezone}. Comparing the draft selected when you opened this panel.</p>
    <div className="notice"><Utensils size={17} /><span>Software fixtures only. No restaurant, menu, preparation, availability or dietary compliance has been verified. Source: {city.catalogVersion}; real checking date unavailable.</span></div>
    <p>Strict rules: <b>{session.input.dietaryRules.map(rule => dietNames[rule]).join(' · ') || 'None selected'}</b>. Unknown evidence never satisfies a selected rule. All other stops stay in their current order.</p>
    {locked && <p className="meal-warning" role="status">Progress has been reported. Meal changes are locked; use an assistant proposal or start a separate day for restored offline progress.</p>}
    <p className="field-note">Prices are whole-group meal estimates for {session.input.adults + session.input.childAges.length} travelers, using the same per-person range for adults and children. The full-day check includes travel, parking and reserve. Booked/actual expense records do not change planner feasibility.</p>
    {busy ? <p role="status"><LoaderCircle className="spin" size={16} /> Checking meals against your day…</p> : error ? <div className="error-box" role="alert"><p>{error}</p><button className="button secondary" onClick={() => setRetry(value => value + 1)}>Retry food comparison</button></div> : !options.length ? <p role="status">This city has no food options in its test catalog. No meal has been invented.</p> : <div className="meal-grid">{options.map(option => {
      const place = city.places.find(place => place.id === option.placeId)!;
      const candidate = option.result.outcome === 'feasible' ? option.result.plan : null;
      const meal = candidate?.stops.find(stop => stop.placeId === place.id);
      return <article className="meal-card" key={place.id} aria-label={`Food option ${place.name}`}>
        <span className="eyebrow">{option.selected ? 'CURRENT DRAFT MEAL' : 'MEAL ALTERNATIVE'}</span><h3>{place.name}</h3><p>{place.description}</p>
        <dl><div><dt>Group meal estimate</dt><dd>{option.cost ? formatRange(option.cost, city) : 'Unknown'}</dd></div><div><dt>Fixture hours / last entry</dt><dd>{place.opens ?? 'Unknown'}–{place.closes ?? 'Unknown'} / {place.lastAdmission ?? 'Unknown'}</dd></div><div><dt>Step-free evidence</dt><dd>{place.stepFree === 'supported' ? 'Fixture support' : place.stepFree === 'not_supported' ? 'Fixture conflict' : 'Unknown'}</dd></div></dl>
        <ul className="meal-rules" aria-label="Dietary fixture evidence">{option.rules.map(rule => <li key={rule.rule}><span>{dietNames[rule.rule]}{rule.required && <small>Required</small>}</span><b>{rule.status === 'supported' ? 'Fixture support' : rule.status === 'not_supported' ? 'Fixture conflict' : 'Unknown'}</b></li>)}</ul>
        {candidate && meal ? <div className="meal-fit"><b>Fits this draft</b><p>Meal {formatTime(meal.arrivalMs, city.timezone)}–{formatTime(meal.departureMs, city.timezone)} · return {formatTime(candidate.finishMs, city.timezone)}</p><p>Upper day estimate {formatMoney(candidate.total[1], city)} · {candidate.totalWalkingMinutes} min walking</p>{plan && <p>Return change {Math.round((candidate.finishMs - plan.finishMs) / 60000)} min · upper cost change {formatMoney(candidate.total[1] - plan.total[1], city)}</p>}</div> : <div className="meal-warning"><b>Cannot apply to this draft</b>{option.result.outcome !== 'feasible' && <ul>{option.result.issues.map((issue, index) => <li key={`${issue.code}:${index}`}>{issue.message}</li>)}</ul>}</div>}
        <button className="button secondary" disabled={!candidate || option.selected || locked} onClick={() => candidate && choose(candidate.order)}>{option.selected ? 'Current draft meal' : `Use ${place.name} in draft`}</button>
      </article>;
    })}</div>}
    <p className="field-note">Applying a meal changes only the draft. Review and accept it in the planner to change a confirmed day. No account, location permission or live food lookup is used.</p>
  </div></Dialog>;
}
