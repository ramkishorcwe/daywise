import { liveItinerarySchema, startMatchesDestination, type SelectedLocation, type LiveRoute, type LiveRouteInput } from '../../contracts/src/locations';
import { zonedTime } from './time';

export function liveDeparture(input: Pick<LiveRouteInput, 'date' | 'startTime' | 'endTime'>, destination: SelectedLocation, now = Date.now()) {
  if (!destination.timezone || !destination.city) throw new Error('Choose a resolved destination city with a timezone.');
  const departure = zonedTime(input.date, input.startTime, destination.timezone), deadline = zonedTime(input.date, input.endTime, destination.timezone);
  if (deadline <= departure) throw new Error('Return by must follow departure on the same destination-local day.');
  if (departure < now || departure > now + 7 * 86400000) throw new Error('Choose a departure in the next seven days for a provider route estimate.');
  return { departure, deadline };
}
export function buildLiveItinerary(input: LiveRouteInput, destination: SelectedLocation, start: SelectedLocation, end: SelectedLocation, stops: SelectedLocation[], route: LiveRoute, now = Date.now()) {
  const { departure, deadline } = liveDeparture(input, destination, now);
  if (!startMatchesDestination(start, destination) && !input.allowOutsideStart) throw new Error('Your starting city differs or could not be verified. Choose to travel from this start or select a start within your destination.');
  if (route.optimizedOrder.length !== stops.length || new Set(route.optimizedOrder).size !== stops.length || route.optimizedOrder.some(index => index < 0 || index >= stops.length) || route.legs.length !== stops.length + 1) throw new Error('The provider route has inconsistent stop order or legs.');
  let cursor = departure;
  const scheduled = route.optimizedOrder.map((originalIndex, index) => {
    cursor += route.legs[index].durationSeconds * 1000; const arrivalAt = new Date(cursor).toISOString(), durationMinutes = input.stops[originalIndex].durationMinutes;
    cursor += durationMinutes * 60000;
    return { location: stops[originalIndex], durationMinutes, arrivalAt, departureAt: new Date(cursor).toISOString() };
  });
  cursor += route.legs.at(-1)!.durationSeconds * 1000;
  return liveItinerarySchema.parse({ route, destination, start, end, stops: scheduled, finishAt: new Date(cursor).toISOString(), deadlineAt: new Date(deadline).toISOString(), withinTime: cursor <= deadline, warnings: [
    'Driving estimates are Google predictions for departure, not observations of every later leg. Visit durations are your allowances; later traffic can change after stops.',
    'Opening hours, admission, food suitability, accessibility, tickets and total spending are not verified by a driving route. Budget feasibility is unknown.',
    ...([start, end].some(location => location.address === null) ? ['An address could not be resolved. Routing uses the selected coordinates; review the map and starting-city consent.'] : []),
    ...(!startMatchesDestination(start, destination) ? ['You chose to travel from a starting city outside or unverified against the destination city. The destination was not changed.'] : []),
    ...(stops.some(stop => !startMatchesDestination(stop, destination)) ? ['One or more visits are outside or unverified against your destination city. Review their addresses and travel before accepting.'] : []),
  ] });
}
