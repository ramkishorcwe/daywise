import { useEffect, useState } from 'react';
import type { SelectedLocation } from '../../../../packages/contracts/src/locations';
import type { FestivalSearchResult } from '../../../../packages/contracts/src/festival-search';
import { clearFestivalSearch, festivalSearchKey, searchLocalFestivals } from '../festival-search';
const eventName = (name: string) => name.toLowerCase().replace(/\b(festival|fair)\b/g, '').replace(/\s+/g, ' ').trim();
export default function LocalFestivalCheck({ destination, date, known }: { destination: Pick<SelectedLocation, 'city' | 'state'>; date: string; known: string[] }) {
  const input = { city: destination.city!, state: destination.state ?? null, month: date.slice(0, 7) }, key = festivalSearchKey(input);
  const [retry, setRetry] = useState(0), [state, setState] = useState<{ key: string; value?: FestivalSearchResult; error?: string }>({ key: '' });
  const retryCheck = () => { clearFestivalSearch(input); setState({ key }); setRetry(v => v + 1); };
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setState({ key });
      searchLocalFestivals(input).then(value => { if (active) setState({ key, value }); }, failure => { if (active) setState({ key, error: failure instanceof Error ? failure.message : 'Local festival search is unavailable. Retry.' }); });
    }, 900);
    return () => { active = false; clearTimeout(timer); };
  }, [key, retry]);
  const current = state.key === key ? state : null, result = current?.value, expired = result && Date.parse(result.expiresAt) <= Date.now();
  const events = !expired ? result?.events.filter(e => e.startsOn <= date && date <= e.endsOn && !known.some(name => eventName(name) === eventName(e.name))) ?? [] : [];
  return <div className="local-festival-check" aria-label="Local festival check">
    <div role="status" aria-live="polite">{!current?.value && !current?.error && <p>Checking published local festivals for {destination.city!.name}…</p>}
      {current?.error && <p>{current.error} <button type="button" className="text-button" onClick={retryCheck}>Retry festival check</button></p>}
      {expired && <p>The local festival check expired. <button type="button" className="text-button" onClick={retryCheck}>Refresh festival check</button></p>}
      {!!events.length && <div className="traffic-advisory-warning local-event-warning"><strong>Possible local festival traffic</strong><ul>{events.map((event, i) => <li key={`${event.name}:${i}`}><b>{event.name}</b> · {event.startsOn === event.endsOn ? event.startsOn : `${event.startsOn}–${event.endsOn}`}<p>{event.area ? `Celebration area: ${event.area}. ` : ''}Festival crowds may slow nearby roads. Check current local traffic arrangements before leaving.</p><a href={event.sourceUrl} target="_blank" rel="noopener noreferrer">Date source</a></li>)}</ul><p>Search-derived dates; confirm with the linked source. No extra delay has been added to the itinerary.</p></div>}
      {result && !expired && !events.length && <p>{known.length ? 'The local search found no additional dated festivals for this day.' : 'No additional source-backed festival dates were found for this day.'} Other events or traffic restrictions may still occur.</p>}
    </div>
    {result && !expired && <><details><summary>Local search sources · {destination.city!.name}</summary><p>Searched {result.month}; checked {new Date(result.checkedAt).toLocaleString()}.{result.incomplete && ' Some results lacked usable date or location evidence and were excluded.'}</p><ul>{result.sources.map((source, i) => <li key={i}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul></details>{result.searchSuggestions && <iframe title="Google Search suggestions for local festivals" className="festival-search-suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'"><base target="_blank">${result.searchSuggestions}`} />}</>}
  </div>;
}
