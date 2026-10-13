import type { SelectedLocation } from '../../../packages/contracts/src/locations';
import type { TravelMode } from '../../../packages/contracts/src/api';
export function mapsNavigation(from: SelectedLocation, to: SelectedLocation, mode: TravelMode = 'DRIVE') {
  const query = new URLSearchParams({ api: '1', origin: `${from.coordinates.latitude},${from.coordinates.longitude}`, destination: `${to.coordinates.latitude},${to.coordinates.longitude}`, travelmode: mode === 'WALK' ? 'walking' : mode === 'BICYCLE' ? 'bicycling' : 'driving' });
  if (from.source === 'search' && from.placeId) query.set('origin_place_id', from.placeId);
  if (to.source === 'search' && to.placeId) query.set('destination_place_id', to.placeId);
  return `https://www.google.com/maps/dir/?${query}`;
}
