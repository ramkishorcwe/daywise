import type { LiveItinerary, SelectedLocation } from '../../../packages/contracts/src/locations';
import { formatTime } from '../../../packages/domain/src/time-format';
import type { GuidePlan } from '../../../packages/contracts/src/guide';
import { priceRange, tripPrice, type PriceAllowances } from './trip-price';

const coordinate = (p: SelectedLocation) => `${p.coordinates.latitude},${p.coordinates.longitude}`;
export const journeyPoints = (trip: LiveItinerary, privatePoints: boolean) => privatePoints ? [trip.start, ...trip.stops.map(s => s.location), trip.end] : trip.stops.map(s => s.location);
function directions(points: SelectedLocation[], trip: LiveItinerary) {
  if (points.length === 1) {
    const p = points[0], q = new URLSearchParams({ api: '1', query: coordinate(p) });
    if (p.source === 'search' && p.placeId) q.set('query_place_id', p.placeId);
    const url = `https://www.google.com/maps/search/?${q}`;
    if (url.length <= 2048) return url;
    q.delete('query_place_id'); return `https://www.google.com/maps/search/?${q}`;
  }
  const from = points[0], to = points.at(-1)!, middle = points.slice(1, -1);
  const q = new URLSearchParams({ api: '1', origin: coordinate(from), destination: coordinate(to), travelmode: trip.route.mode === 'WALK' ? 'walking' : trip.route.mode === 'BICYCLE' ? 'bicycling' : 'driving' });
  if (middle.length) q.set('waypoints', middle.map(coordinate).join('|'));
  if (from.source === 'search' && from.placeId) q.set('origin_place_id', from.placeId);
  if (to.source === 'search' && to.placeId) q.set('destination_place_id', to.placeId);
  if (middle.length && middle.every(p => p.source === 'search' && p.placeId)) q.set('waypoint_place_ids', middle.map(p => p.placeId).join('|'));
  let url = `https://www.google.com/maps/dir/?${q}`;
  // Maps URLs have a 2,048-character limit. Preserve exact coordinates and order;
  // omit optional IDs as a group rather than truncate valid provider identifiers.
  if (url.length > 2048) { for (const key of ['origin_place_id', 'destination_place_id', 'waypoint_place_ids']) q.delete(key); url = `https://www.google.com/maps/dir/?${q}`; }
  return url;
}
export function journeyLinks(trip: LiveItinerary, privatePoints: boolean) {
  const points = journeyPoints(trip, privatePoints);
  if (!points.length) throw new Error('No selected visits are available to share.');
  const overview = directions(points, trip), sections: Array<{ url: string; from: number; to: number }> = [];
  // Mobile browsers accept at most three intermediate waypoints. Adjacent
  // sections share their boundary point so no stop or connecting leg is lost.
  if (points.length > 5) for (let from = 0; from < points.length - 1; from += 4) { const to = Math.min(from + 4, points.length - 1); sections.push({ url: directions(points.slice(from, to + 1), trip), from, to }); }
  return { overview, sections, points };
}
export function journeyLinkText(trip: LiveItinerary, privatePoints: boolean) {
  const links = journeyLinks(trip, privatePoints);
  return [privatePoints ? 'Whole journey map (start → visits → return):' : 'Visit route map (start and return hidden):', links.overview,
    ...(links.sections.length ? ['On mobile, open these map sections in order to include every stop:', ...links.sections.flatMap((s, i) => [`Map section ${i + 1}: ${links.points[s.from].name} → ${links.points[s.to].name}`, s.url])] : []),
    'Google Maps recalculates directions; the itinerary times are a saved schedule.'].join('\n');
}
export function whatsappItineraryText(plan: GuidePlan, title: string, privatePoints: boolean, includePrice: boolean, allowances?: PriceAllowances) {
  const trip = plan.itinerary, time = (iso: string) => formatTime(Date.parse(iso), trip.destination.timezone!);
  const date = new Intl.DateTimeFormat('en', { timeZone: trip.destination.timezone, dateStyle: 'long' }).format(new Date(trip.route.departureTime));
  const short = (s: string) => Array.from(s).length > 100 ? `${Array.from(s).slice(0, 97).join('')}…` : s;
  const lines = [short(title.trim() || `A day in ${trip.destination.name}`), `Daywise itinerary · ${date} · ${trip.destination.timezone}`, privatePoints ? `Start ${time(trip.route.departureTime)}: ${short(trip.start.name)}` : `Departure ${time(trip.route.departureTime)} · starting point hidden`,
    ...trip.stops.map((s, i) => `${i + 1}. ${time(s.arrivalAt)}–${time(s.departureAt)} · ${plan.stops[i].mealKind ? 'Meal · ' : ''}${short(s.location.name)}`),
    privatePoints ? `Return ${time(trip.finishAt)}: ${short(trip.end.name)}` : `Return ${time(trip.finishAt)} · return point hidden`];
  if (includePrice) { const price = tripPrice(plan, allowances); lines.push(`Group estimate: ${priceRange(price.minimum, price.maximum, price.currency)}${price.partial ? ' · unpriced costs remain' : ''}`); }
  lines.push('', journeyLinkText(trip, privatePoints), '', 'Confirm hours, fees and food preparation. This copy does not receive updates.');
  return lines.join('\n');
}
export const whatsappUrl = (text: string) => `https://wa.me/?${new URLSearchParams({ text })}`;
