import { mapStopPrice } from './stop-price';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Check, Compass, MapPin, Plus, Route, Trash2, X } from 'lucide-react';
import { dietNames, dietRules, type DietRule } from '../../../packages/contracts/src';
import { coordinateSchema, type Coordinate } from '../../../packages/contracts/src/api';
import { coordinateLocation, locationSchema, liveRouteInputSchema, startMatchesDestination, type LiveItinerary, type SelectedLocation } from '../../../packages/contracts/src/locations';
import { formatTime } from '../../../packages/domain/src/time-format';
import LocationField from './components/LocationField';
import type { LiveExpenses } from '../../../packages/contracts/src/live-expenses';
import type { LiveProgress as ProgressReport } from '../../../packages/contracts/src/live-progress';
import { generateLiveItinerary, locateCoordinates, locationConfiguration, selectLocation } from './location-api';
import { deleteLiveDay, locationReference } from './live-storage';
import { acceptedTripCopy, saveAcceptedTrip, updateAcceptedTrip, listAcceptedTrips, deleteAcceptedTrip } from './accepted-trips';
import './live-app.css';
import type { GuidePlan, SavedGuide } from '../../../packages/contracts/src/guide';
import { mapsNavigation as navigationLink } from './maps-navigation';
import { readLocalTrip, writeLocalTrip, removeLocalTrip, localTripKey, type LocalTrip } from './live-session';
import { pricePlanKey, tripPrice, priceRange, type PriceAllowances } from './trip-price';
import TripPriceSummary from './components/TripPriceSummary';
import Dialog from './components/Dialog';
import JourneyMap from './components/JourneyMap';
import LiveProgress from './components/LiveProgress';
import TrafficAdvisory from './components/TrafficAdvisory';
const ShareTrip = lazy(() => import('./components/ShareTrip'));
const GuidePanel = lazy(() => import('./components/AutoGuidePanel'));
const GuideReview = lazy(() => import('./components/GuideReview').then(module => ({ default: module.GuideReview })));

