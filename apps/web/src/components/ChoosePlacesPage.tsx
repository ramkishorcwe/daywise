import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Plus, Route, Trash2 } from 'lucide-react';
import { defaultMealPreferences, guidePreferencesSchema, interests, type GuideCandidate, type GuidePlan, type SavedGuide } from '../../../../packages/contracts/src/guide';
import type { SelectedLocation } from '../../../../packages/contracts/src/locations';
import type { GuidePanelProps } from './GuidePanel';
import { addGuideCandidate, discoverGuide, planGuide } from '../guide-api';
import { priceRange } from '../trip-price';
import LocationField from './LocationField';
import { PlacePhoto } from './PlacePhoto';
import { GuideReview } from './GuideReview';
import ProviderMap from './ProviderMap';
import '../guide.css';
import '../choose-places.css';

type Props = Pick<GuidePanelProps, 'destination' | 'start' | 'end' | 'returnToStart' | 'allowOutsideStart' | 'date' | 'startTime' | 'endTime' | 'adults' | 'childAges' | 'budget' | 'currency' | 'dietaryRules' | 'ready' | 'initialPreferences'> & {
  active: boolean; missingReason: string; onBack: () => void; onAccept: (plan: GuidePlan, saved: SavedGuide) => void;
};
type Category = typeof interests[number];
type Choice = { candidate: GuideCandidate; minutes: number };
const label = (category: string) => category.replaceAll('_', ' ');

