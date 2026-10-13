import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bookmark, CalendarDays, Check, ChevronDown, Clock3, Compass, Coffee, Download, Edit3, Footprints, Info, Leaf, LoaderCircle, MapPin, Plus, RefreshCw, Route, Save, ShieldCheck, Sparkles, Users, Utensils, Wallet, X } from 'lucide-react';
import { cities, defaultInput, getCity } from '../../../fixtures/cities';
import { categoryNames, dietNames, type TripInput, type Plan, type PlanningResult, type TripSession, type PlannedStop, type ConfirmedPlan, type ExpenseLedger } from '../../../packages/contracts/src';
import { formatMoney, formatRange } from '../../../packages/domain/src/money';
import { formatTime } from '../../../packages/domain/src/time-format';
import { eligible } from '../../../packages/domain/src/eligibility';
import { confirmPlan, planChanges, sameValue } from '../../../packages/domain/src/versioning';
import { calculatePlan } from './planning';
import { addSeparateSession, commitLocalDay, deleteSession, listSessions, saveSession } from './storage';
import type { ReuseDay as ReuseOptions } from '../../../packages/contracts/src/reuse-day';
import type { DayBackup } from '../../../packages/contracts/src/backup';
import { resumeSnapshot } from '../../../packages/domain/src/day-view';
const PlannerForm = lazy(() => import('./components/PlannerForm'));
const Connections = lazy(() => import('./components/Connections'));
const Assistant = lazy(() => import('./components/Assistant'));
const DayView = lazy(() => import('./components/DayView'));
const ExpenseTracker = lazy(() => import('./components/ExpenseTracker'));
const TravelCopy = lazy(() => import('./components/TravelCopy'));
const BackupRestore = lazy(() => import('./components/BackupRestore'));
const FoodOptions = lazy(() => import('./components/FoodOptions'));
const LocalDayUpdates = lazy(() => import('./components/LocalDayUpdates'));
const ReturnReport = lazy(() => import('./components/ReturnReport'));
const ReuseDay = lazy(() => import('./components/ReuseDay'));
const SavedPlans = lazy(() => import('./components/SavedPlans'));
import Schematic from './components/Schematic';
import Budget from './components/Budget';
import Dialog from './components/Dialog';