const ProviderMap = lazy(() => import('./components/ProviderMap'));
type Stop = { key: string; location: SelectedLocation | null; durationMinutes: number };
type ScheduleCheck = (input: { date: string; startTime: string; endTime: string }, destination: SelectedLocation) => void;
const emptyStop = (): Stop => ({ key: crypto.randomUUID(), location: null, durationMinutes: 60 });
export default function LiveApp() {
  const [epoch, setEpoch] = useState(0);
  return <LiveWorkspace key={epoch} reset={() => setEpoch(value => value + 1)} />;
}
function LiveWorkspace({ reset }: { reset: () => void }) {
  const [recovery] = useState(() => { try { return readLocalTrip(localStorage); } catch { return { trip: null, error: 'Local storage is unavailable. Your trip cannot survive refresh until storage is enabled.' }; } });
  const initial = recovery.trip ? acceptedTripCopy(recovery.trip) : null;
  const [restored, setRestored] = useState(!!(initial?.destination || initial?.start || initial?.end)), [saveStatus, setSaveStatus] = useState(initial ? 'Saved trip restored on this device.' : ''), [storageError, setStorageError] = useState(recovery.error), [saveRetry, setSaveRetry] = useState(0);
  const [savedDayId] = useState(initial?.savedDayId), [priceAllowances, setPriceAllowances] = useState<PriceAllowances | undefined>(initial?.priceAllowances);
  const [acceptedPriceAllowances, setAcceptedPriceAllowances] = useState<PriceAllowances | undefined>(() => initial?.acceptedPriceAllowances ?? (initial?.acceptedGuide && initial.priceAllowances?.planKey === pricePlanKey(initial.acceptedGuide) ? initial.priceAllowances : undefined));
  const [sharing, setSharing] = useState(false), [deleting, setDeleting] = useState(false), [deleteBusy, setDeleteBusy] = useState(false), [guideEpoch, setGuideEpoch] = useState(0);
  const deleted = useRef(false), hasSavedTrip = useRef(!!initial);
  const acceptedCopy = useRef<LocalTrip | null>(initial), historyWrite = useRef<Promise<void>>(Promise.resolve());
  const pendingAcceptance = useRef(false);
  const lastSaveRetry = useRef(0);
  const [deleteTarget, setDeleteTarget] = useState<LocalTrip | null>(null);
  const [destination, setDestination] = useState<SelectedLocation | null>(initial?.destination ?? null), [start, setStart] = useState<SelectedLocation | null>(initial?.start ?? null), [end, setEnd] = useState<SelectedLocation | null>(initial?.end ?? null), [sameReturn, setSameReturn] = useState(initial?.sameReturn ?? true), [outsideConsent, setOutsideConsent] = useState(initial?.outsideConsent ?? false);
  const [stops, setStops] = useState<Stop[]>(() => initial?.stops ?? [emptyStop()]), [date, setDate] = useState(initial?.date ?? ''), [startTime, setStartTime] = useState(initial?.startTime ?? '09:00'), [endTime, setEndTime] = useState(initial?.endTime ?? '18:00'), [optimize, setOptimize] = useState(initial?.optimize ?? false);
  const guideMode = true; const [guideReview, setGuideReview] = useState<GuidePlan | null>(initial?.guideReview ?? null), [acceptedGuide, setAcceptedGuide] = useState<GuidePlan | null>(initial?.acceptedGuide ?? null), [guideSaved, setGuideSaved] = useState<SavedGuide | undefined>(initial?.guideSaved), [activeGuideStop, setActiveGuideStop] = useState<number | undefined>();
  const [adults, setAdults] = useState(initial?.adults ?? 2), [children, setChildren] = useState<number[]>(initial?.children ?? []), [budget, setBudget] = useState(initial?.budget ?? ''), [currency, setCurrency] = useState(initial?.currency ?? ''), [diet, setDiet] = useState<DietRule[]>((initial?.diet ?? []).filter((r): r is DietRule => dietRules.includes(r as DietRule))), [title, setTitle] = useState(initial?.title ?? '');
  const [preview, setPreview] = useState<LiveItinerary | null>(initial?.preview ?? null), [accepted, setAccepted] = useState<LiveItinerary | null>(initial?.accepted ?? null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [acceptedId, setAcceptedId] = useState<string | null>(initial?.acceptedId ?? null), [expenses, setExpenses] = useState<LiveExpenses | undefined>(initial?.expenses);
  const [progress, setProgress] = useState<ProgressReport | undefined>(initial?.progress);
  const [config, setConfig] = useState<Awaited<ReturnType<typeof locationConfiguration>> | null>(null), [configError, setConfigError] = useState(''), [view, setView] = useState<'plan' | 'saved' | 'day'>(initial ? 'day' : 'plan'), [saved, setSaved] = useState<LocalTrip[]>([]), [savedError, setSavedError] = useState('');
  const [pickStart, setPickStart] = useState(false), [pinBusy, setPinBusy] = useState(false), [clock, setClock] = useState(Date.now());
  const [pendingPin, setPendingPin] = useState<SelectedLocation | null>(null), [locationBusy, setLocationBusy] = useState(false);
  const [checkSchedule, setCheckSchedule] = useState<ScheduleCheck | null>(null), [scheduleLoadError, setScheduleLoadError] = useState('');
  const generation = useRef(0), request = useRef<AbortController | null>(null), pin = useRef<AbortController | null>(null), pinSequence = useRef(0), pinPending = useRef(false);
  useEffect(() => { let active = true; locationConfiguration().then(value => { if (active) setConfig(value); }).catch(failure => { if (active) setConfigError(failure instanceof Error ? failure.message : 'Location service unavailable.'); }); const timer = setInterval(() => setClock(Date.now()), 15000); return () => { active = false; clearInterval(timer); request.current?.abort(); pin.current?.abort(); generation.current++; pinSequence.current++; }; }, []);
  useEffect(() => {
    if (!date || !destination?.timezone || checkSchedule) return;
    let active = true; setScheduleLoadError('');
    import('../../../packages/domain/src/live-itinerary').then(({ liveDeparture }) => { if (active) setCheckSchedule(() => liveDeparture); }).catch(() => { if (active) setScheduleLoadError('Schedule validation could not load. Check your connection and reload this page. Unsaved choices will need to be selected again.'); });
    return () => { active = false; };
  }, [date, destination?.timezone, checkSchedule]);
  function changed() { generation.current++; request.current?.abort(); setBusy(false); setPreview(null); setGuideReview(null); setError(''); pinSequence.current++; pin.current?.abort(); pinPending.current = false; setPinBusy(false); setPendingPin(null); }
  function chooseDestination(value: SelectedLocation | null) { changed(); setDestination(value); if (!currency && value?.city?.countryCode === 'IN') setCurrency('INR'); setOutsideConsent(false); }
  function chooseStart(value: SelectedLocation | null) { changed(); setStart(value); setOutsideConsent(false); }
  const snapshot = useMemo(() => ({ version: 1 as const, updatedAt: new Date().toISOString(), savedDayId, destination, start, end, sameReturn, outsideConsent, stops, date, startTime, endTime, optimize, adults, children, budget, currency, diet, title, preview, accepted, guideReview, acceptedGuide, guideSaved, acceptedId, expenses, progress, priceAllowances, acceptedPriceAllowances, view }), [savedDayId, destination, start, end, sameReturn, outsideConsent, stops, date, startTime, endTime, optimize, adults, children, budget, currency, diet, title, preview, accepted, guideReview, acceptedGuide, guideSaved, acceptedId, expenses, progress, priceAllowances, acceptedPriceAllowances, view]);
  const hasTrip = !!(destination || start || date || title || preview || accepted);
  function persistAccepted(copy: LocalTrip, create = false) {
    if (deleted.current) return;
    acceptedCopy.current = copy;
    if (create) pendingAcceptance.current = true;
    try {
      if (create || readLocalTrip(localStorage).trip?.acceptedId === copy.acceptedId) writeLocalTrip(localStorage, copy);
      hasSavedTrip.current = true; setSaveStatus('Accepted itinerary saved on this device'); setStorageError('');
      historyWrite.current = historyWrite.current.catch(() => {}).then(async () => { if (create) { await saveAcceptedTrip(copy); if (acceptedCopy.current?.acceptedId === copy.acceptedId) pendingAcceptance.current = false; } else await updateAcceptedTrip(copy); });
      void historyWrite.current.catch(() => setStorageError('The accepted trip is available, but saving to Saved plans failed. Check device storage and retry.'));
    } catch { setStorageError('Local saving failed. Your accepted trip is still on screen. Check device storage and retry.'); }
  }
  useEffect(() => {
    const copy = acceptedCopy.current;
    if (!copy || copy.acceptedId !== acceptedId || recovery.error || deleted.current || deleteBusy) return;
    const changedReport = JSON.stringify([copy.expenses, copy.progress, copy.acceptedPriceAllowances]) !== JSON.stringify([expenses, progress, acceptedPriceAllowances]);
    if (!changedReport && lastSaveRetry.current === saveRetry) return;
    lastSaveRetry.current = saveRetry;
    // Keep progress and explicit price allowances for the accepted copy; never save form edits.
    persistAccepted({ ...copy, updatedAt: new Date().toISOString(), expenses, progress, acceptedPriceAllowances, priceAllowances: acceptedPriceAllowances }, pendingAcceptance.current);
  }, [acceptedId, expenses, progress, acceptedPriceAllowances, saveRetry, recovery.error]);
  useEffect(() => {
    const removed = (event: StorageEvent) => {
      if ((event.key === localTripKey || event.key === null) && event.newValue === null && hasSavedTrip.current) {
        deleted.current = true; request.current?.abort(); pin.current?.abort(); generation.current++; reset();
      }
    };
    window.addEventListener('storage', removed);
    return () => window.removeEventListener('storage', removed);
  }, [reset]);
  async function deleteCurrentTrip() {
    if (deleteBusy) return; setDeleteBusy(true);
    try {
      await historyWrite.current.catch(() => {});
      if (deleteTarget?.acceptedId && deleteTarget.acceptedId !== acceptedId) { await deleteAcceptedTrip(deleteTarget.acceptedId); setDeleteTarget(null); setDeleting(false); setDeleteBusy(false); await library(); return; }
      const previous = acceptedCopy.current;
      removeLocalTrip(localStorage);
      try { if (acceptedId) await deleteAcceptedTrip(acceptedId); if (savedDayId) await deleteLiveDay(savedDayId); }
      catch (failure) { if (previous) writeLocalTrip(localStorage, previous); throw failure; }
      deleted.current = true; request.current?.abort(); pin.current?.abort(); generation.current++; reset();
    }
    catch { setStorageError('The local trip could not be deleted. Check storage access and retry.'); setDeleteBusy(false); }
  }
  async function refreshSavedLocations() {
    if (busy || !destination || !start) return;
    changed(); const id = generation.current, abort = new AbortController(); request.current = abort; setBusy(true);
    try {
      const resolvePoint = (l: SelectedLocation) => { const r = locationReference(l); return r.kind === 'place' ? selectLocation(r.placeId, crypto.randomUUID(), false, abort.signal) : locateCoordinates(r.coordinates, 'saved', abort.signal); };
      const freshDestination = await selectLocation(destination.placeId!, crypto.randomUUID(), true, abort.signal), freshStart = await resolvePoint(start), freshEnd = sameReturn || !end ? null : await resolvePoint(end);
      if (id !== generation.current || abort.signal.aborted) return;
      setDestination(freshDestination); setStart(freshStart); setEnd(freshEnd); setStops([emptyStop()]); setRestored(false); setGuideEpoch(n => n + 1); setNotice('Locations refreshed. Your accepted itinerary remains saved; generate and review a new draft to update it.');
    } catch (failure) { if (id === generation.current && !abort.signal.aborted) setError(failure instanceof Error ? failure.message : 'Location refresh failed. Your accepted trip is preserved.'); }
    finally { if (id === generation.current) setBusy(false); }
  }
  const mismatch = !!destination && !!start && !startMatchesDestination(start, destination);
  const expired = [destination, start, ...(sameReturn ? [] : [end]), ...stops.map(stop => stop.location)].some(location => location && Date.parse(location.expiresAt) <= clock);
  const partyValid = Number.isInteger(adults) && adults >= 1 && adults + children.length <= 12 && children.every(age => Number.isInteger(age) && age >= 0 && age <= 17);
  let scheduleError = scheduleLoadError;
  const schedulePending = !!date && !!destination?.timezone && !checkSchedule;
  if (date && startTime && endTime && destination?.timezone && checkSchedule) { try { checkSchedule({ date, startTime, endTime }, destination); } catch (failure) { scheduleError = failure instanceof Error ? failure.message : 'Choose a valid travel window.'; } }
  const guideBaseExpired = [destination, start, ...(sameReturn ? [] : [end])].some(l => l && Date.parse(l.expiresAt) <= clock);
  const guideReady = !restored && !!destination?.timezone && !!start && (sameReturn || !!end) && !!date && !!startTime && !!endTime && (!mismatch || outsideConsent) && !guideBaseExpired && partyValid && !scheduleError && !schedulePending && !locationBusy && !pinBusy && !pickStart && [start, ...(sameReturn ? [] : [end])].every(value => value?.receiptStatus !== 'local');
  const ready = guideReady && !expired && stops.every(stop => !!stop.location && Number.isInteger(stop.durationMinutes) && stop.durationMinutes >= 0 && stop.durationMinutes <= 480);
  const missingReason = restored ? 'Refresh saved locations before changing or generating the route. Your saved itinerary remains available.' : locationBusy ? 'Finish or cancel the location lookup before generating.' : pickStart ? 'Confirm or cancel the map pin before generating.' : !destination?.timezone ? 'Choose a suggested destination city.' : !start ? 'Choose your starting point by search, current location or map pin.' : !sameReturn && !end ? 'Choose a separate return location.' : !guideMode && stops.some(stop => !stop.location) ? 'Choose a suggested place for every visit.' : !date ? 'Choose your travel date.' : scheduleError ? scheduleError : schedulePending ? 'Checking destination-local travel times…' : !partyValid ? (!Number.isInteger(adults) || adults < 1 || adults > 12 ? 'Adults: enter a whole number from 1 to 12.' : adults + children.length > 12 ? 'Adults and Children: use at most 12 travelers in total.' : `Child ${children.findIndex(age => !Number.isInteger(age) || age < 0 || age > 17) + 1} age: enter a whole number from 0 to 17.`) : expired ? 'Refresh the expired location selection.' : mismatch && !outsideConsent ? 'Review the starting city and choose how to travel.' : [start, ...(sameReturn ? [] : [end])].some(value => value?.receiptStatus === 'local') ? 'Reconnect and retry address lookup to register your selected point before routing.' : '';
  function routeInput() { return liveRouteInputSchema.parse({ destinationId: destination?.id, startId: start?.id, returnToStart: sameReturn, endId: sameReturn ? null : end?.id, stops: stops.map(stop => ({ locationId: stop.location?.id, durationMinutes: stop.durationMinutes })), date, startTime, endTime, allowOutsideStart: outsideConsent, optimize }); }
  async function generate() {
    if (request.current && !request.current.signal.aborted && busy) return;
    const id = ++generation.current, abort = new AbortController(); request.current?.abort(); request.current = abort; setBusy(true); setError(''); setPreview(null);
    try { const result = await generateLiveItinerary(routeInput(), abort.signal); if (generation.current === id && !abort.signal.aborted) setPreview(result); }
    catch (failure) { if (generation.current === id && !abort.signal.aborted) setError(failure instanceof Error ? failure.message : 'The itinerary could not be calculated. Retry.'); }
    finally { if (generation.current === id) setBusy(false); }
  }
  const selectPin = useCallback(async (point: Coordinate) => {
    if (pinPending.current) return; const checked = coordinateSchema.safeParse(point); if (!checked.success) { setError('The map returned invalid coordinates. Select a different point.'); return; }
    const id = ++pinSequence.current, abort = new AbortController(); pin.current?.abort(); pin.current = abort; pinPending.current = true; setPinBusy(true); setError('');
    const draft = locationSchema.parse({ ...coordinateLocation(checked.data, 'pin'), id: crypto.randomUUID(), receiptStatus: 'local', expiresAt: new Date(Date.now() + 1800000).toISOString(), persistence: 'memory_only' }); setPendingPin(draft);
    try { const location = await locateCoordinates(checked.data, 'pin', abort.signal); if (pinSequence.current === id && !abort.signal.aborted) setPendingPin(location); }
    catch (failure) { if (pinSequence.current === id && !abort.signal.aborted) setPendingPin({ ...draft, resolutionMessage: failure instanceof Error ? failure.message : 'Address lookup failed. Your point is preserved.' }); }
    finally { if (pinSequence.current === id) { pinPending.current = false; setPinBusy(false); } }
  }, []);
  const mapPoints = useMemo(() => (preview ? [preview.start, ...preview.stops.map(stop => stop.location), preview.end] : [start, ...stops.map(stop => stop.location), sameReturn ? start : end]).filter((value): value is SelectedLocation => !!value).map(value => ({ name: value.name, coordinates: value.coordinates })), [preview, start, stops, sameReturn, end]);
  const displayedPoints = useMemo(() => [...(mapPoints.length ? mapPoints.map((point, i) => ({ ...point, ...(preview && guideReview && i > 0 && i <= guideReview.stops.length ? { price: mapStopPrice(guideReview.stops[i - 1], guideReview.budget.breakdown?.people) } : {}) })) : destination ? [{ name: destination.name, coordinates: destination.coordinates }] : []), ...(pendingPin ? [{ name: 'Pending starting point', coordinates: pendingPin.coordinates }] : [])], [mapPoints, destination, pendingPin, preview, guideReview]);
  async function library() {
    setView('saved'); setSavedError('');
    try {
      await historyWrite.current.catch(() => {});
      const result = await listAcceptedTrips(), rows = new Map(result.trips.map(trip => [trip.acceptedId!, trip]));
      const active = readLocalTrip(localStorage).trip;
      if (active?.accepted && active.acceptedId) rows.set(active.acceptedId, acceptedTripCopy(active)!);
      setSaved([...rows.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      if (result.skipped) setSavedError(`${result.skipped} unsupported record(s) were preserved.`);
    } catch { setSavedError('Saved itineraries could not be loaded. Retry; your accepted trip remains available.'); }
  }
  function openSaved(day: LocalTrip) {
    try { writeLocalTrip(localStorage, day); reset(); }
    catch { setSavedError('This itinerary could not be opened. Check device storage and retry.'); }
  }
  function guidedPreview(plan: GuidePlan | null) { setGuideReview(plan); setPreview(plan?.itinerary ?? null); if (plan) setStops(plan.itinerary.stops.map(stop => ({ key: crypto.randomUUID(), location: stop.location, durationMinutes: stop.durationMinutes }))); }
  function guidedAccept(plan: GuidePlan) {
    const itinerary = structuredClone(plan.itinerary), guide = structuredClone(plan), same = acceptedGuide && pricePlanKey(acceptedGuide) === pricePlanKey(plan), id = same && acceptedId ? acceptedId : crypto.randomUUID();
    const allowances = priceAllowances?.planKey === pricePlanKey(plan) ? structuredClone(priceAllowances) : acceptedPriceAllowances?.planKey === pricePlanKey(plan) ? structuredClone(acceptedPriceAllowances) : undefined;
    // Persist acceptance before rendering another view, which could encounter a stale deployment asset.
    if (!recovery.error && !deleted.current) {
      const copy = acceptedTripCopy({ ...snapshot, title: title.trim() || `${itinerary.destination.name} · ${date}`.slice(0, 160), savedDayId: same ? savedDayId : undefined, updatedAt: new Date().toISOString(), accepted: itinerary, acceptedGuide: guide, acceptedId: id, acceptedPriceAllowances: allowances, view: 'day' })!;
      persistAccepted(copy, true);
    }
    setAccepted(itinerary); setAcceptedGuide(guide); setAcceptedPriceAllowances(allowances); setAcceptedId(id); setTitle(title.trim() || `${itinerary.destination.name} · ${date}`.slice(0, 160)); setNotice('Guided itinerary accepted and saved. Later edits are not saved until you accept again.'); setView('day');
  }
  const itinerary = view === 'day' ? accepted : preview;
  const pricePlan = view === 'day' ? acceptedGuide : guideReview;
  const sharedPlan = pricePlan;
  const visibleAllowances = view === 'day' ? acceptedPriceAllowances : priceAllowances;
  function updatePriceAllowances(value: PriceAllowances | undefined) {
    if (!pricePlan) return;
    const key = pricePlanKey(pricePlan);
    if (acceptedGuide && pricePlanKey(acceptedGuide) === key) setAcceptedPriceAllowances(value);
    if (guideReview && pricePlanKey(guideReview) === key) setPriceAllowances(value);
  }
  const time = (iso: string, trip: LiveItinerary) => formatTime(Date.parse(iso), trip.destination.timezone!);
  return <div className="app-shell live-shell">
    <a href="#main-content" className="skip-link">Skip to planner</a>
    <aside className="sidebar"><a className="brand" href="#" onClick={event => { event.preventDefault(); setView('plan'); }}><span className="brand-mark"><Compass size={25} /></span>daywise<span className="brand-dot">.</span></a><div className="sidebar-caption">YOUR CITY.<br />YOUR STARTING POINT.</div><nav aria-label="Main navigation"><button className={`nav ${view === 'plan' ? 'active' : ''}`} onClick={() => setView('plan')}><Route size={19} />My day plan</button><button className={`nav ${view === 'saved' ? 'active' : ''}`} onClick={() => void library()}><Bookmark size={19} />Saved plans</button><button className={`nav ${view === 'day' ? 'active' : ''}`} onClick={() => setView('day')}><MapPin size={19} />Follow my day</button></nav><div className="sidebar-bottom"><div className="local-profile"><span className="avatar">Y</span><div><b>Your travel space</b><small>Private · this device</small></div></div></div></aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb">Your travel space <span>/</span><b>{view === 'saved' ? 'Saved plans' : view === 'day' ? 'Accepted route' : 'Day planner'}</b></div><span className="connection">Google location services</span></header><main id="main-content">
      <div className="page-heading"><div><span className="eyebrow">START WHERE YOU CHOOSE</span><h1>Your day starts here.</h1></div></div>
      {(hasTrip || !!saveStatus || recovery.error) && <section className="local-trip-tools" aria-label="Local trip saving"><span role="status">{accepted ? saveStatus || 'Accepted itinerary saved on this device' : 'Not saved. Accept an itinerary to save it.'}</span><div className="button-row">{sharedPlan && <button className="button secondary" onClick={() => setSharing(true)}>Share trip</button>}{(accepted || recovery.error) && <button className="text-button" onClick={() => { setDeleteTarget(null); setDeleting(true); }}>Delete local trip</button>}</div></section>}
      {storageError && <div className="error-box" role="alert">{storageError}{!recovery.error && <button className="text-button" onClick={() => setSaveRetry(n => n + 1)}>Retry local saving</button>}</div>}
      {restored && view === 'plan' && <section className="notice"><div><b>Saved trip restored.</b><p>Your selections and itinerary are preserved. Refresh location data before editing routes.</p></div><button className="button secondary" disabled={busy || !destination || !start} onClick={() => void refreshSavedLocations()}>Refresh saved locations</button></section>}
      {accepted && view === 'day' && Date.parse(accepted.route.expiresAt) <= clock && <p className="field-note" role="status">Saved schedule: the original traffic estimate has expired. Your itinerary is preserved; refresh locations and regenerate before relying on updated travel times.</p>}
      {pricePlan && view !== 'saved' && <TripPriceSummary key={pricePlanKey(pricePlan) + JSON.stringify(visibleAllowances)} plan={pricePlan} allowances={visibleAllowances} update={updatePriceAllowances} />}
      {notice && <div className="notice" role="status"><span>{notice}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}
      {configError && <div className="error-box" role="alert">{configError}<button className="text-button" onClick={() => { setConfigError(''); locationConfiguration().then(setConfig).catch(failure => setConfigError(failure.message)); }}>Retry connection</button></div>}
      {config && (!config.autocomplete || !config.reverseGeocode || !config.timezone || !config.routing || !!config.issues?.length) && <div className="location-config" role="status"><b>Complete your Google location services setup.</b><p>{!config.autocomplete && 'Places autocomplete is not configured. '}{!config.reverseGeocode && 'Reverse geocoding is not configured. '}{!config.timezone && 'Destination timezone lookup is not configured. '}{!config.routing && 'Driving routes are not configured. '}</p><p>Set the server API keys described in location-setup.md and restart the API. No sample locations are substituted.</p>{config.issues?.map(issue => <p key={issue}>{issue}</p>)}</div>}
      {error && <div className="error-box" role="alert">{error}</div>}
      {accepted && view === 'plan' && <div className="confirmed-banner"><Check size={18} /><div><b>Your accepted route is preserved.</b><span>Location and preference changes form a separate draft.</span></div><button className="text-button" onClick={() => setView('day')}>View accepted route</button></div>}
      {view === 'saved' ? <section className="live-saved" aria-label="Saved itineraries"><button className="button secondary" disabled={busy} onClick={() => void library()}>Refresh saved days</button>{savedError && <div className="error-box" role="alert">{savedError}</div>}<div className="saved-grid">{saved.map(day => { const price = day.acceptedGuide ? tripPrice(day.acceptedGuide, day.acceptedPriceAllowances) : null; return <article className="saved-card" key={day.acceptedId!}><span className="pill pale">ACCEPTED ITINERARY</span><h2>{day.title || day.accepted!.destination.name}</h2><p>{day.date} · {day.adults + day.children.length} travelers</p>{price && <p className="saved-trip-price">{priceRange(price.minimum, price.maximum, day.acceptedGuide!.budget.currency)}</p>}<div><button className="button secondary" disabled={busy} onClick={() => openSaved(day)}>Open saved itinerary</button><button className="icon-button" aria-label={`Delete ${day.title || day.accepted!.destination.name}`} onClick={() => { setDeleteTarget(day); setDeleting(true); }}><Trash2 size={17} /></button></div></article>; })}</div>{!saved.length && !savedError && <div className="empty-card"><h2>No accepted itineraries saved yet.</h2><p>Accept a guided itinerary to save it here with its price summary.</p></div>}</section> : <>
        {view === 'plan' && <div className="live-planner-grid"><section className="live-card live-form"><LocationField label="Destination city" value={destination} change={chooseDestination} citiesOnly /><LocationField label="Starting location" value={start} change={chooseStart} onPending={setLocationBusy} gps bias={destination?.coordinates} />

          {mismatch && <section className="city-mismatch" aria-label="Starting city review"><h3>Review your starting city</h3><p>{start?.city ? `Your start is in ${start.city.name}; your trip destination is ${destination?.name}.` : 'The starting city could not be verified against your destination.'} Both selections are preserved.</p><label className="checkbox-row"><input type="checkbox" checked={outsideConsent} onChange={event => { changed(); setOutsideConsent(event.target.checked); }} /><span>Travel from this starting location to my destination</span></label><button type="button" className="text-button" onClick={() => { chooseStart(null); setNotice('Choose a starting point within the destination city. The trip destination is unchanged.'); }}>Select a start within the destination city</button></section>}
          <label className="checkbox-row"><input type="checkbox" checked={sameReturn} onChange={event => { changed(); setSameReturn(event.target.checked); }} /><span>Return to the same place</span></label>{!sameReturn && <LocationField label="Return location" value={end} change={value => { changed(); setEnd(value); }} bias={destination?.coordinates} />}
          <div className="form-grid"><label>Travel date<input type="date" required value={date} onChange={event => { changed(); setDate(event.target.value); }} /></label><label>Departure time<input type="time" required value={startTime} onChange={event => { changed(); setStartTime(event.target.value); }} /></label><label>Return by<input type="time" required value={endTime} onChange={event => { changed(); setEndTime(event.target.value); }} /></label></div><p className="field-note">{destination?.timezone ? `Schedule timezone: ${destination.timezone}.` : 'Select a destination city to resolve its timezone.'}</p>
          <TrafficAdvisory destination={destination} date={date} />
          {scheduleError && <p className="error-box" role="alert">{scheduleError}{scheduleLoadError && <button className="text-button" onClick={() => window.location.reload()}>Reload page</button>}</p>}
<details className="live-preferences"><summary>Group, budget and food preferences</summary><div className="form-grid"><label>Adults<input data-guide-field="adults" type="number" min={1} max={12} value={adults} onChange={event => { changed(); setAdults(event.target.valueAsNumber); }} /></label><label>Children<input data-guide-field="childAges" type="number" min={0} max={11} value={children.length} onChange={event => { const count = event.target.valueAsNumber; if (Number.isInteger(count) && count >= 0 && count <= 11) { changed(); setChildren(previous => Array.from({ length: count }, (_, index) => previous[index] ?? 5)); } }} /></label>{children.map((age, index) => <label key={index}>Child {index + 1} age<input data-guide-field={`childAges.${index}`} type="number" min={0} max={17} value={age} onChange={event => { changed(); setChildren(previous => previous.map((value, i) => i === index ? event.target.valueAsNumber : value)); }} /></label>)}<label>Group budget<input data-guide-field="groupBudget" inputMode="decimal" value={budget} maxLength={30} onChange={event => { changed(); setBudget(event.target.value); }} /></label><label>Budget currency<select data-guide-field="currency" aria-label="Budget currency" value={currency} onChange={event => { changed(); setCurrency(event.target.value); }}><option value="">Select currency</option>{Intl.supportedValuesOf('currency').map(code => <option key={code} value={code}>{code}</option>)}</select></label></div><fieldset><legend>Food requirements to verify</legend><div className="choice-chips"><button type="button" aria-pressed={!diet.length} onClick={() => { changed(); setDiet([]); }}>Any food</button>{dietRules.map(rule => <button type="button" key={rule} aria-pressed={diet.includes(rule)} onClick={() => { changed(); setDiet(previous => previous.includes(rule) ? previous.filter(value => value !== rule) : [...previous, rule]); }}>{dietNames[rule]}</button>)}</div></fieldset><p className="field-note">A searched restaurant is not automatically verified for these requirements. Confirm preparation directly before relying on it.</p></details>
          <Suspense fallback={<p role="status">Opening the day guide…</p>}><GuidePanel key={guideEpoch} destination={destination} start={start} end={end} returnToStart={sameReturn} allowOutsideStart={outsideConsent} date={date} startTime={startTime} endTime={endTime} adults={adults} childAges={children} budget={budget} currency={currency} dietaryRules={diet} ready={guideReady} assistantMode={config?.guideAssistant ?? "local"} initialPlan={guideReview} initialPreferences={guideSaved?.preferences} selectedPlaces={stops.flatMap(s => s.location ? [{ location: s.location, durationMinutes: s.durationMinutes }] : [])} savedConstraints={guideSaved?.stops} onPreview={guidedPreview} onAccept={guidedAccept} onPreferences={(preferences, rows) => setGuideSaved({ preferences, stops: rows })} onHighlight={setActiveGuideStop} activeIndex={activeGuideStop} /></Suspense>
          <label className="live-name">Private day name<input value={title} maxLength={160} onChange={event => setTitle(event.target.value)} placeholder="Optional name for the itinerary you accept" /></label><div className="button-row">{!guideMode && <button className="button primary" disabled={!ready || busy || pinBusy} onClick={() => void generate()}>{busy ? 'Calculating Google route…' : 'Generate itinerary'}</button>}</div>{guideBaseExpired && <p className="error-box" role="alert">A location selection expired. Search and select it again or request your current location. No fallback point will be used.</p>}
        {!(guideMode ? guideReady : ready) && <p className="field-note" role="status">{missingReason || "Check visit durations and required travel fields."}</p>}</section><aside className="live-map-column"><section className="live-card"><h2>Your route and starting point</h2>{displayedPoints.length ? <><div className="button-row"><button className="button secondary" onClick={() => { setPickStart(value => !value); pinSequence.current++; pin.current?.abort(); pinPending.current = false; setPinBusy(false); setPendingPin(null); }}>{pickStart ? 'Cancel map selection' : 'Select start with a map pin'}</button></div>{pickStart && <p role="status">Tap the map to place a pin, then confirm it as your starting point. Address lookup is optional; the exact point is preserved.</p>}{pinBusy && <p role="status">Resolving the map pin address…</p>}{pendingPin && <section aria-label="Map pin review" className="city-mismatch"><b>{pendingPin.address ?? 'Selected map point · address unavailable'}</b>{pendingPin.resolutionMessage && <p>{pendingPin.resolutionMessage}</p>}<p>Confirm this exact point to replace your starting location.</p><button className="button secondary" disabled={pinBusy || pendingPin.receiptStatus === 'local'} onClick={() => { const selected = pendingPin; changed(); setStart(selected); setOutsideConsent(false); setPickStart(false); setNotice('Map pin confirmed as your starting point.'); }}>Use this starting point</button>{!pinBusy && pendingPin.address === null && <button className="text-button" onClick={() => void selectPin(pendingPin.coordinates)}>Retry pin address</button>}</section>}<Suspense fallback={<p role="status">Loading map…</p>}><ProviderMap snapshot={restored} route={pickStart ? undefined : preview?.route} points={displayedPoints} pick={pickStart ? selectPin : undefined} activeIndex={guideMode ? activeGuideStop : undefined} onSelectStop={guideMode ? setActiveGuideStop : undefined} /></Suspense></> : <div className="map-empty"><MapPin size={26} /><p>Select a real destination or starting point to display the map. No default coordinates are used.</p></div>}</section><section className="live-card"><h3>You stay in control.</h3></section></aside></div>}
        {view === 'day' && accepted && acceptedId && <Suspense fallback={<p role="status">Opening progress reports…</p>}><LiveProgress key={acceptedId} itinerary={accepted} acceptedId={acceptedId} report={progress} update={setProgress} /></Suspense>}{view === "day" && acceptedGuide && <section className="live-card"><Suspense fallback={<p>Opening guided review…</p>}><JourneyMap plan={acceptedGuide} activeIndex={activeGuideStop} onHighlight={setActiveGuideStop} /><GuideReview plan={acceptedGuide} activeIndex={activeGuideStop} onHighlight={setActiveGuideStop} /></Suspense></section>}{itinerary && (!guideMode || view === "day") && !(view === "day" && acceptedGuide) && <section className="live-card live-itinerary" aria-label={view === 'day' ? 'Accepted itinerary' : 'Itinerary preview'}><span className="eyebrow">{view === 'day' ? 'ACCEPTED ROUTE' : 'REVIEW THIS ROUTE'}</span><h2>{itinerary.destination.name}</h2><p>{itinerary.destination.timezone} · Google Routes · {(itinerary.route.distanceMeters / 1000).toFixed(1)} km driving</p><ol><li><b>{time(itinerary.route.departureTime, itinerary)}</b><h3>Start at {itinerary.start.name}</h3><p>{itinerary.start.address}</p></li>{itinerary.stops.map((stop, index) => <li key={`${stop.location.id}:${index}`}><b>{time(stop.arrivalAt, itinerary)}–{time(stop.departureAt, itinerary)}</b><h3>{stop.location.name}</h3><p>{stop.location.address} · {stop.durationMinutes} min allowance</p><a className="text-button" href={navigationLink(index ? itinerary.stops[index - 1].location : itinerary.start, stop.location, itinerary.route.mode)} target="_blank" rel="noopener noreferrer">Navigate this leg in Google Maps</a></li>)}<li><b>{time(itinerary.finishAt, itinerary)}</b><h3>Return to {itinerary.end.name}</h3><p>{itinerary.end.address}</p><a className="text-button" href={navigationLink(itinerary.stops.at(-1)!.location, itinerary.end, itinerary.route.mode)} target="_blank" rel="noopener noreferrer">Navigate return in Google Maps</a></li></ol><div className="google-attribution" translate="no">Google Maps</div><ul className="live-warnings">{itinerary.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>{!itinerary.withinTime && <p className="error-box" role="alert">The driving and visit allowances exceed Return by. Adjust the draft and regenerate.</p>}{Date.parse(itinerary.route.expiresAt) <= clock && <p className="error-box" role="alert">This driving estimate expired. Generate a fresh route before accepting.</p>}{view !== 'day' && <button className="button primary" disabled={!itinerary.withinTime || Date.parse(itinerary.route.expiresAt) <= clock} onClick={() => { if (Date.parse(itinerary.route.expiresAt) <= Date.now()) { setError('This route estimate expired. Generate a fresh route before accepting.'); return; } setAccepted(structuredClone(itinerary)); setAcceptedGuide(null); setAcceptedId(crypto.randomUUID()); setNotice('Route accepted. Later edits stay in a separate draft. Venue facts and budget remain unverified.'); setView('day'); }}><Check size={17} />Accept this itinerary route</button>}</section>}
        {view === 'day' && !accepted && <div className="empty-card"><h2>Accept a route to follow your day.</h2><button className="button primary" onClick={() => setView('plan')}>Back to planner</button></div>}
      </>}
      {sharing && sharedPlan && <Suspense fallback={<p role="status">Preparing trip copy…</p>}><ShareTrip plan={sharedPlan} title={title} allowances={visibleAllowances} close={() => setSharing(false)} /></Suspense>}
      {deleting && <Dialog title="Delete local trip?" close={() => { if (!deleteBusy) setDeleting(false); }}><p>This removes the selected saved itinerary and its progress and price details from this device. Downloaded or shared copies are independent.</p><div className="button-row"><button className="button secondary" disabled={deleteBusy} onClick={() => setDeleting(false)}>Keep trip</button><button className="button primary" disabled={deleteBusy} onClick={() => void deleteCurrentTrip()}>{deleteBusy ? 'Deleting…' : 'Delete trip from this device'}</button></div></Dialog>}
      <footer className="page-footer"><span>Made for wherever your next day takes you. <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a> · <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms</a></span><span>Real locations · Google providers · No location fallbacks</span></footer>
    </main></div>
  </div>;
}
