import { lazy, Suspense, useState } from 'react';
import type { GuidePlan } from '../../../../packages/contracts/src/guide';
import type { PriceAllowances } from '../trip-price';
import { tripShareText } from '../trip-share';
import Dialog from './Dialog';
import { journeyLinks, whatsappItineraryText, whatsappUrl } from '../journey-links';
const JourneyMap = lazy(() => import('./JourneyMap'));

export default function ShareTrip({ plan, title, allowances, close }: { plan: GuidePlan; title: string; allowances?: PriceAllowances; close: () => void }) {
  // Freeze the reviewed copy; asynchronous planner responses cannot change it.
  const [snapshot] = useState(() => ({ plan: structuredClone(plan), title, allowances: structuredClone(allowances) }));
  const [privatePoints, setPrivatePoints] = useState(false), [price, setPrice] = useState(true), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [showMap, setShowMap] = useState(false), [active, setActive] = useState(1);
  const text = tripShareText(snapshot.plan, snapshot.title, privatePoints, price, snapshot.allowances);
  const links = journeyLinks(snapshot.plan.itinerary, privatePoints), whatsappText = whatsappItineraryText(snapshot.plan, snapshot.title, privatePoints, price, snapshot.allowances);
  return <Dialog title="Share trip" close={close} wide><div className="trip-share"><p>Review the copy below. Your starting and return points are hidden unless you include them. Guide notes, children’s ages, dietary preferences, expenses and credentials are excluded.</p>
    <label className="checkbox-row"><input type="checkbox" checked={privatePoints} onChange={e => setPrivatePoints(e.target.checked)} />Include starting and return locations</label>
    <label className="checkbox-row"><input type="checkbox" checked={price} onChange={e => setPrice(e.target.checked)} />Include price summary</label>
    <p>WhatsApp opens a draft with the schedule and public Google Maps route links. Choose the recipient and send it yourself.</p>
    <div className="button-row"><a className="button primary" aria-label="Share itinerary on WhatsApp" href={whatsappUrl(whatsappText)} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a><a className="button secondary" href={links.overview} target="_blank" rel="noopener noreferrer">Open shared route in Google Maps</a><button type="button" className="button secondary" onClick={() => setShowMap(v => !v)}>{showMap ? 'Hide shared map' : 'Preview shared map'}</button></div>
    {showMap && <Suspense fallback={<p role="status">Opening shared map…</p>}><JourneyMap plan={snapshot.plan} privatePoints={privatePoints} activeIndex={active} onHighlight={setActive} /></Suspense>}
    <details><summary>WhatsApp message preview</summary><label>WhatsApp draft<textarea aria-label="WhatsApp message preview" readOnly value={whatsappText} rows={10} /></label></details>
    <label>Trip sharing preview<textarea aria-label="Trip sharing preview" readOnly value={text} rows={14} /></label>
    <div className="button-row">{typeof navigator.share === 'function' && <button className="button primary" disabled={busy} onClick={async () => {
      if (busy) return; setBusy(true); setError(''); setNotice('');
      try { await navigator.share({ title: snapshot.title || `Daywise · ${snapshot.plan.itinerary.destination.name}`, text }); setNotice('Trip copy shared.'); }
      catch (failure) { if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError('Sharing is unavailable here. Copy or download the trip instead.'); }
      finally { setBusy(false); }
    }}>{busy ? 'Opening sharing…' : 'Open share options'}</button>}
    <button className="button secondary" disabled={busy} onClick={async () => { setError(''); setNotice(''); try { await navigator.clipboard.writeText(text); setNotice('Trip copied. Paste it into the app you want to share with.'); } catch { setError('Clipboard access is unavailable. Select the preview text and copy it, or download the trip.'); } }}>Copy trip</button>
    <button className="button secondary" disabled={busy} onClick={() => { setError(''); try { const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), a = document.createElement('a'); a.href = url; a.download = 'daywise-trip.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Trip downloaded. Share the file when you choose.'); } catch { setError('Download failed. Copy the preview instead.'); } }}>Download trip</button></div>
    {notice && <p role="status">{notice}</p>}{error && <p className="error-box" role="alert">{error}</p>}
  </div></Dialog>;
}
