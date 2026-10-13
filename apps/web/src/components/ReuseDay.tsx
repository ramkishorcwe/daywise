import { useEffect, useRef, useState } from 'react';
import { dietNames, type TripSession } from '../../../../packages/contracts/src';
import type { ReuseDay as ReuseOptions } from '../../../../packages/contracts/src/reuse-day';
import { getCity } from '../../../../fixtures/cities';
import { formatMoney } from '../../../../packages/domain/src/money';
import Dialog from './Dialog';
import './reuse-day.css';

export default function ReuseDay({ source, close, create }: { source: TripSession; close: () => void; create: (source: TripSession, options: ReuseOptions) => Promise<void> }) {
  const [basis, setBasis] = useState<ReuseOptions['basis']>(source.confirmed ? 'accepted' : 'draft'), [title, setTitle] = useState(`${source.title.slice(0, 145)} (new day)`), [date, setDate] = useState('');
  const initial = source.confirmed?.input ?? source.input;
  const [start, setStart] = useState(initial.startTime), [end, setEnd] = useState(initial.endTime), [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false), [created, setCreated] = useState(false), [error, setError] = useState('');
  const active = useRef(true), running = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const input = basis === 'accepted' ? source.confirmed!.input : source.input, city = getCity(input.cityId)!;
  const order = basis === 'accepted' ? source.confirmed!.plan.order : source.draftOrder;
  const disabled = busy || created;
  return <Dialog title="Use this day as a starting point" close={close} wide><div className="reuse-space">
    <span className="eyebrow">{source.title}</span><p>{city.name} · {city.currency} · {city.timezone}. Source day {input.date}, captured when this panel opened.</p>
    <div className="notice">This creates a separate private draft. Past confirmation, completed stops, return reports, booked/actual amounts and backend connections are cleared. Existing days and your active plan stay unchanged.</div>
    <div className="form-grid"><label>New day name<input value={title} maxLength={160} required disabled={disabled} onChange={event => setTitle(event.target.value)} /></label><label>New travel date<input type="date" value={date} required disabled={disabled} onChange={event => setDate(event.target.value)} /></label></div>
    <label className="reuse-basis">Preferences to reuse<select aria-label="Preferences to reuse" value={basis} disabled={disabled} onChange={event => { const value = event.target.value as ReuseOptions['basis']; setBasis(value); const selected = value === 'accepted' ? source.confirmed!.input : source.input; setStart(selected.startTime); setEnd(selected.endTime); setError(''); }}><option value="accepted" disabled={!source.confirmed}>Accepted day preferences</option><option value="draft">Current draft preferences</option></select></label>
    <div className="form-grid"><label>New start time<input type="time" required disabled={disabled} value={start} onChange={event => setStart(event.target.value)} /></label><label>New return by<input type="time" required disabled={disabled} value={end} onChange={event => setEnd(event.target.value)} /></label></div>
    <div className="reuse-summary"><h3>Preferences carried into the new draft</h3><p>{input.adults} adults · {input.childAges.length} children · {formatMoney(input.budgetMinor, city)} {input.budgetBasis === 'per_person' ? 'per person' : 'group budget'} · {input.reservePercent}% reserve</p><p>{input.dietaryRules.map(rule => dietNames[rule]).join(' · ') || 'No strict food rules'} · {input.stepFree ? 'Step-free required' : 'No step-free requirement'} · {input.maxWalkingMinutes} min walking · {input.pace} pace</p><p className="field-note">Party ages, interests, manual anchors, dietary/mobility requirements, must-visits, exclusions and hidden-gem preferences are copied. These can be reviewed in the new draft. Sensitive preferences remain private on this device.</p></div>
    <label className="checkbox-row"><input type="checkbox" checked={keep && order !== null} disabled={disabled || order === null} onChange={event => setKeep(event.target.checked)} /><span>Keep the saved stop order for a fresh schedule check</span></label>
    {order === null && <p className="field-note">This draft has no saved stop order. Opening the new day will select stops afresh.</p>}
    <p className="field-note">No times, prices or venue facts are copied from an accepted schedule. Open the saved draft to calculate against the current software catalog on its new date. It may need adjustments before it can be confirmed; this does not verify real travel facts.</p>
    {error && <div className="error-box" role="alert">{error}</div>}{created && <div className="notice" role="status">A separate draft was added to Saved plans. Close this panel and open it there to calculate and review. Your active day is unchanged.</div>}
    <div className="dialog-actions"><button className="button secondary" onClick={close}>Close</button><button className="button primary" disabled={disabled || !date || !title.trim() || !start || !end} onClick={async () => {
      if (running.current || created) return; running.current = true; setBusy(true); setError('');
      try { await create(source, { basis, title, date, startTime: start, endTime: end, keepOrder: keep }); if (active.current) setCreated(true); }
      catch (failure) { if (active.current) setError(failure instanceof Error ? failure.message : 'This draft could not be saved. Check device storage and retry.'); }
      finally { running.current = false; if (active.current) setBusy(false); }
    }}>{busy ? 'Saving separate draft…' : 'Create saved draft'}</button></div>
  </div></Dialog>;
}