function newSession(input: TripInput): TripSession { return { schemaVersion: 1, id: crypto.randomUUID(), title: `A day in ${getCity(input.cityId)?.name ?? 'a new city'}`, input, draftOrder: null, confirmed: null, updatedAt: new Date().toISOString() }; }
type Review = { input: TripInput; plan: Plan; expectedId: string | null };
export default function App() {
  const [session, setSession] = useState(() => newSession(defaultInput(cities[0])));
  const activeSession = useRef(session); activeSession.current = session;
  const [result, setResult] = useState<PlanningResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Loading saved drafts…');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState<'plan' | 'saved' | 'budget' | 'day'>('plan');
  const [formOpen, setFormOpen] = useState(false);
  const [focusLocation, setFocusLocation] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [copySession, setCopySession] = useState<TripSession | null>(null);
  const [backupSession, setBackupSession] = useState<TripSession | null>(null);
  const [foodContext, setFoodContext] = useState<{ session: TripSession; plan: Plan | null } | null>(null);
  const [localDay, setLocalDay] = useState<TripSession | null>(null);
  const [returnDay, setReturnDay] = useState<TripSession | null>(null);
  const [reuseSource, setReuseSource] = useState<TripSession | null>(null);
  const [backend, setBackend] = useState(false);
  const [saved, setSaved] = useState<TripSession[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false), [libraryError, setLibraryError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlannedStop | null>(null);
  const [picker, setPicker] = useState<string | 'add' | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ input: TripInput; order: string[] } | null>(null);
  const request = useRef<AbortController | null>(null);
  const city = getCity(session.input.cityId)!;
  const plan = result?.outcome === 'feasible' ? result.plan : null;
  const party = session.input.adults + session.input.childAges.length;
  const confirmed = session.confirmed;
  const progressActive = !!session.assistant?.progress?.revision;
  const sameAsConfirmed = !!(plan && confirmed && sameValue(plan, confirmed.plan) && sameValue(session.input, confirmed.input));

  async function build(input: TripInput, order: string[] | null) {
    if (progressActive && input.cityId === session.input.cityId) { setNotice(session.assistant?.tripId === null ? 'Progress stays on this device. Use Local day updates for a reviewed remaining-day change or start another day for a fresh plan.' : 'Use assistant proposals for this day with reported progress, or start another day.'); return; }
    if (input.cityId !== session.input.cityId) {
      const departingId = session.id;
      try { await saveSession(session); }
      catch { setNotice('Your current day could not be saved. Retry saving before changing cities.'); return; }
      if (activeSession.current.id !== departingId) return;
    }
    setSession(previous => ({ ...(previous.input.cityId === input.cityId ? previous : newSession(input)), input, draftOrder: order, updatedAt: new Date().toISOString() }));
    await calculateDraft(input, order);
  }
  async function calculateDraft(input: TripInput, order: string[] | null) {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setResult(null); setError(''); setSelected(null); setView('plan');
    try {
      const next = await calculatePlan(input, order, controller.signal);
      if (!controller.signal.aborted) setResult(next);
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The planner could not run.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function openSession(next: TripSession) {
    request.current?.abort(); setBusy(false); setError(''); setReview(null); setUndo(null); setSelected(null); setView('plan'); setSession({ ...next, updatedAt: new Date().toISOString() });
    const snapshot = resumeSnapshot(next);
    if (snapshot) { setResult({ outcome: 'feasible', plan: snapshot }); setNotice('Your accepted schedule was restored exactly. Remaining estimates may need review; no new calculation or confirmation was made.'); }
    else await calculateDraft(next.input, next.draftOrder);
  }
  useEffect(() => {
    let canceled = false;
    listSessions().then(({ sessions, skipped }) => {
      if (canceled) return;
      const restored = sessions.find(item => getCity(item.input.cityId));
      setSaved(sessions);
      if (skipped) setNotice(`${skipped} saved record(s) use invalid or unsupported data. They were preserved, not overwritten.`);
      const next = restored ?? newSession(defaultInput(cities[0]));
      setHydrated(true); void openSession(next);
    }).catch(() => { if (!canceled) { setNotice('Device storage is unavailable. You can plan in memory, but reload may lose this draft.'); setHydrated(true); void build(session.input, null); } });
    return () => { canceled = true; request.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    setSaveStatus('Saving on this device…');
    let active = true;
    const timer = setTimeout(() => { saveSession(session).then(() => { if (active) setSaveStatus('Saved on this device'); }).catch(() => { if (active) setSaveStatus('Not saved · storage unavailable'); }); }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [session, hydrated]);
  async function saveNow() {
    try { await saveSession(session); setSaveStatus('Saved on this device'); setNotice('Your draft and confirmed plan are saved on this device.'); }
    catch { setNotice('Saving failed. This draft is still available in memory. Check browser storage permissions and retry.'); }
  }
  async function openLibrary() {
    setView('saved'); setLibraryLoading(true); setLibraryError('');
    try { await saveSession(session); const response = await listSessions(); setSaved(response.sessions); }
    catch { setLibraryError('Saved days could not be refreshed.'); }
    finally { setLibraryLoading(false); }
  }
  function editOrder(order: string[]) {
    if (progressActive) { setNotice(session.assistant?.tripId === null ? 'Use Local day updates for a reviewed remaining-day change or start another day to change preferences. Completed stops stay preserved.' : 'Use the assistant to change a day with reported progress. Completed stops stay fixed.'); return; }
    if (!plan) return;
    setUndo({ input: session.input, order: plan.order }); void build(session.input, order);
  }
  function move(id: string, delta: number) {
    if (!plan) return;
    const next = [...plan.order], index = next.indexOf(id);
    if (index + delta < 0 || index + delta >= next.length) return;
    [next[index], next[index + delta]] = [next[index + delta], next[index]]; editOrder(next);
  }
  function accept(candidate: Review) {
    if (progressActive) { setNotice('Use an assistant proposal to confirm changes after reporting progress.'); return; }
    try {
      const next = confirmPlan(candidate.input, candidate.plan, session.confirmed, candidate.expectedId);
      setSession(previous => ({ ...previous, confirmed: next, assistant: undefined, updatedAt: new Date().toISOString() }));
      setReview(null); setNotice('Plan confirmed. Future edits stay in a separate draft until you accept them.');
    } catch (failure) { setReview(null); setError((failure as Error).message); }
  }
  function restoreConfirmed() {
    if (!confirmed) return;
    request.current?.abort(); setBusy(false); setError('');
    setSession(previous => ({ ...previous, input: confirmed.input, draftOrder: confirmed.plan.order, updatedAt: new Date().toISOString() }));
    setResult({ outcome: 'feasible', plan: structuredClone(confirmed.plan) }); setReview(null); setNotice('Your confirmed plan is unchanged.'); setUndo(null);
  }
  function chooseStop(id: string) { setSelected(id); document.getElementById(`stop-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  function applyAssistant(snapshot: ConfirmedPlan, expectedId: string): boolean {
    if (activeSession.current.id !== session.id || activeSession.current.completion || activeSession.current.confirmed?.id !== expectedId || (activeSession.current.assistant?.tripId === null && activeSession.current.assistant.progress?.revision)) return false;
    request.current?.abort(); setBusy(false); setError(''); setUndo(null);
    setSession(previous => previous.id !== session.id || previous.completion || previous.confirmed?.id !== expectedId ? previous : ({ ...previous, input: snapshot.input, confirmed: snapshot, draftOrder: snapshot.plan.order, updatedAt: new Date().toISOString() }));
    setResult({ outcome: 'feasible', plan: structuredClone(snapshot.plan) }); setNotice('Assistant revision accepted. Completed stops and strict requirements are retained.'); return true;
  }
  async function startAnotherDay() {
    const departingId = session.id;
    try { await saveSession(session); }
    catch { setNotice('Your current day could not be saved. Retry saving before starting another day.'); return; }
    if (activeSession.current.id !== departingId) return;
    request.current?.abort(); setBusy(false); setError(''); setReview(null);
    setSession(newSession(defaultInput(city))); setResult(null); setUndo(null); setFormOpen(true); setView('plan');
  }
  function updateExpenses(ledger: ExpenseLedger, expectedId: string) {
    const expectedSessionId = session.id;
    setSession(previous => previous.id === expectedSessionId && previous.confirmed?.id === expectedId ? { ...previous, expenses: ledger, updatedAt: new Date().toISOString() } : previous);
  }
  async function restoreBackup(backup: DayBackup) {
    const city = getCity(backup.session.input.cityId); if (!city) throw new Error('Unsupported backup city.');
    const { restoredDay } = await import('../../../packages/domain/src/backup');
    const next = restoredDay(backup, city); await addSeparateSession(next);
    setSaved(previous => [next, ...previous].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }
  function chooseFood(order: string[]) {
    if (!foodContext || activeSession.current.id !== foodContext.session.id || !sameValue(activeSession.current.input, foodContext.session.input) || !sameValue(plan, foodContext.plan) || activeSession.current.assistant?.progress?.revision) {
      setFoodContext(null); setNotice('Your day changed while comparing meals. Reopen Food options to review the current draft.'); return;
    }
    setFoodContext(null); editOrder(order);
  }
  async function createReusedDay(source: TripSession, options: ReuseOptions) {
    const catalog = getCity(source.input.cityId); if (!catalog) throw new Error('This saved city is not supported.');
    const { reusedDraft } = await import('../../../packages/domain/src/reuse-day');
    const next = reusedDraft(source, catalog, options);
    try { await addSeparateSession(next); }
    catch { throw new Error('The separate draft could not be saved. Existing days are unchanged. Check storage and retry.'); }
    setSaved(previous => [next, ...previous].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }
  async function applyLocalDay(source: TripSession, next: TripSession) {
    if (!sameValue(activeSession.current, source)) throw new Error('Your active day changed. Reopen local updates for the current day.');
    try { await commitLocalDay(source, next); }
    catch (failure) { throw new Error(`Local update could not be saved. Your current day is unchanged. ${failure instanceof Error ? failure.message : 'Check device storage and retry.'}`); }
    if (!sameValue(activeSession.current, source)) throw new Error('The saved day was updated separately. Reopen it from Saved plans; your current view was preserved.');
    request.current?.abort(); setBusy(false); setError(''); setUndo(null); setReview(null);
    setSession(next); setResult({ outcome: 'feasible', plan: structuredClone(next.confirmed!.plan) });
    setLocalDay(previous => previous ? next : null); setSaveStatus('Saved on this device');
  }
  const travelMinutes = plan ? plan.stops.reduce((sum, stop) => sum + stop.incomingLeg.durationMinutes, 0) + plan.returnLeg.durationMinutes : 0;
  const visitsCount = plan?.stops.filter(s => s.kind === 'visit').length ?? 0;
  const dateLabel = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${session.input.date}T12:00:00Z`));
  const replacement = picker && picker !== 'add' ? city.places.find(p => p.id === picker) : null;
  const ideas = city.places.filter(p => eligible(p, session.input) && !plan?.order.includes(p.id) && (replacement ? (p.category === 'food') === (replacement.category === 'food') : !(p.category === 'food' && plan?.stops.some(s => s.kind === 'meal'))));

  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Skip to planner</a>
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setView('plan'); }}><span className="brand-mark"><Compass size={25} strokeWidth={1.8} /></span>daywise<span className="brand-dot">.</span></a>
      <div className="sidebar-caption">A LITTLE LESS PLANNING.<br />A LITTLE MORE LIVING.</div>
      <nav aria-label="Main navigation"><button className={view === 'plan' ? 'nav active' : 'nav'} onClick={() => setView('plan')}><Route size={19} /> My day plan <span className="nav-count">1</span></button><button className={view === 'saved' ? 'nav active' : 'nav'} onClick={openLibrary}><Bookmark size={19} /> Saved plans</button><button className={view === 'budget' ? 'nav active' : 'nav'} onClick={() => setView('budget')}><Wallet size={19} /> Trip budget</button><button className={view === 'day' ? 'nav active' : 'nav'} onClick={() => setView('day')} aria-label="Follow my day"><Footprints size={19} /> Follow my day</button><button className="nav" aria-label="Food options" onClick={() => setFoodContext({ session: structuredClone(session), plan: plan ? structuredClone(plan) : null })}><Utensils size={19} /> Food options</button><button className="nav" onClick={() => setAssistantOpen(true)}><Sparkles size={19} /> Travel assistant</button></nav>
      <button className="new-plan" aria-label="Plan another day" onClick={startAnotherDay}><Plus size={18} /> Plan another day</button>
      <div className="sidebar-bottom"><div className="sidebar-note"><Leaf size={24} /><p>Good days leave<br />room for discovery.</p><span>Keep the plan flexible.<br />Keep the choices yours.</span></div><div className="local-profile"><span className="avatar">Y</span><div><b>Your travel space</b><small>Private · this device</small></div></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">Your travel space <span>/</span> <b>{view === 'saved' ? 'Saved plans' : view === 'budget' ? 'Budget' : view === 'day' ? 'Follow my day' : 'Day planner'}</b></div><div className="topbar-actions"><button className="connection connection-button" aria-label="Data connections" onClick={() => setConnectionsOpen(true)}><i />{backend ? 'Backend connected · test data' : 'Data connections'}</button><button className="icon-button" aria-label="Edit preferences" onClick={() => setFormOpen(true)}><Edit3 size={18} /></button><span className="avatar small">Y</span></div></header>
      <main id="main-content">
        <div className="test-banner"><Info size={16} /><span><b>Test data workspace.</b> All venues, prices, hours and routes are fictional. Jaipur is our first test dataset; the product supports city expansion.</span><span className="test-badge">MILESTONE 16</span></div>
        {notice && <div className="notice" role="status"><span>{notice}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}
        <div className="page-heading"><div><span className="eyebrow">{view === 'saved' ? 'YOUR COLLECTION' : view === 'budget' ? 'EVERY COST, ACCOUNTED FOR' : view === 'day' ? 'ONE STOP AT A TIME' : 'A GOOD DAY STARTS HERE'}</span><h1>{view === 'saved' ? 'Days worth keeping.' : view === 'budget' ? 'A little clarity on costs.' : view === 'day' ? 'Keep your day in view.' : 'Your day, thoughtfully planned.'}</h1><p>{view === 'saved' ? 'Private drafts and confirmed plans, saved in this browser.' : view === 'budget' ? 'Estimates, booked commitments and actual totals for your whole group.' : view === 'day' ? 'Your accepted plan, reported progress, and the next step.' : 'Less backtracking. A proper lunch. Room to enjoy the moment.'}</p></div><div className="page-heading-actions"><button className="button secondary" aria-label="Create travel copy" disabled={!confirmed} title={confirmed ? 'Preview a read-only copy of the accepted day' : 'Confirm a day first'} onClick={() => setCopySession(structuredClone(session))}><Download size={16} /> Travel copy</button><button className="button secondary" onClick={saveNow}><Save size={16} /> Save draft</button></div></div>
        {view === 'day' ? <Suspense fallback={<p role="status">Opening your day…</p>}><DayView session={session} planner={() => setView('plan')} assistant={() => setAssistantOpen(true)} another={startAnotherDay} local={() => setLocalDay(structuredClone(session))} finish={() => setReturnDay(structuredClone(session))} /></Suspense> : view === 'saved' ? <Suspense fallback={<p role="status">Opening saved days…</p>}><SavedPlans saved={saved} loading={libraryLoading} readError={libraryError} refresh={() => void openLibrary()} open={item => { if (!getCity(item.input.cityId)) { setNotice('This saved destination is not supported by the current catalog.'); return; } void openSession(item); }} reuse={item => setReuseSource(structuredClone(item))} copy={item => setCopySession(structuredClone(item))} remove={setDeleteId} backup={() => setBackupSession(structuredClone(session))} planner={() => setView('plan')} /></Suspense> : <>
          <section className="trip-strip"><div className="destination"><span className="destination-icon"><MapPin size={21} /></span><div><small>DESTINATION · TEST DATA</small><label className="city-selector"><span className="sr-only">Destination city</span><select aria-label="Destination city" value={city.id} onChange={e => { setUndo(null); void build(defaultInput(getCity(e.target.value)!), null); }}>{cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><ChevronDown size={15} /></label></div></div><div className="trip-meta"><span><CalendarDays size={16} />{dateLabel}</span><span><Clock3 size={16} />{session.input.startTime}–{session.input.endTime}</span><span><Users size={16} />{party} traveler{party !== 1 ? 's' : ''}</span></div><button className="text-button" onClick={() => setFormOpen(true)}>Edit preferences <Edit3 size={14} /></button></section>
          <div className="preference-strip"><span className="pill"><Compass size={13} /> {session.input.pace} pace</span><span className="pill"><Route size={13} /> Car + walking</span><span className="pill"><Utensils size={13} /> {session.input.dietaryRules.length ? session.input.dietaryRules.map(rule => dietNames[rule]).join(' · ') : 'No strict food rules'}</span>{session.input.stepFree && <span className="pill">Step-free required</span>}<span className="save-indicator">{saveStatus}</span></div>
          {progressActive && <div className="confirmed-banner"><ShieldCheck size={19} /><div><b>Progress has been reported.</b><span>{session.completion ? 'Return has been reported. Start a separate day for a new itinerary.' : session.assistant?.tripId === null ? 'Use Local day updates to review the remaining day. Completed stops stay preserved.' : 'Use assistant proposals for this day. Completed stops stay fixed; old remaining estimates may be outdated.'}</span></div><button className="text-button" onClick={() => session.assistant?.tripId === null ? setView('day') : setAssistantOpen(true)}>{session.completion ? 'View completed day' : session.assistant?.tripId === null ? 'View local progress' : 'Review with assistant'}</button></div>}
          {confirmed && !sameAsConfirmed && <div className="confirmed-banner"><ShieldCheck size={19} /><div><b>Your confirmed plan is safe.</b><span>You’re editing a separate draft. Changes need your approval.</span></div><button className="text-button" onClick={restoreConfirmed}>Keep confirmed plan</button></div>}
          {view === 'budget' ? <Suspense fallback={<p role="status">Opening your budget…</p>}><ExpenseTracker key={`${session.id}:${confirmed?.id ?? 'draft'}`} session={session} city={city} draft={plan} changed={updateExpenses} planner={() => setView('plan')} /></Suspense> : busy ? <section className="empty-card loading" aria-live="polite"><LoaderCircle className="spin" size={36} /><h2>Making the day fit.</h2><p>Checking the test schedule, meals, return journey and group budget.</p><button className="button secondary" onClick={() => { request.current?.abort(); setBusy(false); setError('Planning canceled. Your saved preferences and confirmed plan are preserved.'); }}>Cancel planning</button></section> : error || result && result.outcome !== 'feasible' ? <section className="empty-card error-state" role="alert"><Info size={30} /><h2>This day needs a small adjustment.</h2>{error ? <p>{error}</p> : result && result.outcome !== 'feasible' && <ul>{result.issues.map(issue => <li key={issue.code}>{issue.message}</li>)}</ul>}<div className="button-row"><button className="button primary" onClick={() => setFormOpen(true)}>Adjust preferences</button>{undo && <button className="button secondary" onClick={() => { const previous = undo; setUndo(null); void build(previous.input, previous.order); }}>Undo last edit</button>}<button className="button secondary" onClick={() => void build(session.input, null)}>Try another draft</button></div><p className="field-note">No new plan was confirmed. The bounded planner does not claim every possible itinerary is impossible.</p></section> : !plan ? <section className="empty-card"><Compass size={35} /><h2>Where will the day take you?</h2><p>Start with a few essentials to build a test itinerary.</p><button className="button primary" onClick={() => setFormOpen(true)}>Plan my day</button></section> : <>
            <div className="stats-row"><div><span className="stat-icon green"><MapPin size={19} /></span><div><b>{visitsCount} visits</b><small>Plus meals & breathing room</small></div></div><div><span className="stat-icon blue"><Route size={19} /></span><div><b>{travelMinutes} min travel</b><small>Includes your return journey</small></div></div><div><span className="stat-icon amber"><Wallet size={19} /></span><div><b>{formatMoney(plan.total[1], city)}</b><small>Upper group estimate with reserve</small></div></div><div><span className="stat-icon mint"><Footprints size={19} /></span><div><b>{plan.totalWalkingMinutes} min walking</b><small>Within your {session.input.maxWalkingMinutes}-minute limit</small></div></div></div>
            <div className="planner-grid"><div className="day-column"><Schematic city={city} input={session.input} plan={plan} selected={selected} select={chooseStop} /><div className="timeline-heading"><div><span className="eyebrow">ONE DAY. YOUR WAY.</span><h2>Your itinerary <span>{plan.stops.length} stops</span></h2></div><button className="text-button" onClick={() => { setUndo(null); void build(session.input, null); }}><RefreshCw size={14} /> Replan draft</button></div>
              <div className="start-point"><span className="start-dot" /><b>{session.input.startTime}</b><span>Start at {city.anchors.find(a => a.id === session.input.startAnchorId)?.name}</span><button className="text-button" aria-label="Change starting point" disabled={progressActive} title={progressActive ? "Start another day to change the starting point after reporting progress" : "Choose a starting point"} onClick={() => { setFocusLocation(true); setFormOpen(true); }}>Change start <Edit3 size={13} /></button></div>
              <div className="timeline">{plan.stops.map((stop, index) => {
                const orderIndex = plan.order.indexOf(stop.id), number = plan.stops.slice(0, index + 1).filter(s => s.kind !== 'break').length;
                const nextLeg = plan.stops[index + 1]?.incomingLeg ?? plan.returnLeg;
                return <div className="timeline-item" id={`stop-${stop.id}`} key={stop.id}>
                  {stop.incomingLeg.durationMinutes > 0 && <div className="travel-connector"><Route size={13} /> {stop.incomingLeg.durationMinutes} min by car · {stop.incomingLeg.distanceKm} km · test estimate</div>}
                  <div className="stop-row"><div className="stop-time"><b>{formatTime(stop.arrivalMs, city.timezone)}</b><span>{formatTime(stop.departureMs, city.timezone)}</span></div><button className={`stop-number ${stop.kind === 'meal' ? 'meal' : stop.kind === 'break' ? 'rest' : ''}`} aria-label={`Select timeline stop ${stop.name}`} onClick={() => setSelected(stop.id)}>{stop.kind === 'break' ? <Coffee size={15} /> : number}</button>
                    <article className={`stop-card ${selected === stop.id ? 'selected' : ''} ${stop.kind === 'break' ? 'break-card' : ''}`}>
                      <div className="stop-card-top"><span className={`category-tag ${stop.kind}`}>{stop.kind === 'break' ? 'REST BREAK' : categoryNames[stop.category as keyof typeof categoryNames].toUpperCase()}</span>{city.places.find(p => p.id === stop.placeId)?.hiddenGem && <span className="hidden-gem"><Sparkles size={11} /> Hidden gem</span>}<span className="stop-cost">{formatRange(stop.cost, city)} <small>/ group</small></span></div><h3>{stop.name}</h3><p>{stop.reason}</p>
                      <div className="stop-footer"><span><Clock3 size={13} /> {stop.durationMinutes} min</span>{stop.waitMinutes > 0 && <span>{stop.waitMinutes} min wait for opening</span>}{stop.kind !== 'break' && <button className="text-button" onClick={() => setDetail(stop)}>Why this stop <Info size={12} /></button>}</div>
                      {stop.kind !== 'break' && <div className="stop-edit"><button className="icon-button" aria-label={`Move ${stop.name} earlier`} disabled={orderIndex === 0} onClick={() => move(stop.id, -1)}><ArrowUp size={14} /></button><button className="icon-button" aria-label={`Move ${stop.name} later`} disabled={orderIndex === plan.order.length - 1} onClick={() => move(stop.id, 1)}><ArrowDown size={14} /></button><button className="icon-button" aria-label={`Replace ${stop.name}`} onClick={() => setPicker(stop.id)}><RefreshCw size={14} /></button><button className="icon-button" aria-label={`Remove ${stop.name}`} disabled={session.input.mustVisitIds.includes(stop.id)} title={session.input.mustVisitIds.includes(stop.id) ? 'Change the must-visit preference before removing this stop' : 'Remove stop'} onClick={() => editOrder(plan.order.filter(id => id !== stop.id))}><X size={14} /></button></div>}
                    </article>
                  </div>
                  {index === plan.stops.length - 1 && <div className="travel-connector return"><Route size={13} /> {nextLeg.durationMinutes} min return · {nextLeg.distanceKm} km · test estimate</div>}
                </div>;
              })}</div>
              <div className="end-point"><span className="start-dot" /><b>{formatTime(plan.finishMs, city.timezone)}</b><span>Back at {city.anchors.find(a => a.id === session.input.endAnchorId)?.name}</span><span className="pill pale">Within your day</span></div>
              <button className="add-stop" disabled={plan.order.length >= 6} onClick={() => setPicker('add')}><Plus size={17} /> Add a stop to this draft</button>
            </div><aside className="insights-column"><Budget city={city} plan={plan} open={() => setView('budget')} /><section className="thoughtful-card"><span className="thoughtful-icon"><Sparkles size={22} /></span><span className="eyebrow">THE LITTLE THINGS MATTER</span><h2>More than a list of places.</h2><p>A proper meal, a rest break and time to get back. Your day should feel good, too.</p><div><Check size={15} /> Opening & admission checks</div><div><Check size={15} /> Group costs, not per-person surprises</div><div><Check size={15} /> Your choices stay in your control</div></section><section className="data-card"><ShieldCheck size={20} /><h3>Clear about what we know.</h3><p>This is a software test catalog. Food and accessibility evidence is simulated. Live maps, advisories and navigation connect in a later milestone.</p><button className="text-button" onClick={() => { setNotice(plan.warnings.join(' ')); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>About this data <ArrowRight size={14} /></button></section></aside></div>
            <div className="confirm-bar"><div><span className="status-dot" /><b>{sameAsConfirmed ? 'Your plan is confirmed' : confirmed ? 'Review your changes before accepting' : 'Your draft is ready to review'}</b><small>{city.timezone} · Test data · Private on this device</small></div><button className="button primary" disabled={sameAsConfirmed} onClick={() => { const candidate = { input: structuredClone(session.input), plan: structuredClone(plan), expectedId: confirmed?.id ?? null }; if (confirmed) setReview(candidate); else accept(candidate); }}><Check size={17} />{sameAsConfirmed ? 'Confirmed' : confirmed ? 'Review changes' : 'Confirm this plan'}</button></div>
          </>}
        </>}
        <footer className="page-footer"><span>Made for wherever your next day takes you.</span><span>Milestone 16 · Start location choices · Fixture itineraries</span></footer>
      </main>
    </div>
    {formOpen && <Suspense fallback={<div className="notice" role="status">Loading preferences…</div>}><PlannerForm initial={session.input} focusLocation={focusLocation} close={() => { setFormOpen(false); setFocusLocation(false); }} submit={input => { setFormOpen(false); setFocusLocation(false); setUndo(null); void build(input, null); }} /></Suspense>}
    {copySession && <Suspense fallback={<div className="notice" role="status">Opening travel copy…</div>}><TravelCopy session={copySession} close={() => setCopySession(null)} /></Suspense>}
    {backupSession && <Suspense fallback={<div className="notice" role="status">Opening backup and restore…</div>}><BackupRestore current={backupSession} close={() => setBackupSession(null)} restore={restoreBackup} /></Suspense>}
    {foodContext && <Suspense fallback={<div className="notice" role="status">Opening food options…</div>}><FoodOptions session={foodContext.session} plan={foodContext.plan} close={() => setFoodContext(null)} choose={chooseFood} /></Suspense>}
    {localDay && <Suspense fallback={<div className="notice" role="status">Opening local day updates…</div>}><LocalDayUpdates initial={localDay} close={() => setLocalDay(null)} commit={applyLocalDay} /></Suspense>}
    {returnDay && <Suspense fallback={<div className="notice" role="status">Opening return report…</div>}><ReturnReport initial={returnDay} close={() => setReturnDay(null)} commit={async (source, next) => { await applyLocalDay(source, next); setReturnDay(previous => previous ? next : null); }} /></Suspense>}
    {reuseSource && <Suspense fallback={<div className="notice" role="status">Opening saved-day reuse…</div>}><ReuseDay source={reuseSource} close={() => setReuseSource(null)} create={createReusedDay} /></Suspense>}
    {connectionsOpen && <Suspense fallback={<div className="notice" role="status">Loading data connections…</div>}><Connections input={session.input} close={() => setConnectionsOpen(false)} changed={setBackend} load={(input, order) => { setSession(newSession(input)); setUndo(null); void build(input, order); }} /></Suspense>}
    {assistantOpen && <Suspense fallback={<div className="notice" role="status">Loading planning assistant…</div>}><Assistant confirmed={confirmed} workspace={session.assistant} finished={!!session.completion} close={() => setAssistantOpen(false)} connected={() => setBackend(true)} context={(trip, baseId) => setSession(previous => previous.id === session.id && !previous.completion && !(previous.assistant?.tripId === null && previous.assistant.progress?.revision) && previous.confirmed?.id === baseId ? { ...previous, assistant: { tripId: trip.id, baseId, progress: trip.progress }, updatedAt: new Date().toISOString() } : previous)} apply={applyAssistant} /></Suspense>}
    {detail && <Dialog title={detail.name} close={() => setDetail(null)}><p>{detail.reason}</p><div className="detail-facts"><div><span>Planned visit</span><b>{formatTime(detail.arrivalMs, city.timezone)}–{formatTime(detail.departureMs, city.timezone)}</b></div><div><span>Group cost</span><b>{formatRange(detail.cost, city)}</b></div>{(() => { const place = city.places.find(p => p.id === detail.placeId)!; return <><div><span>Test opening hours</span><b>{place.opens}–{place.closes}</b></div><div><span>Test last admission</span><b>{place.lastAdmission}</b></div><div><span>Step-free fixture evidence</span><b>{place.stepFree.replace('_', ' ')}</b></div>{place.category === 'food' && session.input.dietaryRules.map(rule => <div key={rule}><span>{dietNames[rule]}</span><b>{place.dietary[rule] ?? 'unknown'} · test only</b></div>)}</>; })()}</div><div className="notice"><Info size={18} /><span>Source: software fixture {city.catalogVersion}. No real-world visit, dietary confirmation, opening hours or prices have been verified.</span></div><div className="dialog-actions"><button className="button primary" onClick={() => setDetail(null)}>Back to my day</button></div></Dialog>}
    {picker && plan && <Dialog title={picker === 'add' ? 'Make room for a new discovery' : 'Find a different stop'} close={() => setPicker(null)}><p className="muted">Only options compatible with your fixture requirements are shown. Timing and budget are checked after selection.</p><div className="picker-list">{ideas.length ? ideas.map(place => <button key={place.id} onClick={() => { const order = picker === 'add' ? [...plan.order, place.id] : plan.order.map(id => id === picker ? place.id : id); setPicker(null); editOrder(order); }}><span><b>{place.name}</b><small>{categoryNames[place.category]} · {place.durationMinutes} min · fictional fixture</small></span><Plus size={18} /></button>) : <div className="empty-card"><h3>No compatible options</h3><p>There are no remaining matches in this test catalog.</p></div>}</div></Dialog>}
    {review && confirmed && <Dialog title="Your day, with a few changes" close={() => setReview(null)}><p>Your confirmed plan remains unchanged until you accept this draft.</p><ul className="review-list">{planChanges(confirmed.plan, review.plan).map(change => <li key={change}><Check size={16} />{change}</li>)}{JSON.stringify(confirmed.input) !== JSON.stringify(review.input) && <li><Info size={16} />Your date, group, budget or preferences have changed. Review the new summary below.</li>}</ul><div className="detail-facts"><div><span>New day & window</span><b>{review.input.date} · {review.input.startTime}–{review.input.endTime}</b></div><div><span>Whole group</span><b>{review.input.adults} adults · {review.input.childAges.length} children</b></div><div><span>Upper estimate / budget</span><b>{formatMoney(review.plan.total[1], city)} / {formatMoney(review.plan.budgetLimit, city)}</b></div><div><span>Strict food rules</span><b>{review.input.dietaryRules.map(r => dietNames[r]).join(', ') || 'None'}</b></div><div><span>Mobility limits</span><b>{review.input.stepFree ? 'Step-free required' : 'No step-free requirement'} · {review.input.maxWalkingMinutes} min walking</b></div></div><div className="dialog-actions"><button className="button secondary" onClick={restoreConfirmed}><ArrowLeft size={16} /> Keep confirmed plan</button><button className="button primary" onClick={() => accept(review)}>Accept changes <Check size={16} /></button></div></Dialog>}
    {deleteId && <Dialog title="Delete this saved plan?" close={() => setDeleteId(null)}><p>This removes the local saved copy from this browser.</p><div className="dialog-actions"><button className="button secondary" onClick={() => setDeleteId(null)}>Keep it</button><button className="button danger" onClick={async () => { try { await deleteSession(deleteId); setSaved(previous => previous.filter(item => item.id !== deleteId)); setDeleteId(null); setNotice('Saved copy deleted. A currently open plan can be saved again.'); } catch { setNotice('The saved copy could not be deleted.'); setDeleteId(null); } }}>Delete saved copy</button></div></Dialog>}
  </div>;
}

