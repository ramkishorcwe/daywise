import { useEffect, useRef, useState } from 'react';
import type { TripSession } from '../../../../packages/contracts/src';
import { getCity } from '../../../../fixtures/cities';
import { formatTime, localDate } from '../../../../packages/domain/src/time-format';
import Dialog from './Dialog';
import './local-day.css';

export default function ReturnReport({ initial, close, commit }: { initial: TripSession; close: () => void; commit: (source: TripSession, next: TripSession) => Promise<void> }) {
  const [session, setSession] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const city = getCity(session.input.cityId)!, confirmed = session.confirmed!, endpoint = city.anchors.find(anchor => anchor.id === confirmed.input.endAnchorId)?.name ?? 'Saved return point';
  const [date, setDate] = useState(() => initial.completion ? localDate(Date.parse(initial.completion.arrivedAt), city.timezone) : confirmed.input.date);
  const [time, setTime] = useState(() => initial.completion ? formatTime(Date.parse(initial.completion.arrivedAt), city.timezone) : '');
  const active = useRef(true), running = useRef(false), worker = useRef<Worker | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; worker.current?.terminate(); if (timer.current) clearTimeout(timer.current); }; }, []);
  async function save() {
    if (running.current) return; running.current = true; setBusy(true); setError(''); setNotice('');
    const source = session;
    try {
      const next = await new Promise<TripSession>((resolve, reject) => {
        worker.current = new Worker(new URL('../local-day-worker.ts', import.meta.url), { type: 'module' });
        timer.current = setTimeout(() => reject(new Error('Return reporting took too long. Retry; your saved day is preserved.')), 20000);
        worker.current.onerror = () => reject(new Error('Return reporting is unavailable. Reopen this panel and retry.'));
        worker.current.onmessage = event => event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.session);
        worker.current.postMessage({ action: 'return', session: source, arrivalDate: date, arrivalTime: time });
      });
      if (!active.current) return; await commit(source, next);
      if (active.current) { setSession(next); setNotice('Return report saved on this device. Your accepted itinerary, progress and expense records are preserved.'); }
    } catch (failure) { if (active.current) setError(failure instanceof Error ? failure.message : 'Return could not be saved. Check storage and retry.'); }
    finally { worker.current?.terminate(); if (timer.current) clearTimeout(timer.current); running.current = false; if (active.current) setBusy(false); }
  }
  return <Dialog title={session.completion ? 'Review your return report' : 'Report arrival at your return point'} close={close}><div className="local-day-space">
    <h3>{endpoint}</h3><p>{city.name} · {city.timezone}</p><p>This is your manual report, not GPS confirmation. Report arrival only after reaching your return point. All itinerary stops must already be reported complete.</p>
    <p className="field-note">The date defaults to the planned day. Enter the arrival time yourself. Arrival cannot precede your last reported departure or be in the future; ambiguous local times are refused. Arriving after the planned deadline is allowed and does not change the accepted estimate.</p>
    <div className="form-grid"><label>Return arrival date<input type="date" required disabled={busy} value={date} onChange={event => { setDate(event.target.value); setNotice(''); }} /></label><label>Return arrival time<input type="time" required disabled={busy} value={time} onChange={event => { setTime(event.target.value); setNotice(''); }} /></label></div>
    <p className="field-note">Saving marks this local day as returned and locks progress/replanning. You can correct this arrival report later without reopening the itinerary. Estimates and booked/actual expenses remain separate.</p>
    {error && <div className="error-box" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
    <div className="dialog-actions"><button className="button secondary" onClick={close}>Close</button><button className="button primary" disabled={busy || !date || !time} onClick={() => void save()}>{busy ? 'Saving return report…' : session.completion ? 'Save corrected return report' : 'Save return report'}</button></div>
  </div></Dialog>;
}
