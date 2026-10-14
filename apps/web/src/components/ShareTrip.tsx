import { lazy, Suspense, useState } from 'react';
import type { GuidePlan } from '../../../../packages/contracts/src/guide';
import type { PriceAllowances } from '../trip-price';
import { tripShareText } from '../trip-share';
import Dialog from './Dialog';
import { journeyLinks, whatsappItineraryText, whatsappUrl } from '../journey-links';
import { sharedSnapshot } from '../shared-trip';
import { postLocation } from '../location-api';
import { request } from '../api';
import { z } from 'zod';
import { sharedIdSchema } from '../../../../packages/contracts/src/shared-trip';
const JourneyMap = lazy(() => import('./JourneyMap'));

export default function ShareTrip({ plan, title, allowances, close }: { plan: GuidePlan; title: string; allowances?: PriceAllowances; close: () => void }) {
  // Freeze the reviewed copy; asynchronous planner responses cannot change it.
  const [snapshot] = useState(() => ({ plan: structuredClone(plan), title, allowances: structuredClone(allowances) }));
  const [privatePoints, setPrivatePoints] = useState(false), [price, setPrice] = useState(true), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [showMap, setShowMap] = useState(false), [active, setActive] = useState(1);
  const [pageLink, setPageLink] = useState<{ id: string; url: string; expiresAt: string } | null>(null);
  const text = tripShareText(snapshot.plan, snapshot.title, privatePoints, price, snapshot.allowances);
  const links = journeyLinks(snapshot.plan.itinerary, privatePoints), whatsappText = whatsappItineraryText(snapshot.plan, snapshot.title, privatePoints, price, snapshot.allowances);
  return <Dialog title="Share trip" close={close} wide><div className="trip-share"><p>Review the copy below. Your starting and return points are hidden unless you include them. Guide notes, children’s ages, dietary preferences, expenses and credentials are excluded.</p>
    <label className="checkbox-row"><input type="checkbox" disabled={busy} checked={privatePoints} onChange={e => { setPrivatePoints(e.target.checked); setPageLink(null); }} />Include starting and return locations</label>
    <label className="checkbox-row"><input type="checkbox" disabled={busy} checked={price} onChange={e => { setPrice(e.target.checked); setPageLink(null); }} />Include price summary</label>
    <p>Create a read-only Daywise page with the itinerary, prices and map. Anyone with its link can view the included information for seven days. Your private trip remains unchanged.</p>
    <div className="button-row"><button className="button primary" disabled={busy} onClick={async () => {
      if (busy) return; setBusy(true); setError(''); setNotice('');
      try { const result = z.strictObject({ id: sharedIdSchema, expiresAt: z.iso.datetime() }).parse(await postLocation('/shared', sharedSnapshot(snapshot.plan, snapshot.title, privatePoints, price, snapshot.allowances))); setPageLink({ ...result, url: new URL(`/shared/${result.id}`, window.location.origin).href }); setNotice('Your itinerary page is ready to share.'); }
      catch (failure) { setError(failure instanceof Error ? failure.message : 'The itinerary link could not be created. Retry when ready.'); }
      finally { setBusy(false); }
    }}>{busy ? 'Creating itinerary page…' : pageLink ? 'Create a new page link' : 'Create itinerary page link'}</button></div>
    {pageLink && <section aria-label="Shared itinerary page"><label>Itinerary page link<input aria-label="Itinerary page link" value={pageLink.url} readOnly /></label><p>Available until {new Date(pageLink.expiresAt).toLocaleDateString()}.</p><div className="button-row"><a className="button primary" aria-label="Share itinerary on WhatsApp" href={whatsappUrl(pageLink.url)} target="_blank" rel="noopener noreferrer">Share page on WhatsApp</a><a className="button secondary" href={pageLink.url} target="_blank" rel="noopener noreferrer">Open itinerary page</a><button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(pageLink.url); setNotice('Itinerary page link copied.'); } catch { setError('Clipboard access is unavailable. Select and copy the page link above.'); } }}>Copy page link</button><button className="text-button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await request(`/shared/${pageLink.id}`, { method: 'DELETE' }); setPageLink(null); setNotice('Shared page removed. Your private trip is preserved.'); } catch { setError('The shared page could not be removed. Retry.'); } finally { setBusy(false); } }}>Remove shared page</button></div></section>}
    <div className="button-row"><a className="button secondary" href={links.overview} target="_blank" rel="noopener noreferrer">Open shared route in Google Maps</a><button type="button" className="button secondary" onClick={() => setShowMap(v => !v)}>{showMap ? 'Hide shared map' : 'Preview shared map'}</button></div>
    {showMap && <Suspense fallback={<p role="status">Opening shared map…</p>}><JourneyMap plan={snapshot.plan} privatePoints={privatePoints} activeIndex={active} onHighlight={setActive} /></Suspense>}
    <details><summary>Schedule text sharing</summary><a className="button secondary" href={whatsappUrl(whatsappText)} target="_blank" rel="noopener noreferrer">Share schedule text on WhatsApp</a><label>WhatsApp draft<textarea aria-label="WhatsApp message preview" readOnly value={whatsappText} rows={10} /></label></details>
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
