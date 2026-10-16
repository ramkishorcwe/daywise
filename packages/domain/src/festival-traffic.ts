import { festivalCalendar, type Festival } from './festival-calendar';
import type { SelectedLocation } from '../../contracts/src/locations';

export type FestivalTrafficAdvisory = Festival & { startsOn: string; endsOn: string };
const cityKey = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
export function validTravelDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date;
}

// Match the provider-confirmed destination identity, never its free-text address or the browser's position.
export function festivalTraffic(destination: Pick<SelectedLocation, 'city'> | null, date: string): FestivalTrafficAdvisory[] {
  const city = destination?.city;
  if (!city || !validTravelDate(date)) return [];
  return festivalCalendar.flatMap(event => {
    if (event.countryCode !== city.countryCode || (event.cities && !event.cities.some(name => cityKey(name) === cityKey(city.name)))) return [];
    const period = event.periods.find(([start, end]) => start <= date && date <= end);
    return period ? [{ ...event, startsOn: period[0], endsOn: period[1] }] : [];
  });
}
