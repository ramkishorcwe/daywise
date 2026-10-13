import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import type { ConfirmedPlan, TripSession } from '../../../../packages/contracts/src';
import { getCity } from '../../../../fixtures/cities';
import { travelCopy, travelCopyHtml, travelCopyStyle } from '../../../../packages/domain/src/travel-copy';
import { sameValue } from '../../../../packages/domain/src/versioning';
import Dialog from './Dialog';
import './travel-copy.css';

export default function TravelCopy({ session, close }: { session: TripSession; close: () => void }) {
  // A deliberate snapshot: later callbacks cannot change the copy being reviewed.
  const [confirmed] = useState<ConfirmedPlan | null>(() => structuredClone(session.confirmed));
  const [includeBudget, setIncludeBudget] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  if (!confirmed) return <Dialog title="Create a travel copy" close={close}><p>Confirm your itinerary first, then preview a read-only copy of the day you accepted.</p></Dialog>;
  const city = getCity(confirmed.input.cityId);
  let copy;
  try { if (!city) throw new Error('This saved city is not supported by the current catalog.'); copy = travelCopy(confirmed, city, includeBudget); }
  catch { return <Dialog title="Travel copy unavailable" close={close}><div className="error-box" role="alert">The accepted snapshot could not be read for this city. Your saved day is unchanged.</div></Dialog>; }
  const unaccepted = !sameValue(session.input, confirmed.input) || (session.draftOrder !== null && !sameValue(session.draftOrder, confirmed.plan.order));
  return <Dialog title="A copy of your accepted day" close={close} wide>
    <div className="travel-copy">
      <div className="travel-copy-tools"><p>Preview exactly what the file contains. It stays on your device until you choose to send it. Anyone you send it to can read the date, schedule and starting/return points.</p>
        {unaccepted && <p className="travel-copy-draft" role="status">Your unaccepted edits are excluded. This copy uses the accepted day.</p>}
        <label className="checkbox-row"><input type="checkbox" checked={includeBudget} onChange={event => setIncludeBudget(event.target.checked)} />Include estimated group budget</label>
        <p className="field-note">Dietary/accessibility preferences, party ages, reported expenses and backend credentials are always excluded. This file is a travel copy, not a restorable backup.</p>
        <div className="travel-copy-actions"><button className="button primary" onClick={() => {
          setError(''); try {
            const file = new Blob([travelCopyHtml(copy)], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(file), link = document.createElement('a'); link.href = url; link.download = `daywise-travel-copy-${copy.date}.html`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            setNotice('Travel copy downloaded. Share the file yourself if you choose; later plan changes do not update it.');
          } catch { setError('The file could not be prepared. Your accepted plan is preserved; try again or print the preview.'); }
        }}><Download size={16} />Download travel copy</button><button className="button secondary" onClick={() => { setError(''); try { window.print(); } catch { setError('Printing is unavailable here. Download the HTML file and print it in your browser.'); } }}><Printer size={16} />Print travel copy</button></div>
        {notice && <p className="travel-copy-notice" role="status">{notice}</p>}{error && <p className="error-box" role="alert">{error}</p>}
      </div>
      <style>{travelCopyStyle}</style>
      <article className="travel-copy-sheet" aria-label="Travel copy preview">
        <div className="travel-copy-brand">daywise.</div><p className="travel-copy-label">READ-ONLY TRAVEL COPY · ACCEPTED SCHEDULE</p><h1>{copy.title}</h1><p className="travel-copy-context">{copy.date} · {copy.timezone}</p>
        <p className="travel-copy-warning">Fictional test itinerary. Venues, hours, prices and travel times are unverified software fixtures. This is a saved schedule, not navigation or a live update.</p>
        <p>Source: {copy.source}{copy.stale && ' · Older test catalog; review a fresh day before relying on changed data.'}</p>
        <div className="travel-copy-anchor"><b>Start {copy.start.time}</b> · {copy.start.name}</div>
        <ol className="travel-copy-stops">{copy.stops.map((stop, index) => <li key={index}><small>{stop.travel} min travel · test estimate{stop.wait ? ` · ${stop.wait} min planned wait` : ''}</small><h3>{stop.name}</h3><p className="travel-copy-times">{stop.arrival}–{stop.departure} · {stop.kind}</p><p>{stop.duration} min planned here</p></li>)}</ol>
        <div className="travel-copy-anchor"><b>Return {copy.end.time}</b> · {copy.end.name}<p>{copy.end.travel} min return travel · test estimate</p></div>
        {copy.budget && <section className="travel-copy-budget"><h2>Estimated whole-group budget</h2><p><b>{copy.budget.total}</b> of {copy.budget.limit} available</p><dl>{copy.budget.rows.map(row => <div key={row.name}><dt>{row.name}</dt><dd>{row.value}</dd></div>)}</dl><p>Fictional estimates, including reserve and return travel. Accommodation and reported booked/actual costs are excluded.</p></section>}
        <p className="travel-copy-footnote">A static copy of the accepted itinerary. Draft changes, reported progress, dietary/accessibility preferences, party ages and expense records are excluded. It does not certify suitability or current conditions. Copies do not receive later revisions.</p>
      </article>
    </div>
  </Dialog>;
}