export default function ChoosePlacesPage(props: Props) {
  const [category, setCategory] = useState<Category | null>(null), [catalog, setCatalog] = useState<Partial<Record<Category, GuideCandidate[]>>>({});
  const [choices, setChoices] = useState<Choice[]>([]), [extra, setExtra] = useState<SelectedLocation | null>(null), [searchPending, setSearchPending] = useState(false);
  const [meal, setMeal] = useState(props.initialPreferences?.meals.lunch.enabled ?? true), [result, setResult] = useState<GuidePlan | null>(null), [acceptedProfile, setAcceptedProfile] = useState<SavedGuide | null>(null);
  const [busy, setBusy] = useState<'category' | 'add' | 'plan' | null>(null), [error, setError] = useState(''), [ack, setAck] = useState(false), [activeStop, setActiveStop] = useState<number>();
  const [clock, setClock] = useState(Date.now());
  const controller = useRef<AbortController | null>(null), sequence = useRef(0), pending = useRef(false);
  const profile = guidePreferencesSchema.safeParse({ ...props.initialPreferences, interests: [], useAI: false,
    adults: props.adults, childAges: props.childAges, groupBudget: props.budget.trim() ? Number(props.budget) : null, currency: props.currency || null, dietaryRules: props.dietaryRules,
    mealBreak: meal, meals: { ...defaultMealPreferences, ...props.initialPreferences?.meals, lunch: { ...(props.initialPreferences?.meals.lunch ?? defaultMealPreferences.lunch), enabled: meal } } });
  const cityKey = `${props.destination?.id}:${props.date}`;
  const context = JSON.stringify({ cityKey, start: props.start?.id, end: props.end?.id, same: props.returnToStart, outside: props.allowOutsideStart, startTime: props.startTime, endTime: props.endTime, preferences: profile.success ? profile.data : null, ready: props.ready });
  function cancel() { sequence.current++; controller.current?.abort(); pending.current = false; setBusy(null); }
  function invalidate() { setResult(null); setAcceptedProfile(null); setAck(false); setError(''); setActiveStop(undefined); }
  const previousCity = useRef(cityKey), previousContext = useRef(context);
  useEffect(() => { if (previousContext.current !== context) { previousContext.current = context; cancel(); invalidate(); setCatalog({}); } }, [context]);
  useEffect(() => { if (previousCity.current !== cityKey) { previousCity.current = cityKey; setChoices([]); setExtra(null); setCategory(null); } }, [cityKey]);
  useEffect(() => { if (!props.active) cancel(); }, [props.active]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 15000); return () => { clearInterval(timer); sequence.current++; controller.current?.abort(); }; }, []);
  function begin(kind: NonNullable<typeof busy>) { cancel(); const abort = new AbortController(); controller.current = abort; pending.current = true; setBusy(kind); setError(''); return { abort, id: sequence.current }; }
  const current = (id: number, abort: AbortController) => id === sequence.current && !abort.signal.aborted;
  function failure(error: unknown) { setError(error instanceof Error ? error.message : 'The provider request failed. Retry.'); }
  async function browse(next: Category, refresh = false) {
    if (!props.destination || !props.date || !profile.success || busy === 'plan' || busy === 'add') return;
    cancel(); setCategory(next); setError('');
    if (!refresh && catalog[next]) return;
    const { abort, id } = begin('category');
    try {
      const data = await discoverGuide(props.destination.id, props.date, { ...profile.data, interests: [next] }, abort.signal);
      if (current(id, abort)) setCatalog(old => ({ ...old, [next]: data.candidates }));
    } catch (error) { if (current(id, abort)) failure(error); }
    finally { if (current(id, abort)) { pending.current = false; setBusy(null); } }
  }
  function add(candidate: GuideCandidate) {
    if (pending.current || searchPending) return;
    if (choices.some(row => row.candidate.location.placeId === candidate.location.placeId)) return;
    if (choices.length >= 5) { setError('You can choose up to five visits. Remove one before adding another.'); return; }
    if (profile.success && profile.data.visitedPlaceIds.includes(candidate.location.placeId ?? '')) { setError('This place is marked already visited in your preferences. Update that preference in the day planner before adding it.'); return; }
    if (Date.parse(candidate.location.expiresAt) <= Date.now()) { setError('This place selection expired. Refresh its category or search and select it again.'); return; }
    invalidate(); setChoices(old => old.length >= 5 || old.some(row => row.candidate.location.placeId === candidate.location.placeId) ? old : [...old, { candidate, minutes: candidate.suggestedMinutes }]);
  }
  async function addSearchedPlace() {
    if (!extra || !props.destination || !profile.success || pending.current || choices.length >= 5) return;
    if (choices.some(row => row.candidate.location.placeId === extra.placeId)) { setError('This place is already in your visits.'); return; }
    const { abort, id } = begin('add');
    try {
      const candidate = await addGuideCandidate(props.destination.id, props.date, profile.data, extra.id, abort.signal);
      if (!current(id, abort)) return;
      if (!candidate.location.city || candidate.location.city.countryCode !== props.destination.city?.countryCode) throw new Error('Choose a place in the destination country. Check its address before adding it.');
      if (profile.data.visitedPlaceIds.includes(candidate.location.placeId ?? '')) throw new Error('This place is marked already visited. Update that preference in the day planner before adding it.');
      invalidate(); setChoices(old => [...old, { candidate, minutes: candidate.suggestedMinutes }]); setExtra(null);
    } catch (error) { if (current(id, abort)) failure(error); }
    finally { if (current(id, abort)) { pending.current = false; setBusy(null); } }
  }
  async function optimize() {
    if (!props.ready || !profile.success || !props.destination || !props.start || !choices.length || pending.current || searchPending) return;
    if (choices.some(row => !Number.isInteger(row.minutes) || row.minutes < 10 || row.minutes > 240)) { setError('Each visit duration must be a whole number from 10 to 240 minutes.'); return; }
    if (choices.some(row => Date.parse(row.candidate.location.expiresAt) <= Date.now())) { setError('A selected place expired. Remove it and add it again from refreshed results or search.'); return; }
    invalidate(); const { abort, id } = begin('plan');
    const timeout = setTimeout(() => { if (current(id, abort)) { cancel(); setError('Route optimization took too long. Retry. Your accepted trip is preserved.'); } }, 90000);
    const stops = choices.map(row => ({ locationId: row.candidate.location.id, durationMinutes: row.minutes, durationSource: 'user' as const, mustVisit: true, locked: false, preferredTime: null, costEstimate: null }));
    try {
      const plan = await planGuide({ destinationId: props.destination.id, startId: props.start.id, endId: props.returnToStart ? null : props.end!.id, returnToStart: props.returnToStart, allowOutsideStart: props.allowOutsideStart, date: props.date, startTime: props.startTime, endTime: props.endTime, preferences: profile.data, orderMode: 'smart', chosenPlaces: true, stops }, abort.signal);
      if (!current(id, abort)) return;
      const visits = plan.itinerary.stops.filter((_, i) => !plan.stops[i].mealKind);
      if (visits.length !== choices.length || choices.some(row => !visits.some(s => s.location.placeId === row.candidate.location.placeId))) throw new Error('The route did not preserve every chosen visit. Nothing was accepted. Retry or adjust your selection.');
      setResult(plan); setAcceptedProfile({ preferences: profile.data, stops: stops.map(({ locationId, ...own }) => ({ ...own, placeId: choices.find(row => row.candidate.location.id === locationId)!.candidate.location.placeId! })) });
    } catch (error) { if (current(id, abort)) failure(error); }
    finally { clearTimeout(timeout); if (current(id, abort)) { pending.current = false; setBusy(null); } }
  }
  const disabled = !!busy || searchPending;
  const rows = category ? catalog[category] : undefined;
  const mapPoints = result ? [result.itinerary.start, ...result.itinerary.stops.map(row => row.location), result.itinerary.end] : [props.start, ...choices.map(row => row.candidate.location), props.returnToStart ? props.start : props.end].filter((row): row is SelectedLocation => !!row);
  return <section className="choose-places-page" hidden={!props.active} aria-label="Choose your places">
    <button type="button" className="text-button" onClick={props.onBack}><ArrowLeft size={16} /> Back to day planner</button>
    <div className="choose-places-intro"><h2>Choose your places</h2><p>{props.destination?.name ?? 'Select a destination in the day planner'}{props.date ? ` · ${props.date}` : ''}</p><p>Pick up to five visits. We compare their order using Google travel times, opening windows and your return deadline. Every chosen visit stays required.</p></div>
    <div className="choose-places-layout"><div className="choose-catalog live-card">
      <h3>Browse by category</h3><p className="field-note">Real Google results for your city and nearby area; this is a shortlist, not a complete directory. Categories filter browsing. Your budget, food and accessibility preferences still apply.</p>
      <div className="interest-chips" aria-label="Place categories">{interests.map(value => <button type="button" key={value} aria-pressed={category === value} className={`interest-chip ${category === value ? 'selected' : ''}`} disabled={!props.destination || !props.date || !profile.success || busy === 'plan' || busy === 'add'} onClick={() => void browse(value)}>{label(value)}</button>)}</div>
      {!profile.success && <p className="error-box" role="alert">{profile.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(' ')} Return to the planner to fix these preferences.</p>}
      {busy === 'category' && <p role="status">Loading {label(category ?? '')} from Google…</p>}
      {!category && <p className="field-note">Choose a category to load places. Browsing never generates an itinerary.</p>}
      {category && busy !== 'category' && <div className="button-row"><h3>{label(category)}</h3><button type="button" className="text-button" disabled={disabled} onClick={() => void browse(category, true)}>Refresh category</button></div>}
      {rows && busy !== 'category' && <div className="choose-place-grid">{rows.map(candidate => { const selected = choices.some(row => row.candidate.location.placeId === candidate.location.placeId); return <article className="choose-place-card" key={candidate.location.placeId}>
        <PlacePhoto placeId={candidate.location.placeId} name={candidate.location.name} /><div className="choose-place-content"><h4>{candidate.location.name}</h4><p>{candidate.location.address}</p>{candidate.location.city?.placeId !== props.destination?.city?.placeId && <p className="field-note">Outside or unverified against the city boundary. Review the address and travel time.</p>}<p className="field-note">{candidate.facts.rating !== null && `Google rating ${candidate.facts.rating}/5 · `}{candidate.suggestedMinutes} min suggested</p><p className="field-note">{candidate.facts.admission ? `${priceRange(candidate.facts.admission.minimum, candidate.facts.admission.maximum, candidate.facts.admission.currency)} · ${candidate.facts.admission.basis.replaceAll('_', ' ')}` : 'Admission price unverified'}</p><button type="button" className="button secondary" disabled={disabled || selected || choices.length >= 5} onClick={() => add(candidate)}>{selected ? 'Added' : <><Plus size={15} /> Add {candidate.location.name}</>}</button></div>
      </article>; })}</div>}
      {rows?.length === 0 && <p role="status">No matching places returned. Try another category or search below.</p>}
      <div className="choose-place-search"><h3>Find a specific place</h3><LocationField label="Search another place" value={extra} change={setExtra} bias={props.destination?.coordinates} onPending={setSearchPending} /><button type="button" className="button secondary" disabled={!extra || disabled || !props.destination || !props.date || !profile.success || choices.length >= 5} onClick={() => void addSearchedPlace()}>Add searched place</button></div>
    </div><aside className="choose-selection live-card"><h3>Your visits · {choices.length}/5</h3>{choices.length === 0 && <p>Add places from a category or search.</p>}
      <ol className="choose-selected-list">{choices.map(({ candidate, minutes }) => <li key={candidate.location.placeId}><div><b>{candidate.location.name}</b><button type="button" className="icon-button" aria-label={`Remove ${candidate.location.name}`} disabled={disabled} onClick={() => { invalidate(); setChoices(old => old.filter(row => row.candidate.location.placeId !== candidate.location.placeId)); }}><Trash2 size={16} /></button></div><p className="field-note">{candidate.location.address}</p><label>Minutes at {candidate.location.name}<input type="number" min={10} max={240} step={5} value={Number.isFinite(minutes) ? minutes : ''} disabled={disabled} onChange={event => { const value = event.target.valueAsNumber; invalidate(); setChoices(old => old.map(row => row.candidate.location.placeId === candidate.location.placeId ? { ...row, minutes: value } : row)); }} /></label></li>)}</ol>
      <label className="checkbox-row"><input type="checkbox" checked={meal} disabled={disabled} onChange={event => { invalidate(); setMeal(event.target.checked); }} /><span>Include a midday meal if the trip reaches 13:00–14:00</span></label>
      <p className="field-note">{props.start?.name ?? 'Choose a starting point'} → {props.returnToStart ? 'Return to your starting point' : props.end?.name ?? 'Choose a return point'} · {props.startTime}–{props.endTime}. {profile.success && `Travel: ${profile.data.travelMode}.`}</p>
      {profile.success && <details><summary>Applied trip preferences</summary><p className="field-note">{props.adults} adults · {props.childAges.length} children · {props.budget.trim() ? `${props.budget} ${props.currency} group budget` : 'No group budget entered'} · {profile.data.environment} environment · {profile.data.mobility} mobility · {props.dietaryRules.length ? props.dietaryRules.join(', ') : 'Any food'}. Return to the planner to change these.</p></details>}
      {!props.ready && <p role="status" className="field-note">{props.missingReason || 'Complete your city, starting point and travel times in the planner.'}</p>}
      <button type="button" className="button primary" disabled={!props.ready || !profile.success || !choices.length || disabled} onClick={() => void optimize()}><Route size={17} />{busy === 'plan' ? 'Optimizing your route…' : 'Optimize route'}</button>
      <p className="field-note">Only this button requests a route. Accepting the result saves it.</p>
    </aside></div>
    {error && <div role="alert" className="error-box">{error}</div>}
    {result && <section className="choose-route-review"><h2>Your optimized journey</h2><ProviderMap route={result.itinerary.route} points={mapPoints.map(row => ({ name: row.name, coordinates: row.coordinates }))} activeIndex={activeStop} onSelectStop={index => setActiveStop(index > 0 && index <= result.stops.length ? index : undefined)} /><GuideReview plan={result} activeIndex={activeStop} onHighlight={setActiveStop} /><label className="checkbox-row"><input type="checkbox" checked={ack} onChange={event => setAck(event.target.checked)} /><span>I will confirm unverified hours, costs, accessibility and food preparation before visiting</span></label><button type="button" className="button primary" disabled={!ack || !acceptedProfile || disabled || Date.parse(result.itinerary.route.expiresAt) <= clock} onClick={() => { if (Date.parse(result.itinerary.route.expiresAt) <= Date.now()) { setError('This route estimate expired. Optimize again before accepting.'); return; } props.onAccept(result, acceptedProfile!); }}>Accept my chosen itinerary</button>{Date.parse(result.itinerary.route.expiresAt) <= clock && <p role="status">Route estimate expired. Optimize again before accepting.</p>}</section>}
  </section>;
}
