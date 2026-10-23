import type { CityViewport, SelectedLocation } from '../../contracts/src/locations';

// A Google viewport is a city map area, not a legal municipal boundary. It keeps
// separately named municipal localities together without accepting country-wide results.
export function withinChosenCity(location: Pick<SelectedLocation, 'city' | 'coordinates'>, destination: Pick<SelectedLocation, 'city'>, viewport: CityViewport | null): boolean {
  if (!location.city || !destination.city || location.city.countryCode !== destination.city.countryCode) return false;
  if (!viewport) return location.city.placeId === destination.city.placeId;
  const { latitude, longitude } = location.coordinates, { low, high } = viewport;
  const inLongitude = low.longitude < high.longitude ? longitude >= low.longitude && longitude <= high.longitude : longitude >= low.longitude || longitude <= high.longitude;
  return latitude >= low.latitude && latitude <= high.latitude && inLongitude;
}
