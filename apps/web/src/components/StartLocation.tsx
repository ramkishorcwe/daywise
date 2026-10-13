import { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import type { City, TripInput } from '../../../../packages/contracts/src';
import { readCurrentPosition, type LocationPreview } from '../location';
import './start-location.css';

export type StartMode = 'demo' | 'current' | 'address';
export default function StartLocation({ city, input, mode, setMode, update, focus = false }: {
  city: City; input: TripInput; mode: StartMode; setMode: (mode: StartMode) => void;
  update: (patch: Partial<TripInput>) => void; focus?: boolean;
}) {
  const [address, setAddress] = useState(''), [position, setPosition] = useState<LocationPreview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const sequence = useRef(0), mounted = useRef(true), section = useRef<HTMLElement>(null);
  useEffect(() => {
    mounted.current = true;
    const frame = focus ? requestAnimationFrame(() => { section.current?.focus({ preventScroll: true }); section.current?.scrollIntoView({ block: 'start' }); }) : null;
    return () => { mounted.current = false; sequence.current++; if (frame !== null) cancelAnimationFrame(frame); };
  }, []);
  function selectMode(next: StartMode) { sequence.current++; setBusy(false); setPosition(null); setError(''); setAddress(''); setMode(next); }
  async function locate() {
    if (busy) return;
    const id = ++sequence.current; setMode('current'); setBusy(true); setPosition(null); setAddress(''); setError('');
    try { const preview = await readCurrentPosition(); if (mounted.current && sequence.current === id) setPosition(preview); }
    catch (failure) { if (mounted.current && sequence.current === id) setError(failure instanceof Error ? failure.message : 'Location is unavailable. Choose manually.'); }
    finally { if (mounted.current && sequence.current === id) setBusy(false); }
  }
  const matches = city.anchors.filter(anchor => anchor.name.toLowerCase().includes(address.trim().toLowerCase()));
  const sameReturn = input.startAnchorId === input.endAnchorId;
  function selectStart(id: string) { update({ startAnchorId: id, ...(sameReturn ? { endAnchorId: id } : {}) }); }
  return <section ref={section} tabIndex={-1} className="start-location" aria-label="Choose your starting point">
    <div className="start-location-heading"><MapPin size={19} /><div><h3>Where will your day start?</h3><p>Use your current location or choose a place yourself.</p></div></div>
    <p className="field-note">Current locations and real addresses are previews until real-location planning is connected. Use a test point below to build a test day.</p>
    <div className="start-location-actions"><button type="button" className="button secondary" aria-pressed={mode === 'current'} disabled={busy} onClick={() => void locate()}><LocateFixed size={17} />{busy ? 'Finding your location…' : 'Use my current location'}</button><button type="button" className="button secondary" aria-pressed={mode === 'address'} onClick={() => selectMode('address')}><Search size={17} />Choose a place</button></div>
    <p className="field-note">Location is requested only when you tap the button. It is read once, kept only while this screen is open, and never tracked in the background.</p>
    {mode === 'current' && <div className="location-preview">
      {busy && <p role="status">Waiting for your browser’s location permission. You can choose a place instead.</p>}
      {error && <p className="location-error" role="alert">{error}</p>}
      {position && <><h4>Location captured</h4><p aria-label="Captured coordinates">{position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}</p><p>Browser-reported accuracy: about {Math.ceil(position.accuracyMeters)} m · checked {new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(position.observedAt)} on this device.</p><p>This point is a preview. Real routes are not connected yet, so it cannot become the start of a test itinerary.</p></>}
    </div>}
    {mode === 'address' && <div className="location-address"><label>Address or place name<input type="search" autoComplete="off" maxLength={240} value={address} placeholder="Hotel, station or street address" onChange={event => setAddress(event.target.value)} /></label><p className="field-note">Real address lookup needs the Maps connection. You can enter any address here, but it has not been looked up or saved. For a test plan, choose one of the matching demo points below.</p>{!!matches.length && <div className="test-start-matches" aria-label="Matching test starting points">{matches.map(anchor => <button type="button" key={anchor.id} onClick={() => { selectStart(anchor.id); selectMode('demo'); }}><MapPin size={16} /><span>{anchor.name}<small>Fictional test starting point · {city.name}</small></span></button>)}</div>}{!matches.length && <p role="status">This place needs connected address lookup. No real-world search has been performed.</p>}</div>}
    {mode !== 'demo' && <div className="location-availability"><p><b>Real-location planning is not connected yet.</b> Choose a test starting point to continue with this demo. Your current plan stays unchanged.</p><button type="button" className="text-button" onClick={() => selectMode('demo')}>Choose a test starting point</button></div>}
    {mode === 'demo' && <>
      <span className="pill pale">TEST START · fictional location</span>
      <div className="form-grid"><label>Starting point<select aria-label="Starting point" value={input.startAnchorId} onChange={event => selectStart(event.target.value)}>{city.anchors.map(anchor => <option key={anchor.id} value={anchor.id}>{anchor.name}</option>)}</select></label><div className="location-return"><label className="checkbox-row"><input type="checkbox" checked={sameReturn} onChange={event => update({ endAnchorId: event.target.checked ? input.startAnchorId : city.anchors.find(anchor => anchor.id !== input.startAnchorId)?.id ?? input.startAnchorId })} /><span>Return to the same place</span></label>{!sameReturn && <label>Return point<select aria-label="Return point" value={input.endAnchorId} onChange={event => update({ endAnchorId: event.target.value })}>{city.anchors.map(anchor => <option key={anchor.id} value={anchor.id}>{anchor.name}</option>)}</select></label>}</div></div>
      <p className="field-note">Selected: {city.anchors.find(anchor => anchor.id === input.startAnchorId)?.name}. These test points have no real address or GPS coordinates.</p>
    </>}
  </section>;
}
