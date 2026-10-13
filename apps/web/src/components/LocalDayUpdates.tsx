import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { dietNames, type TripSession } from '../../../../packages/contracts/src';
import type { LocalRevision } from '../../../../packages/domain/src/local-day';
import type { LocalDayChange } from '../../../../packages/contracts/src/local-day';
import { getCity } from '../../../../fixtures/cities';
import { formatTime } from '../../../../packages/domain/src/time-format';
import { formatMoney, formatRange, multiply } from '../../../../packages/domain/src/money';
import Dialog from './Dialog';
import './local-day.css';

export default function LocalDayUpdates({ initial, close, commit }: { initial: TripSession; close: () => void; commit: (source: TripSession, next: TripSession) => Promise<void> }) {
  const [session, setSession] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [proposal, setProposal] = useState<LocalRevision | null>(null), [issues, setIssues] = useState<string[]>([]);
  const [kind, setKind] = useState<LocalDayChange['kind']>('delay'), [skipId, setSkipId] = useState('');
  const [mealId, setMealId] = useState('');
  const [pace, setPace] = useState<TripSession['input']['pace']>(initial.confirmed!.input.pace === 'relaxed' ? 'balanced' : 'relaxed');
  const [count, setCount] = useState(initial.assistant?.progress?.completedCount ?? 0);
  const [delay, setDelay] = useState(() => {
    const progress = initial.assistant?.progress, plan = initial.confirmed!.plan;
    return progress ? Math.max(0, Math.min(180, Math.round((Date.parse(progress.readyAt) - (progress.completedCount ? plan.stops[progress.completedCount - 1].departureMs : plan.startMs)) / 60000))) : 0;
  });
  const active = useRef(true), running = useRef(false), worker = useRef<Worker | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; worker.current?.terminate(); if (timer.current) clearTimeout(timer.current); }; }, []);
  const confirmed = session.confirmed!, city = getCity(session.input.cityId)!, progress = session.assistant?.progress;
  const optional = confirmed.plan.stops.slice(progress?.completedCount ?? 0).filter(stop => stop.kind === 'visit' && stop.placeId && !confirmed.input.mustVisitIds.includes(stop.placeId));
  const hasRemaining = (progress?.completedCount ?? 0) < confirmed.plan.stops.length;
  const selectedSkip = optional.some(stop => stop.placeId === skipId) ? skipId : optional[0]?.placeId ?? '';
  const pendingMeal = confirmed.plan.stops.slice(progress?.completedCount ?? 0).find(stop => stop.kind === 'meal');
  const meals = city.places.filter(place => place.category === 'food' && place.id !== pendingMeal?.placeId);
  const canReplaceMeal = !!pendingMeal && !confirmed.input.mustVisitIds.includes(pendingMeal.placeId!) && !!meals.length;
  const selectedMealId = meals.some(place => place.id === mealId) ? mealId : meals[0]?.id ?? '';
  const meal = meals.find(place => place.id === selectedMealId);
  function clearPreview() { setProposal(null); setIssues([]); setNotice(''); setError(''); }
  async function run(action: 'report' | 'preview' | 'accept') {
    if (running.current) return; running.current = true; setBusy(true); setError(''); setNotice(''); setIssues([]);
    const source = session;
    try {
      const result = await new Promise<{ session?: TripSession; proposal?: LocalRevision; issues?: string[] }>((resolve, reject) => {
        worker.current = new Worker(new URL('../local-day-worker.ts', import.meta.url), { type: 'module' });
        timer.current = setTimeout(() => { worker.current?.terminate(); reject(new Error('Local updates took too long. Retry; your accepted day is preserved.')); }, 20000);
        worker.current.onerror = () => reject(new Error('Local updates are unavailable. Reopen this panel and retry.'));
        worker.current.onmessage = event => event.data.error ? reject(new Error(event.data.error)) : resolve(event.data);
        const change: LocalDayChange = kind === 'skip' ? { kind, placeId: selectedSkip } : kind === 'meal' ? { kind, placeId: selectedMealId } : kind === 'pace' ? { kind, pace } : { kind };
        worker.current.postMessage({ action, session: source, completedCount: count, delayMinutes: delay, proposal, change });
      });
      if (!active.current) return;
      if (result.session) {
        await commit(source, result.session);
        if (!active.current) return;
        setSession(result.session); setProposal(null);
        if (action === 'accept') { setKind('delay'); setSkipId(''); setMealId(''); setPace(result.session.input.pace === 'relaxed' ? 'balanced' : 'relaxed'); }
        setNotice(action === 'report' ? 'Local progress saved. The accepted schedule is unchanged; preview a revision to review new remaining times.' : 'Local revision accepted and saved. Completed stops and reported progress stay preserved.');
      } else { setProposal(result.proposal ?? null); setIssues(result.issues ?? []); }
    } catch (failure) { if (active.current) setError(failure instanceof Error ? failure.message : 'This local change could not be saved. Retry after checking device storage.'); }
    finally { worker.current?.terminate(); if (timer.current) clearTimeout(timer.current); running.current = false; if (active.current) setBusy(false); }
  }
  return <Dialog title="Update your day on this device" close={close} wide><div className="local-day-space">
    <p>{city.name} · {confirmed.input.date} · {city.timezone}</p>
    <div className="notice"><ShieldCheck size={18} /><span>Manual reports and software fixtures only. No GPS, live traffic, event detection or backend request. No cause of a delay is inferred.</span></div>
    <p>Report the completed prefix and total lateness at that point. Recording saves progress without changing your accepted schedule. A revision needs separate review and acceptance.</p>
    <div className="form-grid"><label>Completed stops locally<select aria-label="Completed stops locally" disabled={busy} value={count} onChange={event => { setCount(Number(event.target.value)); setDelay(0); clearPreview(); }}><option value="0" disabled={(progress?.completedCount ?? 0) > 0}>Not started · starting point</option>{confirmed.plan.stops.map((stop, index) => <option key={stop.id} value={index + 1} disabled={index + 1 < (progress?.completedCount ?? 0)}>Through {stop.name}</option>)}</select></label><label>Total lateness here (minutes)<input aria-label="Total lateness here (minutes)" disabled={busy} type="number" min="0" max="180" step="1" value={Number.isFinite(delay) ? delay : ''} onChange={event => { setDelay(event.target.valueAsNumber); clearPreview(); }} /></label></div>
    <p className="field-note">Lateness is measured against departure at the selected point in the current accepted schedule. It replaces the report at that point; it is not added again on every preview. Completed stops and reported departure cannot move backwards. Completing every stop still leaves the return journey.</p>
    <section className="local-change" aria-label="Requested remaining-day change"><h3>Choose what to review</h3><div className="form-grid"><label>Revision choice<select aria-label="Revision choice" value={kind} disabled={busy} onChange={event => { setKind(event.target.value as LocalDayChange['kind']); clearPreview(); }}><option value="delay">Use saved lateness only</option><option value="skip" disabled={!optional.length}>Skip an optional visit</option><option value="meal" disabled={!canReplaceMeal}>Replace the remaining meal</option><option value="pace" disabled={!hasRemaining}>Change remaining pace</option></select></label>{kind === 'skip' ? <label>Visit to skip<select aria-label="Visit to skip" value={selectedSkip} disabled={busy || !optional.length} onChange={event => { setSkipId(event.target.value); clearPreview(); }}>{optional.map(stop => <option key={stop.id} value={stop.placeId!}>{stop.name}</option>)}</select></label> : kind === 'pace' ? <label>Remaining pace<select aria-label="Remaining pace" value={pace} disabled={busy} onChange={event => { setPace(event.target.value as TripSession['input']['pace']); clearPreview(); }}>{(['relaxed', 'balanced', 'packed'] as const).map(value => <option key={value} value={value} disabled={value === confirmed.input.pace}>{value}</option>)}</select></label> : null}</div><p className="field-note">These are your choices, not verified closure or disruption reports. Only optional visits after the saved completed prefix can be skipped. Completed stops, must-visits, meals, rest, budget and strict requirements stay protected.</p>{!optional.length && <p className="field-note">There are no optional remaining visits to skip.</p>}</section>
    <div className="button-row"><button className="button secondary" disabled={busy || !Number.isInteger(delay) || delay < 0 || delay > 180} onClick={() => void run('report')}>Record local progress</button><button className="button primary" disabled={busy || !progress?.revision || (kind === 'skip' && !selectedSkip) || (kind === 'pace' && !hasRemaining) || (kind === 'meal' && !canReplaceMeal)} onClick={() => void run('preview')}>Preview local revision</button></div>
    {kind === 'meal' && canReplaceMeal && meal && <section className="local-meal-evidence" aria-label="Replacement meal evidence"><h3>{meal.name}</h3><p className="field-note">Replacing {pendingMeal!.name}. Source: software fixture {city.catalogVersion}; real checking date unavailable. Preparation, availability and dietary compliance are unverified.</p><dl><div><dt>Group meal estimate</dt><dd>{meal.foodCost ? formatRange(multiply(meal.foodCost, confirmed.input.adults + confirmed.input.childAges.length), city) : 'Unknown'}</dd></div><div><dt>Fixture hours / last entry</dt><dd>{meal.opens ?? 'Unknown'}–{meal.closes ?? 'Unknown'} / {meal.lastAdmission ?? 'Unknown'}</dd></div><div><dt>Step-free evidence</dt><dd>{meal.stepFree === 'supported' ? 'Fixture support' : meal.stepFree === 'not_supported' ? 'Fixture conflict' : 'Unknown'}</dd></div>{confirmed.input.dietaryRules.map(rule => <div key={rule}><dt>{dietNames[rule]} · required</dt><dd>{meal.dietary[rule] === 'supported' ? 'Fixture support' : meal.dietary[rule] === 'not_supported' ? 'Fixture conflict' : 'Unknown'}</dd></div>)}</dl><p className="field-note">Unknown evidence cannot satisfy a strict rule. Preview checks hours, travel, walking and the full-day budget including reserve. The chosen meal must remain in a feasible proposal; a cheaper or compatible meal is not silently substituted. Meal prices use the same per-person range for adults and children.</p></section>}
    {kind === 'meal' && !canReplaceMeal && <p className="field-note" role="status">There is no replaceable remaining meal. Completed or required meals stay preserved; a city also needs a different food option.</p>}
    {progress && <p className="field-note">Saved progress revision {progress.revision} · {progress.completedCount} stops · ready {formatTime(Date.parse(progress.readyAt), city.timezone)}. Preview uses this saved report; record form changes first.</p>}
    {busy && <p role="status"><LoaderCircle className="spin" size={15} />Checking or saving the local update…</p>}
    {error && <div className="error-box" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
    {!!issues.length && <section className="local-revision" role="status"><h3>No evaluated revision fits</h3><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul><p>Your confirmation is preserved. The recorded report remains saved; remaining times may be outdated.</p></section>}
    {proposal && <section className="local-revision" aria-label="Local revision preview"><h3>Review the remaining day</h3><ul>{proposal.changes.map(change => <li key={change}>{change}</li>)}</ul><p><b>Return {formatTime(proposal.plan.finishMs, city.timezone)} · upper group estimate {formatMoney(proposal.plan.total[1], city)}</b></p><ol>{proposal.plan.stops.map((stop, index) => <li key={stop.id}>{formatTime(stop.arrivalMs, city.timezone)} · {stop.name}{index < (progress?.completedCount ?? 0) ? ' · completed, retained' : ''}</li>)}</ol><p className="field-note">Strict requirements, required visits, meal/rest and return deadline are checked against {proposal.catalogVersion}. If needed, optional remaining visits may be removed; review the changes above. Booked/actual expense amounts do not alter planner feasibility.</p><div className="button-row"><button className="button secondary" disabled={busy} onClick={() => { setProposal(null); setNotice('Revision declined. Your confirmation is unchanged; local progress remains saved.'); }}>Keep accepted schedule</button><button className="button primary" disabled={busy} onClick={() => void run('accept')}>Accept local revision</button></div></section>}
  </div></Dialog>;
}
