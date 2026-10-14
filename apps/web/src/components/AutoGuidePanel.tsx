import { useEffect, useId, useRef, useState } from 'react';
import { guidePreferencesSchema, defaultMealPreferences, interests, type GuideCandidate, type GuidePlan, type GuidePreferences, type GuideStop } from '../../../../packages/contracts/src/guide';
import { discoverGuide, planGuide } from '../guide-api';
import { GuideReview } from './GuideReview';
import type { GuidePanelProps } from './GuidePanel';
import '../guide.css';
import { guideFieldIssues, focusGuideField } from '../guide-validation';

export default function AutoGuidePanel(props: GuidePanelProps) {
  const [preferences, setPreferences] = useState<Partial<GuidePreferences>>(props.initialPreferences ?? { interests: ['history', 'culture'], pace: 'balanced', groupType: 'unspecified', environment: 'any', mobility: 'standard', travelMode: 'DRIVE', visitedPlaceIds: [], mealBreak: true, restBreaks: true, bufferMinutes: 10, perPersonBudget: null, mealGroupEstimate: null, transportGroupEstimate: null, transportPerKmEstimate: null, notes: '', useAI: true });
  const initialAttractions = () => props.initialPlan?.itinerary.stops.filter((_, i) => !props.initialPlan!.stops[i].mealKind) ?? [];
  const initialBank = () => initialAttractions().map(s => { const detail = props.initialPlan!.stops.find(row => row.locationId === s.location.id)!; return { location: s.location, facts: detail.facts, suggestedMinutes: s.durationMinutes, score: 0, reasons: detail.reasons }; });
  const initialRows = () => initialAttractions().map(s => { const detail = props.initialPlan!.stops.find(row => row.locationId === s.location.id)!; const saved = props.savedConstraints?.find(c => c.placeId === s.location.placeId); const { placeId: _placeId, ...own } = saved ?? {}; return { locationId: s.location.id, durationMinutes: s.durationMinutes, mustVisit: false, locked: false, preferredTime: null, costEstimate: null, durationSource: detail.durationSource, timeBand: detail.timeBand, ...own }; });
  const [bank, setBank] = useState<GuideCandidate[]>(initialBank), [choices, setChoices] = useState<GuideStop[]>(initialRows), [mode, setMode] = useState<'smart' | 'manual'>(props.initialPlan?.orderMode ?? 'smart');
  const [result, setResult] = useState<GuidePlan | null>(props.initialPlan ?? null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [warnings, setWarnings] = useState<string[]>([]), [ack, setAck] = useState(false);
  const abort = useRef<AbortController | null>(null), sequence = useRef(0), callbacks = useRef(props), generated = useRef(!!props.initialPlan), applied = useRef(''), excluded = useRef(new Set<string>()), generateRef = useRef<(order: 'smart' | 'manual', fresh?: boolean) => void>(() => {}); callbacks.current = props;
  const profileValidation = guidePreferencesSchema.safeParse({ ...preferences, adults: props.adults, childAges: props.childAges, groupBudget: props.budget.trim() ? Number(props.budget) : null, currency: props.currency || null, dietaryRules: props.dietaryRules });
  const [validationAttempted, setValidationAttempted] = useState(false), root = useRef<HTMLElement>(null), validationId = useId();
  const fieldIssues = validationAttempted && !profileValidation.success ? guideFieldIssues(profileValidation.error) : [];
  const issueKey = JSON.stringify(fieldIssues);
  useEffect(() => {
    const scope = root.current?.closest<HTMLElement>('.live-form') ?? root.current;
    if (!scope) return;
    const controls = scope.querySelectorAll<HTMLElement>('[data-guide-field]');
    for (const control of controls) {
      const invalid = fieldIssues.some(row => row.field === control.dataset.guideField);
      if (invalid) { control.setAttribute('aria-invalid', 'true'); control.setAttribute('aria-describedby', validationId); }
      else { control.removeAttribute('aria-invalid'); control.removeAttribute('aria-describedby'); }
    }
    return () => { for (const control of controls) { control.removeAttribute('aria-invalid'); control.removeAttribute('aria-describedby'); } };
  }, [issueKey, validationId]);
  const baseKey = JSON.stringify({ destination: props.destination?.id, start: props.start?.id, end: props.end?.id, same: props.returnToStart, outside: props.allowOutsideStart, date: props.date, startTime: props.startTime, endTime: props.endTime, adults: props.adults, children: props.childAges, budget: props.budget, currency: props.currency, diet: props.dietaryRules, preferences });
  const key = (rows: GuideStop[], order: 'smart' | 'manual') => JSON.stringify({ baseKey, rows, order });
  const inputKey = key(choices, mode);
  function invalidate() { sequence.current++; abort.current?.abort(); setBusy(false); setResult(null); setAck(false); callbacks.current.onPreview(null); }
  useEffect(() => () => { sequence.current++; abort.current?.abort(); }, []);
  const previousBase = useRef(baseKey), previousDestination = useRef(`${props.destination?.id}:${props.date}`);
  useEffect(() => {
    const parsed = guidePreferencesSchema.safeParse({ ...preferences, adults: props.adults, childAges: props.childAges, groupBudget: props.budget.trim() ? Number(props.budget) : null, currency: props.currency || null, dietaryRules: props.dietaryRules });
    if (!parsed.success) return;
    callbacks.current.onPreferences(parsed.data, choices.flatMap(row => {
      const placeId = bank.find(c => c.location.id === row.locationId)?.location.placeId;
      if (!placeId) return [];
      const { locationId: _id, ...own } = row;
      return [{ ...own, placeId }];
    }));
  }, [baseKey, choices, bank]);
  if (!applied.current && props.initialPlan) applied.current = inputKey;
  useEffect(() => { if (previousBase.current !== baseKey) { previousBase.current = baseKey; invalidate(); } }, [baseKey]);
  useEffect(() => { const next = `${props.destination?.id}:${props.date}`; if (previousDestination.current === next) return; previousDestination.current = next; setBank([]); setChoices([]); generated.current = false; excluded.current.clear(); applied.current = ''; }, [props.destination?.id, props.date]);
  useEffect(() => { if (!generated.current || !choices.length || !props.ready || inputKey === applied.current) return; const timer = setTimeout(() => generateRef.current(mode), 900); return () => clearTimeout(timer); }, [inputKey, props.ready]);
  const own = (c: GuideCandidate): GuideStop => ({ locationId: c.location.id, durationMinutes: c.suggestedMinutes, durationSource: 'category_estimate', timeBand: 'any', mustVisit: false, locked: false, preferredTime: null, costEstimate: null });
  async function generate(order: 'smart' | 'manual', fresh = false) {
    if (!props.ready || busy || !props.destination) return;
    setValidationAttempted(true);
    if (!profileValidation.success) { setError(''); return; }
    invalidate(); const id = sequence.current, controller = new AbortController(); abort.current = controller; setBusy(true); setError('');
    const timer = setTimeout(() => { if (id === sequence.current) { controller.abort(); setBusy(false); setError('Planning took too long. Retry; no day was accepted.'); } }, 90000);
    try {
      const p = profileValidation.data; let candidates = bank, rows = choices;
      if (fresh || !candidates.length) {
        const discovered = await discoverGuide(props.destination.id, props.date, p, controller.signal); if (id !== sequence.current || controller.signal.aborted) return;
        candidates = discovered.candidates.filter(c => !excluded.current.has(c.location.placeId ?? ''));
        if (choices.some(row => (row.mustVisit || row.locked) && !candidates.some(c => c.location.placeId === bank.find(b => b.location.id === row.locationId)?.location.placeId))) throw new Error('A must-visit or locked place was not returned in fresh discovery. Unlock it or adjust preferences before regenerating.');
        setWarnings(discovered.warnings);
        rows = candidates.map(c => { const old = choices.find(s => bank.find(b => b.location.id === s.locationId)?.location.placeId === c.location.placeId); return old ? { ...old, locationId: c.location.id } : own(c); });
        choices.forEach((old, position) => { if (!old.locked) return; const placeId = bank.find(c => c.location.id === old.locationId)?.location.placeId; const current = rows.findIndex(row => candidates.find(c => c.location.id === row.locationId)?.location.placeId === placeId); if (current >= 0 && position < rows.length) [rows[current], rows[position]] = [rows[position], rows[current]]; });
      } else if (order === 'smart') rows = [...choices, ...candidates.filter(c => !excluded.current.has(c.location.placeId ?? '') && !choices.some(s => s.locationId === c.location.id)).map(own)];
      if (!rows.length) throw new Error('No suitable real places are available. Adjust interests or the travel window and retry.');
      const plan = await planGuide({ destinationId: props.destination.id, startId: props.start!.id, endId: props.returnToStart ? null : props.end!.id, returnToStart: props.returnToStart, allowOutsideStart: props.allowOutsideStart, date: props.date, startTime: props.startTime, endTime: props.endTime, preferences: p, stops: rows, orderMode: order }, controller.signal);
      if (id !== sequence.current || controller.signal.aborted) return;
      const ordered = plan.itinerary.stops.filter((_, i) => !plan.stops[i].mealKind).map(stop => { const detail = plan.stops.find(row => row.locationId === stop.location.id)!; return ({ ...rows.find(row => row.locationId === stop.location.id)!, durationMinutes: stop.durationMinutes, durationSource: detail.durationSource, timeBand: detail.timeBand }); });
      applied.current = key(ordered, order); setMode(order); setBank(candidates); setChoices(ordered); setResult(plan); generated.current = true;
      callbacks.current.onPreferences(p, ordered.map(row => { const { locationId, ...saved } = row; return { ...saved, placeId: candidates.find(c => c.location.id === locationId)!.location.placeId! }; })); callbacks.current.onPreview(plan);
    } catch (failure) { if (id === sequence.current && !controller.signal.aborted) setError(failure instanceof Error && !('issues' in failure) ? failure.message : 'The planning response could not be validated. Retry planning; your accepted trip is preserved.'); }
    finally { clearTimeout(timer); if (id === sequence.current) setBusy(false); }
  }
  generateRef.current = (order, fresh) => void generate(order, fresh);
  const update = (patch: Partial<GuidePreferences>) => { invalidate(); setPreferences(p => ({ ...p, ...patch })); };
  const edit = (rows: GuideStop[]) => { invalidate(); setChoices(rows); setMode('manual'); };
  const meals = preferences.meals ?? defaultMealPreferences;
  function move(index: number, step: number) { const other = index + step; if (other < 0 || other >= choices.length || choices[index].locked || choices[other].locked) return; const rows = [...choices]; [rows[index], rows[other]] = [rows[other], rows[index]]; edit(rows); }
  return <section ref={root} className="guide-panel" aria-label="Automatic tour planner"><h2>Your guide plans the visits</h2><p>Tell us your preferences. The guide selects real attractions and compares their order against opening hours, Google travel times, budget evidence and your return deadline.</p>
    {fieldIssues.length > 0 && <div className="error-box guide-validation" id={validationId} role="alert"><b>Check these fields before planning:</b><ul>{fieldIssues.map(row => <li key={row.field + row.message}><strong>{row.label}:</strong> {row.message} <button type="button" className="text-button" onClick={() => { const scope = root.current?.closest<HTMLElement>('.live-form') ?? root.current; if (scope) focusGuideField(scope, row.field); }}>Go to {row.label}</button></li>)}</ul></div>}
    <fieldset><legend>Your interests</legend><div className="choice-chips">{interests.map(interest => <button type="button" key={interest} aria-pressed={preferences.interests?.includes(interest)} onClick={() => update({ interests: preferences.interests?.includes(interest) ? preferences.interests.filter(i => i !== interest) : [...(preferences.interests ?? []), interest] })}>{interest.replaceAll('_', ' ')}</button>)}</div></fieldset>
    <div className="form-grid">{(['pace', 'groupType', 'environment', 'mobility', 'travelMode'] as const).map(field => <label key={field}>{({ pace: 'Preferred pace', groupType: 'Group type', environment: 'Indoor or outdoor', mobility: 'Mobility requirements', travelMode: 'Travel mode' })[field]}<select data-guide-field={field} value={preferences[field]} onChange={e => update({ [field]: e.target.value })}>{({ pace: ['relaxed', 'balanced', 'packed'], groupType: ['unspecified', 'solo', 'couple', 'friends', 'family', 'seniors'], environment: ['any', 'indoor', 'outdoor'], mobility: ['standard', 'limited', 'wheelchair'], travelMode: ['DRIVE', 'WALK', 'BICYCLE'] })[field].map(value => <option key={value} value={value}>{value}</option>)}</select></label>)}</div>
    <fieldset className="meal-preferences"><legend>Meal along your route</legend>
      <label className="checkbox-row"><input type="checkbox" checked={preferences.mealBreak ?? true} onChange={e => update({ mealBreak: e.target.checked })} /><span>Include meal</span></label>
      <p className="field-note">When your itinerary reaches 13:00–14:00 in the destination's timezone, add one nearby restaurant stop. Early-finishing and evening-only trips have no meal stop. Eating and travel time are included in your day; uncheck to exclude meals.</p>
      {(preferences.mealBreak ?? true) && <details><summary>Meal duration and detour limits</summary><div className="form-grid"><label>Meal duration (minutes)<input data-guide-field="meals.lunch.durationMinutes" type="number" min={15} max={120} value={meals.lunch.durationMinutes} onChange={e => update({ meals: { ...meals, lunch: { ...meals.lunch, durationMinutes: e.target.valueAsNumber } } })} /></label><label>Maximum distance from previous visit (km)<input data-guide-field="meals.nearbyMeters" type="number" min={0.1} max={3} step={0.1} value={meals.nearbyMeters / 1000} onChange={e => update({ meals: { ...meals, nearbyMeters: Math.round(e.target.valueAsNumber * 1000) } })} /></label><label>Maximum extra travel per meal (minutes)<input data-guide-field="meals.maxExtraMinutes" type="number" min={0} max={30} value={meals.maxExtraMinutes} onChange={e => update({ meals: { ...meals, maxExtraMinutes: e.target.valueAsNumber } })} /></label><label>Maximum extra distance per meal (km)<input data-guide-field="meals.maxExtraMeters" type="number" min={0} max={5} step={0.1} value={meals.maxExtraMeters / 1000} onChange={e => update({ meals: { ...meals, maxExtraMeters: Math.round(e.target.valueAsNumber * 1000) } })} /></label></div></details>}
    </fieldset>
    <details><summary>Cost estimates, breaks and guide notes</summary><div className="form-grid">{(['perPersonBudget', 'mealGroupEstimate', 'transportGroupEstimate', 'transportPerKmEstimate', 'bufferMinutes'] as const).map(field => <label key={field}>{({ perPersonBudget: 'Optional per-person budget limit', mealGroupEstimate: 'Your group meal estimate', transportGroupEstimate: 'Your fixed group transport estimate', transportPerKmEstimate: 'Your group transport estimate per km', bufferMinutes: 'Arrival buffer (minutes)' })[field]}<input data-guide-field={field} type="number" min={0} max={field === 'bufferMinutes' ? 45 : undefined} step={field === 'bufferMinutes' ? 1 : 0.01} value={preferences[field] ?? ''} onChange={e => update({ [field]: e.target.value === '' ? null : e.target.valueAsNumber })} /></label>)}</div>
      <label className="checkbox-row"><input type="checkbox" checked={preferences.restBreaks} onChange={e => update({ restBreaks: e.target.checked })} /><span>Include rest time</span></label><label>Tell the guide what matters<textarea data-guide-field="notes" maxLength={1200} value={preferences.notes} onChange={e => update({ notes: e.target.value })} /></label><label className="checkbox-row"><input type="checkbox" checked={preferences.useAI} onChange={e => update({ useAI: e.target.checked })} /><span>Use configured AI planning</span></label>
    </details><p className="field-note">{preferences.useAI === false ? 'AI planning is off; local scheduling rules choose the day.' : props.assistantMode === 'gemini' ? 'Gemini proposes priorities, visit allowances and time-of-day preferences. Google data and scheduling rules validate the final day.' : props.assistantMode === 'openai' ? 'Configured AI proposes priorities; Google data and scheduling rules validate the day.' : 'Local planning rules are active. Gemini is not configured; no Gemini model is called.'} Visit allowances are estimates, not measured average dwell times. Best visiting conditions and unknown fees need confirmation.</p>
    <button type="button" className="button primary" disabled={!props.ready || busy} onClick={() => void generate('smart', true)}>{busy ? 'Choosing places and comparing routes…' : 'Plan my day'}</button>
    {error && <p className="error-box" role="alert">{error}</p>}{warnings.map((warning, i) => <p key={i} className="field-note">{warning}</p>)}
    {!!choices.length && <details><summary>Adjust the planned visits</summary><p>Changes are recalculated in your order. Optimize route explicitly to choose a new sequence.</p><ol className="guide-edit-list">{choices.map((row, index) => { const c = bank.find(c => c.location.id === row.locationId)!; const patch = (values: Partial<GuideStop>) => edit(choices.map(s => s.locationId === row.locationId ? { ...s, ...values } : s)); return <li key={row.locationId}><b>{index + 1}. {c.location.name}</b><label>Visit duration for {c.location.name}<input type="number" min={10} max={240} value={row.durationMinutes} onChange={e => patch({ durationMinutes: e.target.valueAsNumber, durationSource: 'user' })} /></label><label>Preferred arrival at {c.location.name}<input type="time" value={row.preferredTime ?? ''} onChange={e => patch({ preferredTime: e.target.value || null })} /></label><label className="checkbox-row"><input type="checkbox" checked={row.mustVisit} onChange={e => patch({ mustVisit: e.target.checked })} /><span>Must visit {c.location.name}</span></label><label className="checkbox-row"><input type="checkbox" checked={row.locked} onChange={e => patch({ locked: e.target.checked })} /><span>Lock {c.location.name} in this position</span></label><div className="button-row"><button type="button" className="text-button" disabled={busy || !index || row.locked || choices[index - 1]?.locked} onClick={() => move(index, -1)}>Move {c.location.name} up</button><button type="button" className="text-button" disabled={busy || index === choices.length - 1 || row.locked || choices[index + 1]?.locked} onClick={() => move(index, 1)}>Move {c.location.name} down</button><button type="button" className="text-button" disabled={busy || row.locked || row.mustVisit} onClick={() => { excluded.current.add(c.location.placeId!); edit(choices.filter(s => s.locationId !== row.locationId)); }}>Remove {c.location.name}</button></div></li>; })}</ol></details>}
    {!!choices.length && <div className="button-row"><button type="button" className="button secondary" disabled={!props.ready || busy} onClick={() => void generate(mode)}>Recalculate my day</button><button type="button" className="button secondary" disabled={!props.ready || busy} onClick={() => void generate('smart')}>Optimize route</button></div>}
    {result && <><GuideReview plan={result} activeIndex={props.activeIndex} onHighlight={props.onHighlight} /><label className="checkbox-row"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /><span>I will confirm unverified hours, costs, accessibility and food preparation before visiting</span></label><button type="button" className="button primary" disabled={!ack || busy || Date.parse(result.itinerary.route.expiresAt) <= Date.now()} onClick={() => { if (Date.parse(result.itinerary.route.expiresAt) <= Date.now()) { setError('This route estimate expired. Recalculate before accepting.'); return; } callbacks.current.onAccept(result); }}>Accept this guided itinerary</button></>}
  </section>;
}
