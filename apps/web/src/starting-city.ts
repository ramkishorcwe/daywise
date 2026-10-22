import { startMatchesDestination, type SelectedLocation } from '../../../packages/contracts/src/locations';
import { selectLocation } from './location-api';

export function exactStartingPoint(location: SelectedLocation | null): boolean {
  return !!location && !(location.source === 'search' && location.types.some(type => ['locality', 'postal_town', 'country', 'administrative_area_level_1', 'administrative_area_level_2', 'administrative_area_level_3'].includes(type)));
}

export async function resolveStartingCity(start: SelectedLocation, signal: AbortSignal): Promise<SelectedLocation> {
  if (!exactStartingPoint(start)) throw new Error('Choose an exact address, hotel, station, current location or map pin as your starting point. A city centre is not used automatically.');
  if (!start.city || start.receiptStatus === 'local') throw new Error('Your starting point is preserved, but its city could not be verified. Retry address lookup or choose a city manually.');
  const city = await selectLocation(start.city.placeId, crypto.randomUUID(), true, signal);
  if (!startMatchesDestination(start, city) || !city.timezone) throw new Error('Google could not confirm the starting city and its timezone consistently. Your starting point is preserved. Choose a city manually.');
  return city;
}
