import { localTripSchema, type LocalTrip } from '../../contracts/src/accepted-trip';

export function acceptedTripCopy(value: LocalTrip): LocalTrip | null {
  if (!value.accepted || !value.acceptedId) return null;
  const t = value.accepted;
  const sameReturn = t.start.id === t.end.id;
  return localTripSchema.parse({ ...value, destination: t.destination, start: t.start, end: sameReturn ? null : t.end, sameReturn,
    stops: t.stops.map((stop, i) => ({ key: value.stops[i]?.key ?? crypto.randomUUID(), location: stop.location, durationMinutes: stop.durationMinutes })),
    date: new Intl.DateTimeFormat('en-CA', { timeZone: t.destination.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t.route.departureTime)),
    startTime: new Intl.DateTimeFormat('en-GB', { timeZone: t.destination.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t.route.departureTime)),
    endTime: new Intl.DateTimeFormat('en-GB', { timeZone: t.destination.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t.deadlineAt)),
    preview: t, guideReview: value.acceptedGuide, priceAllowances: value.acceptedPriceAllowances, view: 'day',
  });
}
