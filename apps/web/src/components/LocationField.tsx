import { useEffect, useId, useRef, useState } from 'react';
import { LocateFixed, LoaderCircle, MapPin, X } from 'lucide-react';
import { coordinateLocation, locationSchema, type SelectedLocation } from '../../../../packages/contracts/src/locations';
import type { Coordinate } from '../../../../packages/contracts/src/api';
import { readCurrentPosition } from '../location';
import { locateCoordinates, searchLocations, selectLocation } from '../location-api';

export default function LocationField({ label, value, change, citiesOnly = false, gps = false, bias, focus = false, onPending }: {
  label: string; value: SelectedLocation | null; change: (value: SelectedLocation | null) => void; citiesOnly?: boolean; gps?: boolean; bias?: Coordinate; focus?: boolean; onPending?: (busy: boolean) => void;
}) {
  const id = useId(), inputRef = useRef<HTMLInputElement>(null), [query, setQuery] = useState(value?.name ?? ''), [editing, setEditing] = useState(false);
  const [suggestions, setSuggestions] = useState<{ placeId: string; text: string }[]>([]), [activeIndex, setActiveIndex] = useState(-1), [status, setStatus] = useState<'idle' | 'searching' | 'selecting' | 'locating' | 'ready' | 'empty' | 'error'>(value ? 'ready' : 'idle'), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const sequence = useRef(0), controller = useRef<AbortController | null>(null), pending = useRef(false), mounted = useRef(true), token = useRef(crypto.randomUUID());
  const changeRef = useRef(change); changeRef.current = change;
  const ownUpdate = useRef<string | null>(null), valueRef = useRef(value), pendingRef = useRef(onPending); valueRef.current = value; pendingRef.current = onPending;
  function publish(selected: SelectedLocation) { ownUpdate.current = selected.id; valueRef.current = selected; changeRef.current(selected); setQuery(selected.name); }
  function invalidate() { sequence.current++; controller.current?.abort(); pending.current = false; }
  useEffect(() => { mounted.current = true; if (focus) inputRef.current?.focus(); return () => { mounted.current = false; invalidate(); pendingRef.current?.(false); }; }, []);
  useEffect(() => { if (value) { if (value.id === ownUpdate.current) return; invalidate(); setQuery(value.name); setEditing(false); setSuggestions([]); setError(''); setStatus('ready'); } else if (!editing && !pending.current) { setQuery(''); setStatus('idle'); } }, [value?.id]);
  useEffect(() => {
    if (!editing || query.trim().length < 2) { setSuggestions([]); return; }
    const requestId = ++sequence.current, abort = new AbortController(); controller.current?.abort(); controller.current = abort;
    setSuggestions([]); setError(''); setActiveIndex(-1); setStatus('searching');
    const timer = setTimeout(async () => {
      try { const response = await searchLocations(query.trim(), token.current, citiesOnly, bias, abort.signal); if (mounted.current && sequence.current === requestId && !abort.signal.aborted) { setSuggestions(response.suggestions); setActiveIndex(response.suggestions.length ? 0 : -1); setStatus(response.suggestions.length ? 'idle' : 'empty'); } }
      catch (failure) { if (mounted.current && sequence.current === requestId && !abort.signal.aborted) { setStatus('error'); setError(failure instanceof Error ? failure.message : 'Search failed. Retry.'); } }
      finally { clearTimeout(timeout); }
    }, 350);
    const timeout = setTimeout(() => { if (mounted.current && sequence.current === requestId) { abort.abort(); setStatus('error'); setError('Place search took too long. Retry or enter a fuller address.'); } }, 25000);
    return () => { clearTimeout(timer); clearTimeout(timeout); abort.abort(); };
  }, [query, editing, citiesOnly, bias?.latitude, bias?.longitude, retry]);
  async function choose(placeId: string) {
    if (pending.current) return; invalidate(); pending.current = true; const requestId = sequence.current, abort = new AbortController(); controller.current = abort;
    const session = token.current; token.current = crypto.randomUUID(); setStatus('selecting'); setError(''); setSuggestions([]); setEditing(false);
    const timeout = setTimeout(() => { if (mounted.current && sequence.current === requestId) { abort.abort(); pending.current = false; setStatus('error'); setError('Address validation took too long. Retry search or choose another place.'); } }, 25000);
    try { const selected = await selectLocation(placeId, session, citiesOnly, abort.signal); if (mounted.current && sequence.current === requestId && !abort.signal.aborted) { publish(selected); setStatus('ready'); } }
    catch (failure) { if (mounted.current && sequence.current === requestId && !abort.signal.aborted) { setStatus('error'); setError(failure instanceof Error ? failure.message : 'This place could not be validated. Search and select it again.'); } }
    finally { clearTimeout(timeout); if (sequence.current === requestId) pending.current = false; }
  }
  async function currentLocation(existing?: SelectedLocation) {
    if (pending.current) return; invalidate(); pending.current = true; const requestId = sequence.current, abort = new AbortController(); controller.current = abort;
    setEditing(false); setSuggestions([]); setError(''); setStatus('locating'); let captured = existing ?? null;
    const failed = (message: string) => {
      if (captured) { publish({ ...captured, resolutionMessage: message }); setStatus('ready'); }
      else { setStatus('error'); setError(message); }
    };
    const timeout = setTimeout(() => { if (mounted.current && sequence.current === requestId) { abort.abort(); pending.current = false; failed('Location/address lookup took too long. Retry current location or search manually.'); } }, 30000);
    try {
      if (!existing) {
        const point = await readCurrentPosition(); abort.signal.throwIfAborted(); if (!mounted.current || sequence.current !== requestId) return;
        captured = locationSchema.parse({ ...coordinateLocation({ latitude: point.latitude, longitude: point.longitude }, 'gps', { accuracyMeters: point.accuracyMeters, observedAt: new Date(point.observedAt).toISOString() }), id: crypto.randomUUID(), receiptStatus: 'local', expiresAt: new Date(Date.now() + 1800000).toISOString(), persistence: 'memory_only' });
        publish(captured);
      }
      const selected = await locateCoordinates(captured!.coordinates, captured!.source as 'gps' | 'pin' | 'saved', abort.signal, captured!.source === 'gps' ? { ...captured!.coordinates, accuracyMeters: captured!.accuracyMeters!, observedAt: Date.parse(captured!.observedAt!) } : undefined);
      if (mounted.current && sequence.current === requestId && !abort.signal.aborted) { publish(selected); setStatus('ready'); }
    }
    catch (failure) { if (mounted.current && sequence.current === requestId && !abort.signal.aborted) failed(failure instanceof Error ? failure.message : 'Your address could not be resolved. Retry or search manually.'); }
    finally { clearTimeout(timeout); if (sequence.current === requestId) pending.current = false; }
  }
  function type(text: string) { invalidate(); ownUpdate.current = null; setQuery(text); setEditing(true); setSuggestions([]); setError(''); setStatus('idle'); changeRef.current(null); }
  const busy = status === 'locating' || status === 'selecting';
  useEffect(() => { pendingRef.current?.(busy); }, [busy]);
  return <section className="real-location-field" aria-label={`${label} picker`}>
    <label htmlFor={id}>{label}</label><div className="real-location-input"><MapPin size={17} aria-hidden="true" /><input ref={inputRef} id={id} type="text" role="combobox" aria-autocomplete="list" aria-expanded={suggestions.length > 0} aria-controls={`${id}-suggestions`} aria-activedescendant={activeIndex >= 0 && suggestions[activeIndex] ? `${id}-option-${activeIndex}` : undefined} aria-describedby={`${id}-state`} autoComplete="off" maxLength={240} placeholder={citiesOnly ? 'Search for a destination city' : 'Search an address, hotel, landmark or station'} value={query} onChange={event => type(event.target.value)} onKeyDown={event => {
      if (event.key === 'ArrowDown' && suggestions.length) { event.preventDefault(); setActiveIndex(index => (index + 1) % suggestions.length); }
      else if (event.key === 'ArrowUp' && suggestions.length) { event.preventDefault(); setActiveIndex(index => (index - 1 + suggestions.length) % suggestions.length); }
      else if (event.key === 'Enter') { event.preventDefault(); if (suggestions[activeIndex] && !busy) void choose(suggestions[activeIndex].placeId); }
      else if (event.key === 'Escape') { event.preventDefault(); invalidate(); setSuggestions([]); setEditing(false); setStatus(value ? 'ready' : 'idle'); }
    }} /><button type="button" className="icon-button" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => { type(''); token.current = crypto.randomUUID(); inputRef.current?.focus(); }}><X size={16} /></button></div>
    {gps && <button type="button" className="button secondary location-gps" disabled={busy} onClick={() => void currentLocation()}>{status === 'locating' ? <LoaderCircle size={16} className="spin" /> : <LocateFixed size={16} />}{status === 'locating' ? 'Finding and resolving your location…' : 'Use my current location'}</button>}
    <ul id={`${id}-suggestions`} role="listbox" aria-label={`${label} suggestions`} className="real-location-suggestions">{suggestions.map((suggestion, index) => <li key={suggestion.placeId} id={`${id}-option-${index}`} role="option" aria-selected={index === activeIndex} onMouseEnter={() => setActiveIndex(index)}><button type="button" tabIndex={-1} onClick={() => void choose(suggestion.placeId)}>{suggestion.text}</button></li>)}</ul>
    <div id={`${id}-state`} className="location-state" aria-live="polite">
      {status === 'searching' && <p role="status">Searching places…</p>}{status === 'selecting' && <p role="status">Validating the selected address and coordinates…</p>}{status === 'empty' && <p role="status">No suggestions returned. Try a fuller address or another spelling.</p>}
      {status === 'error' && <div role="alert"><p>{error}</p><button type="button" className="text-button" onClick={() => { if (editing && query.trim().length >= 2) setRetry(value => value + 1); else { setEditing(true); inputRef.current?.focus(); setError(''); setStatus('idle'); } }}>Retry search</button>{gps && <button type="button" className="text-button" onClick={() => void currentLocation()}>Retry current location</button>}</div>}
      {!value && !busy && editing && query.trim() && <p>Select a suggestion to confirm this location. Typed text alone is not a selection.</p>}
      {value && <div className="validated-location"><b>{value.address ?? value.name}</b><p>{value.source === 'gps' ? `Captured browser location · accuracy about ${Math.ceil(value.accuracyMeters!)} m · read ${new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(value.observedAt!))}` : value.source === 'pin' ? 'Selected map pin' : value.source === 'saved' ? 'Saved coordinate point · not a current location read' : 'Selected Google place'}</p><details><summary>Show coordinates</summary><p>{value.coordinates.latitude.toFixed(5)}, {value.coordinates.longitude.toFixed(5)}</p></details></div>}
      {value?.address === null && !busy && <div role="status"><p>Your coordinates were obtained, but the address could not be resolved. {value.receiptStatus === 'local' ? 'Reconnect to the backend before routing; your point is preserved.' : 'You can still use this location after reviewing the starting city.'}</p>{value.resolutionMessage && <p>{value.resolutionMessage}</p>}<button type="button" className="text-button" onClick={() => void currentLocation(value)}>Retry address lookup</button></div>}
    </div>
    {(suggestions.length > 0 || value?.provider === 'google') && <div className="google-attribution" translate="no">Google Maps</div>}
    {value?.attributions?.map((row, index) => <p className="field-note" key={`${row.provider}:${index}`}>{row.providerUri ? <a href={row.providerUri} target="_blank" rel="noopener noreferrer">{row.provider}</a> : row.provider}</p>)}
  </section>;
}
