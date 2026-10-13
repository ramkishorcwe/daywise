import { z } from 'zod';
import { coordinateSchema, type Coordinate } from '../../contracts/src/api';
import { providerPlaceId, suggestionsSchema, type LocationData } from '../../contracts/src/locations';
import { ProviderError } from './google';

export interface LocationProvider {
  autocomplete(input: string, sessionToken: string, citiesOnly: boolean, bias?: Coordinate, signal?: AbortSignal): Promise<z.infer<typeof suggestionsSchema>>;
  details(placeId: string, sessionToken: string, signal?: AbortSignal): Promise<{ placeId: string; name: string; address: string; coordinates: Coordinate; types: string[]; attributions?: LocationData['attributions'] }>;
  reverse(coordinates: Coordinate, signal?: AbortSignal): Promise<Omit<LocationData, 'source'>>;
  timezone(coordinates: Coordinate, signal?: AbortSignal): Promise<string>;
}
const component = z.object({ long_name: z.string(), short_name: z.string(), types: z.array(z.string()) });
const geocodeSchema = z.object({ status: z.string(), results: z.array(z.object({ place_id: providerPlaceId, formatted_address: z.string().min(1).max(1000), types: z.array(z.string()), address_components: z.array(component) })).optional() });
export class GoogleLocations implements LocationProvider {
  constructor(private placesKey: string, private geocodingKey: string, private timezoneKey: string, private request: typeof fetch = fetch, private clock = () => Date.now()) {}
  private async json(url: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
    let response: Response;
    try { response = await this.request(url, { ...init, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) }); }
    catch { throw new ProviderError('UNAVAILABLE', 'Google location lookup timed out or is unavailable. Retry.'); }
    if (!response.ok) throw new ProviderError(response.status === 429 ? 'QUOTA' : 'UNAVAILABLE', 'Google rejected location lookup. Check API enablement, billing and key restrictions.');
    try { return await response.json(); } catch { throw new ProviderError('INVALID_RESPONSE', 'Google returned an unreadable location response.'); }
  }
  async autocomplete(input: string, sessionToken: string, citiesOnly: boolean, bias?: Coordinate, signal?: AbortSignal) {
    if (!this.placesKey) throw new ProviderError('NOT_CONFIGURED', 'Configure GOOGLE_PLACES_API_KEY and enable Places API (New).');
    const schema = z.object({ suggestions: z.array(z.object({ placePrediction: z.object({ placeId: providerPlaceId, text: z.object({ text: z.string().min(1).max(1000) }) }).optional() })).max(5).optional() });
    const raw = await this.json('https://places.googleapis.com/v1/places:autocomplete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.placesKey, 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text' }, body: JSON.stringify({ input, sessionToken, languageCode: 'en', ...(citiesOnly ? { includedPrimaryTypes: ['(cities)'] } : {}), ...(bias ? { locationBias: { circle: { center: bias, radius: 50000 } } } : {}) }) }, signal);
    const parsed = schema.safeParse(raw); if (!parsed.success) throw new ProviderError('INVALID_RESPONSE', 'Google autocomplete response was invalid.');
    return suggestionsSchema.parse({ provider: 'google', suggestions: (parsed.data.suggestions ?? []).flatMap(row => row.placePrediction ? [{ placeId: row.placePrediction.placeId, text: row.placePrediction.text.text }] : []) });
  }
  async details(placeId: string, sessionToken: string, signal?: AbortSignal) {
    if (!this.placesKey) throw new ProviderError('NOT_CONFIGURED', 'Configure GOOGLE_PLACES_API_KEY and enable Places API (New).');
    const schema = z.object({ id: providerPlaceId, displayName: z.object({ text: z.string().min(1).max(300) }), formattedAddress: z.string().min(1).max(1000), location: coordinateSchema, types: z.array(z.string()).max(50), attributions: z.array(z.object({ provider: z.string().min(1).max(300), providerUri: z.url().refine(value => /^https?:\/\//.test(value)).optional() })).max(30).optional() });
    const query = new URLSearchParams({ sessionToken, languageCode: 'en' });
    const raw = await this.json(`https://places.googleapis.com/v1/places/${encodeURIComponent(providerPlaceId.parse(placeId))}?${query}`, { headers: { 'X-Goog-Api-Key': this.placesKey, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,types,attributions' } }, signal);
    const parsed = schema.safeParse(raw); if (!parsed.success || parsed.data.id !== placeId) throw new ProviderError('INVALID_RESPONSE', 'Selected Google place has no valid address or coordinates.');
    return { placeId: parsed.data.id, name: parsed.data.displayName.text, address: parsed.data.formattedAddress, coordinates: parsed.data.location, types: parsed.data.types, ...(parsed.data.attributions ? { attributions: parsed.data.attributions } : {}) };
  }
  async reverse(coordinates: Coordinate, signal?: AbortSignal) {
    if (!this.geocodingKey) throw new ProviderError('NOT_CONFIGURED', 'Configure GOOGLE_GEOCODING_API_KEY and enable Geocoding API.');
    const point = coordinateSchema.parse(coordinates), query = new URLSearchParams({ latlng: `${point.latitude},${point.longitude}`, language: 'en', key: this.geocodingKey });
    const parsed = geocodeSchema.safeParse(await this.json(`https://maps.googleapis.com/maps/api/geocode/json?${query}`, {}, signal));
    if (!parsed.success) throw new ProviderError('INVALID_RESPONSE', 'Google reverse-geocoding response was invalid.');
    if (parsed.data.status !== 'OK') throw new ProviderError(parsed.data.status === 'OVER_QUERY_LIMIT' ? 'QUOTA' : 'UNAVAILABLE', parsed.data.status === 'ZERO_RESULTS' ? 'No address was found for this point. Choose another location.' : 'Reverse geocoding failed. Check Geocoding API, billing and server key restrictions.');
    const result = parsed.data.results?.[0]; if (!result) throw new ProviderError('INVALID_RESPONSE', 'Google returned no address for this point.');
    const locality = parsed.data.results?.find(row => row.types.includes('locality')) ?? parsed.data.results?.find(row => row.types.includes('postal_town')) ?? parsed.data.results?.find(row => row.types.includes('administrative_area_level_3'));
    const country = locality?.address_components.find(row => row.types.includes('country'))?.short_name;
    const name = locality?.address_components.find(row => row.types.some(type => ['locality', 'postal_town', 'administrative_area_level_3'].includes(type)))?.long_name;
    const part = (types: string[]) => result.address_components.find(row => row.types.some(type => types.includes(type)))?.long_name ?? null;
    return { provider: 'google' as const, placeId: result.place_id, name: result.formatted_address.slice(0, 300), address: result.formatted_address, addressStatus: 'resolved' as const, coordinates: point, types: result.types, city: locality && name && country?.length === 2 ? { placeId: locality.place_id, name, countryCode: country } : null, locality: part(['sublocality', 'neighborhood', 'locality']), state: part(['administrative_area_level_1']), country: part(['country']), fetchedAt: new Date(this.clock()).toISOString() };
  }
  async timezone(coordinates: Coordinate, signal?: AbortSignal) {
    if (!this.timezoneKey) throw new ProviderError('NOT_CONFIGURED', 'Configure GOOGLE_TIME_ZONE_API_KEY and enable Time Zone API to schedule in the destination’s timezone.');
    const point = coordinateSchema.parse(coordinates), query = new URLSearchParams({ location: `${point.latitude},${point.longitude}`, timestamp: String(Math.floor(this.clock() / 1000)), key: this.timezoneKey });
    const schema = z.object({ status: z.string(), timeZoneId: z.string().optional() });
    const parsed = schema.safeParse(await this.json(`https://maps.googleapis.com/maps/api/timezone/json?${query}`, {}, signal));
    if (!parsed.success || parsed.data.status !== 'OK' || !parsed.data.timeZoneId) throw new ProviderError('UNAVAILABLE', 'Destination timezone could not be resolved. Check Time Zone API configuration and retry.');
    try { new Intl.DateTimeFormat('en', { timeZone: parsed.data.timeZoneId }); } catch { throw new ProviderError('INVALID_RESPONSE', 'Google returned an unsupported timezone.'); }
    return parsed.data.timeZoneId;
  }
}
