import { sharedTripSchema, type SharedTrip } from '../../../packages/contracts/src/shared-trip';
import type { GuidePlan } from '../../../packages/contracts/src/guide';
import { journeyLinks } from './journey-links';
import { priceCategories, priceLabels, tripPrice, type PriceAllowances } from './trip-price';
import { stopPriceLines } from './stop-price';
export function sharedSnapshot(plan: GuidePlan, title: string, privatePoints: boolean, includePrice: boolean, allowances?: PriceAllowances): SharedTrip {
  const t = plan.itinerary, links = journeyLinks(t, privatePoints);
  const point = (p: typeof t.start) => ({ name: p.name, address: p.address, coordinates: { ...p.coordinates } });
  const p = tripPrice(plan, allowances);
  // An allowlist excludes session receipts, owner IDs, ages, diet, personal
  // notes and expenses. The full polyline is omitted with private endpoints.
  const route = t.route;
  return sharedTripSchema.parse({ schemaVersion: 1, title: title.trim().slice(0, 300), city: t.destination.name, timezone: t.destination.timezone!, departureAt: route.departureTime, finishAt: t.finishAt,
    travel: { meters: route.distanceMeters, seconds: route.durationSeconds, mode: route.mode },
    ...(privatePoints ? { start: point(t.start), end: point(t.end), route: { provider: route.provider, mode: route.mode, durationSeconds: route.durationSeconds, distanceMeters: route.distanceMeters, encodedPolyline: route.encodedPolyline, departureTime: route.departureTime, fetchedAt: route.fetchedAt, expiresAt: route.expiresAt, trafficBasis: route.trafficBasis, persistence: route.persistence } } : {}),
    stops: t.stops.map((s, i) => ({ point: point(s.location), arrivalAt: s.arrivalAt, departureAt: s.departureAt, durationMinutes: s.durationMinutes, meal: !!plan.stops[i].mealKind, priceLines: includePrice ? stopPriceLines(plan.stops[i], plan.budget.breakdown?.people) : [] })),
    mapUrl: links.overview, mapSections: links.sections.map(s => s.url),
    ...(includePrice ? { price: { total: { minimum: p.minimum, maximum: p.maximum }, currency: p.currency, ...(plan.budget.breakdown ? { people: plan.budget.breakdown.people } : {}), limit: plan.budget.groupLimit, partial: p.partial,
      rows: [...(plan.budget.breakdown ? (['tickets', 'food', 'transport'] as const).map(c => ({ label: 'Included ' + priceLabels[c].toLowerCase(), minimum: plan.budget.breakdown![c].minimum, maximum: plan.budget.breakdown![c].maximum })) : []), ...priceCategories.flatMap(c => p.extra[c] ? [{ label: 'Additional ' + priceLabels[c].toLowerCase(), ...p.extra[c]! }] : [])], unknowns: [...plan.budget.unknowns] } } : {}),
  });
}
