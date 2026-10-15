import type { SelectedLocation } from '../../../../packages/contracts/src/locations';
import { festivalTraffic, validTravelDate } from '../../../../packages/domain/src/festival-traffic';
import './traffic-advisory.css';
import { createContext, useContext } from 'react';
import LocalFestivalCheck from './LocalFestivalCheck';
export const FestivalSearchContext = createContext(false);

const dateLabel = (date: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T00:00:00Z`));
export default function TrafficAdvisory({ destination, date }: { destination: Pick<SelectedLocation, 'city' | 'state'> | null; date: string }) {
  const liveSearch = useContext(FestivalSearchContext);
  if (!destination?.city || !validTravelDate(date)) return null;
  const events = festivalTraffic(destination, date);
  return <aside className={`traffic-advisory ${events.length ? 'traffic-advisory-warning' : ''}`} aria-label="Festival traffic advisories">
    <div role="status" aria-live="polite" aria-atomic="true">{!!events.length && <>
      <strong>Possible festival traffic</strong>
      <ul>{events.map(event => <li key={event.id}><b>{event.name}</b> · {event.startsOn === event.endsOn ? dateLabel(event.startsOn) : `${dateLabel(event.startsOn)}–${dateLabel(event.endsOn)}`}<p>{event.advice}</p><a href={event.source.url} target="_blank" rel="noopener noreferrer">{event.source.label}</a>{event.informationUrl && <> · <a href={event.informationUrl} target="_blank" rel="noopener noreferrer">Event information</a></>}</li>)}</ul>
      <p>Check local traffic police updates and live navigation before leaving. This is a calendar advisory, not a confirmed road closure. No extra delay has been added to your schedule.</p>
    </>}</div>
    {liveSearch && <LocalFestivalCheck destination={destination} date={date} known={events.map(e => e.name)} />}
    <details><summary>Festival coverage</summary><p>{liveSearch ? 'Searches published local, regional and national festivals for your selected city and calendar month, then compares their dates with your travel day. Search results are not exhaustive or live road-closure reports. Reviewed calendar dates supplement the search.' : 'Live local festival search is not configured. Reviewed calendar coverage is limited to Jaipur Gangaur/Teej (2026–2030), Udaipur Mewar and Jodhpur Marwar (2026–2027), and selected Indian festivals (2026).'} Other events may affect your trip even when no notice appears. Dates and local arrangements can change; confirm close to travel.</p></details>
  </aside>;
}
