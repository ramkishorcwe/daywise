import { useState, type FormEvent } from 'react';
import { ArrowRight, ChevronLeft, Plus, Minus, Sparkles } from 'lucide-react';
import { cities, defaultInput, getCity } from '../../../../fixtures/cities';
import { categoryNames, dietRules, dietNames, type TripInput } from '../../../../packages/contracts/src';
import { parseMoney } from '../../../../packages/domain/src/money';
import { validateInput } from '../../../../packages/domain/src/planner';
import Dialog from './Dialog';
import StartLocation, { type StartMode } from './StartLocation';

export default function PlannerForm({ initial, close, submit, focusLocation = false }: { initial: TripInput; close: () => void; submit: (input: TripInput) => void; focusLocation?: boolean }) {
  const [draft, setDraft] = useState<TripInput>(structuredClone(initial));
  const [budgetText, setBudgetText] = useState(String(initial.budgetMinor / 100));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [startMode, setStartMode] = useState<StartMode>('demo');
  const city = getCity(draft.cityId)!;
  const update = (patch: Partial<TripInput>) => setDraft(previous => ({ ...previous, ...patch }));
  function parsedDraft(): TripInput | null {
    if (startMode !== 'demo') { setErrors(['Real-location routing is not connected. Choose a test starting point to build a test plan.']); return null; }
    const budget = parseMoney(budgetText, city.currencyExponent);
    if (budget === null) { setErrors(['Enter a valid nonnegative budget with no more than two decimal places.']); return null; }
    const input = { ...draft, budgetMinor: budget };
    const problems = validateInput(input, city);
    if (problems.length) { setErrors(problems.map(p => p.message)); return null; }
    setErrors([]); return input;
  }
  function advance(event: FormEvent) { event.preventDefault(); const input = parsedDraft(); if (!input) return; if (!step) { setStep(1); return; } submit(input); }
  const toggle = <T extends string,>(list: T[], item: T): T[] => list.includes(item) ? list.filter(value => value !== item) : [...list, item];
  return <Dialog title="A day that fits you" close={close} wide>
    <p className="muted">A few essentials first. Everything here uses fictional test data.</p>
    <div className="form-progress"><span className={step === 0 ? 'active' : ''}>01 · The essentials</span><span className={step === 1 ? 'active' : ''}>02 · Your kind of day</span></div>
    <form onSubmit={advance}>
      {errors.length > 0 && <div className="error-box" role="alert">{errors.map(message => <p key={message}>{message}</p>)}</div>}
      {step === 0 ? <>
        <div className="form-grid"><label>Destination<select aria-label="Destination" value={draft.cityId} onChange={e => { const next = defaultInput(getCity(e.target.value)!); setDraft(next); setBudgetText(String(next.budgetMinor / 100)); setStartMode('demo'); setErrors([]); }}>{cities.map(c => <option key={c.id} value={c.id}>{c.name} · test dataset</option>)}</select></label><label>Travel date<input type="date" required value={draft.date} onChange={e => update({ date: e.target.value })} /></label></div>
        <div className="form-grid"><label>Start time<input type="time" required value={draft.startTime} onChange={e => update({ startTime: e.target.value })} /></label><label>Return by<input type="time" required value={draft.endTime} onChange={e => update({ endTime: e.target.value })} /></label></div>
        <p className="field-note">Times are local to {city.name}: {city.timezone}.</p>
        <StartLocation key={city.id} city={city} input={draft} mode={startMode} setMode={mode => { setStartMode(mode); setErrors([]); }} update={update} focus={focusLocation} />
        <div className="form-grid"><label>Adults<input type="number" required min="1" max="12" value={draft.adults} onChange={e => update({ adults: e.target.valueAsNumber })} /></label><div className="child-count"><span>Children</span><div><button type="button" className="icon-button" aria-label="Remove child" disabled={!draft.childAges.length} onClick={() => update({ childAges: draft.childAges.slice(0, -1) })}><Minus size={16} /></button><b>{draft.childAges.length}</b><button type="button" className="icon-button" aria-label="Add child" disabled={draft.adults + draft.childAges.length >= 12} onClick={() => update({ childAges: [...draft.childAges, 5] })}><Plus size={16} /></button></div></div></div>
        {draft.childAges.length > 0 && <div className="form-grid">{draft.childAges.map((age, index) => <label key={index}>Child {index + 1} age<input type="number" required min="0" max="17" value={age} onChange={e => update({ childAges: draft.childAges.map((a, i) => i === index ? e.target.valueAsNumber : a) })} /></label>)}</div>}
        <div className="form-grid"><label>Budget ({city.currency})<input inputMode="decimal" required value={budgetText} onChange={e => setBudgetText(e.target.value)} /></label><label>Budget applies to<select value={draft.budgetBasis} onChange={e => update({ budgetBasis: e.target.value as TripInput['budgetBasis'] })}><option value="group">The whole group</option><option value="per_person">Each person</option></select></label></div>
        <fieldset><legend>Food requirements</legend><div className="choice-chips">{dietRules.map(rule => <button type="button" key={rule} aria-pressed={draft.dietaryRules.includes(rule)} className={draft.dietaryRules.includes(rule) ? 'chosen' : ''} onClick={() => update({ dietaryRules: toggle(draft.dietaryRules, rule) })}>{dietNames[rule]}</button>)}</div></fieldset>
        <p className="field-note">Every selected restriction is strict. Missing evidence never counts as a match.</p>
      </> : <>
        <fieldset><legend>What would you like more of?</legend><div className="choice-chips">{(['history', 'nature', 'culture', 'shopping'] as const).map(category => <button type="button" key={category} aria-pressed={draft.interests.includes(category)} className={draft.interests.includes(category) ? 'chosen' : ''} onClick={() => update({ interests: toggle(draft.interests, category) })}>{categoryNames[category]}</button>)}</div></fieldset>
        <fieldset><legend>Find your pace</legend><div className="pace-options">{(['relaxed', 'balanced', 'packed'] as const).map(pace => <button type="button" key={pace} aria-pressed={draft.pace === pace} className={draft.pace === pace ? 'chosen' : ''} onClick={() => update({ pace })}><b>{pace[0].toUpperCase() + pace.slice(1)}</b><small>{pace === 'relaxed' ? 'Room to linger' : pace === 'balanced' ? 'A little of everything' : 'Make the most of it'}</small></button>)}</div></fieldset>
        <div className="form-grid"><label>Contingency reserve (%)<input type="number" min="0" max="30" required value={draft.reservePercent} onChange={e => update({ reservePercent: e.target.valueAsNumber })} /></label><label>Maximum walking (minutes)<input type="number" required min="0" max="240" value={draft.maxWalkingMinutes} onChange={e => update({ maxWalkingMinutes: e.target.valueAsNumber })} /></label></div>
        <label className="checkbox-row"><input type="checkbox" checked={draft.stepFree} onChange={e => update({ stepFree: e.target.checked })} /><span>Require supported step-free visits</span></label>
        <label className="checkbox-row"><input type="checkbox" checked={draft.includeHiddenGems} onChange={e => update({ includeHiddenGems: e.target.checked })} /><span>Include curated hidden gems</span></label>
        <p className="field-note">Step-free fixture evidence does not certify a real accessible journey. Travel mode is car with walking connectors.</p>
        <fieldset><legend>Must-visits and exclusions</legend><div className="place-rules">{city.places.filter(p => p.category !== 'food').map(place => <div key={place.id}><span>{place.name}</span><select aria-label={`Preference for ${place.name}`} value={draft.mustVisitIds.includes(place.id) ? 'must' : draft.excludedPlaceIds.includes(place.id) ? 'exclude' : 'optional'} onChange={e => update({ mustVisitIds: [...draft.mustVisitIds.filter(id => id !== place.id), ...(e.target.value === 'must' ? [place.id] : [])], excludedPlaceIds: [...draft.excludedPlaceIds.filter(id => id !== place.id), ...(e.target.value === 'exclude' ? [place.id] : [])] })}><option value="optional">Optional</option><option value="must">Must visit</option><option value="exclude">Exclude</option></select></div>)}</div></fieldset>
      </>}
      <div className="dialog-actions">{step === 1 ? <button className="button secondary" type="button" onClick={() => setStep(0)}><ChevronLeft size={16} /> Back</button> : <button className="button secondary" type="button" onClick={close}>Cancel</button>}<button className="button primary" type="submit" disabled={startMode !== 'demo'}>{step ? <><Sparkles size={16} /> Build my day</> : <>Your preferences <ArrowRight size={16} /></>}</button></div>
    </form>
  </Dialog>;
}
