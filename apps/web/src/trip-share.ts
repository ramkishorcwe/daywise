import type { GuidePlan } from '../../../packages/contracts/src/guide';
import { formatTime } from '../../../packages/domain/src/time-format';
import { priceRange, tripPrice, type PriceAllowances } from './trip-price';

export function tripShareText(plan: GuidePlan, title: string, includePrivatePoints: boolean, includePrice: boolean, allowances?: PriceAllowances) {
  const t = plan.itinerary, time = (iso: string) => formatTime(Date.parse(iso), t.destination.timezone!);
  const date = new Intl.DateTimeFormat('en', { timeZone: t.destination.timezone, dateStyle: 'long' }).format(new Date(t.route.departureTime));
  const lines = [title.trim() || `A day in ${t.destination.name}`, `${date} · ${t.destination.timezone}`, 'Daywise itinerary · static copy', `${(t.route.distanceMeters / 1000).toFixed(1)} km · ${Math.ceil(t.route.durationSeconds / 60)} min planned travel`, ''];
  if (includePrivatePoints) lines.push(`Start ${time(t.route.departureTime)}: ${t.start.address ?? t.start.name}`, `${t.start.coordinates.latitude}, ${t.start.coordinates.longitude}`);
  else lines.push(`Departure ${time(t.route.departureTime)} · starting point omitted`);
  t.stops.forEach((s, i) => {
    lines.push('', `${i + 1}. ${plan.stops[i].mealKind ? 'Meal · ' : ''}${s.location.name}`, `${time(s.arrivalAt)}–${time(s.departureAt)} · ${s.durationMinutes} min`, ...(s.location.address ? [s.location.address] : []));
    const q = new URLSearchParams({ api: '1', query: s.location.name });
    if (s.location.placeId) q.set('query_place_id', s.location.placeId);
    lines.push(`https://www.google.com/maps/search/?${q}`);
  });
  lines.push('', includePrivatePoints ? `Return ${time(t.finishAt)}: ${t.end.address ?? t.end.name}\n${t.end.coordinates.latitude}, ${t.end.coordinates.longitude}` : `Return ${time(t.finishAt)} · return point omitted`);
  if (includePrice) { const p = tripPrice(plan, allowances); lines.push('', `Group price estimate: ${priceRange(p.minimum, p.maximum, p.currency)}`, p.partial ? 'Partial estimate: unpriced items remain. Allowances are unverified.' : 'Estimate, not a guaranteed price.'); }
  lines.push('', 'Confirm opening hours, fees and food requirements before visiting. Travel times may change; this copy does not receive updates.', 'Google Maps');
  return lines.join('\n');
}
