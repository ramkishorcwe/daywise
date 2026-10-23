import { z } from 'zod';
import { coordinateSchema, type Coordinate } from '../../contracts/src/api';
import { providerPlaceId, cityViewportSchema, type CityViewport } from '../../contracts/src/locations';
import type { GuideFacts, GuidePreferences } from '../../contracts/src/guide';
import { zonedTime } from '../../domain/src/time';
import { ProviderError } from './google';
import { placePhotoSchema, type PlacePhoto } from '../../contracts/src/place-photo';

const daySchema = z.object({ year: z.number().int(), month: z.number().int(), day: z.number().int() });
const point = z.object({ day: z.number().int().min(0).max(6).default(0), hour: z.number().int().min(0).max(23).default(0), minute: z.number().int().min(0).max(59).default(0), date: daySchema.optional(), truncated: z.boolean().optional() });
const hoursSchema = z.object({ periods: z.array(z.object({ open: point, close: point.optional() })).max(30).optional(), weekdayDescriptions: z.array(z.string()).optional() });
export const guidePlaceSchema = z.object({ id: providerPlaceId, displayName: z.object({ text: z.string().min(1).max(300) }), formattedAddress: z.string().min(1).max(1000), location: coordinateSchema, types: z.array(z.string()), businessStatus: z.string().optional(), priceLevel: z.string().optional(), rating: z.number().optional(), userRatingCount: z.number().int().optional(), currentOpeningHours: hoursSchema.optional(), regularOpeningHours: hoursSchema.optional(), accessibilityOptions: z.object({ wheelchairAccessibleEntrance: z.boolean().optional() }).optional(), goodForChildren: z.boolean().optional(), servesVegetarianFood: z.boolean().optional(), servesLunch: z.boolean().optional(), websiteUri: z.url().optional(), googleMapsUri: z.url().optional(), editorialSummary: z.object({ text: z.string().max(2500) }).optional(), containingPlaces: z.array(z.object({ id: providerPlaceId })).max(10).optional(), attributions: z.array(z.object({ provider: z.string(), providerUri: z.url().optional() })).optional() });
export type GuidePlace = z.infer<typeof guidePlaceSchema>;
export interface GuidePlacesProvider { discover(city: string, center: Coordinate, preferences: GuidePreferences, beforeAdditionalSearch?: () => void | Promise<void>): Promise<GuidePlace[]>; facts(placeId: string): Promise<GuidePlace>; cityViewport?(placeId: string): Promise<CityViewport | null>; nearbyRestaurants?(center: Coordinate, radiusMeters: number): Promise<GuidePlace[]>; photo?(placeId: string, beforeMedia: () => Promise<void>): Promise<PlacePhoto> }
const fields = ['id', 'displayName', 'formattedAddress', 'location', 'types', 'businessStatus', 'priceLevel', 'rating', 'userRatingCount', 'currentOpeningHours', 'regularOpeningHours', 'accessibilityOptions', 'goodForChildren', 'servesVegetarianFood', 'servesLunch', 'websiteUri', 'googleMapsUri', 'editorialSummary', 'containingPlaces', 'attributions'];
export class GoogleGuidePlaces implements GuidePlacesProvider {
  constructor(private key: string, private request: typeof fetch = fetch) {}
  async cityViewport(placeId: string): Promise<CityViewport | null> {
    const id = providerPlaceId.parse(placeId);
    const raw = await this.json(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=en`, { headers: { 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': 'id,viewport' } });
    const parsed = z.object({ id: providerPlaceId, viewport: cityViewportSchema.optional() }).safeParse(raw);
    if (!parsed.success || parsed.data.id !== id) throw new ProviderError('INVALID_RESPONSE', 'Google could not verify the selected city map area. Retry the category lookup.');
    return parsed.data.viewport ?? null;
  }
  async photo(placeId: string, beforeMedia: () => Promise<void>): Promise<PlacePhoto> {
    const id = providerPlaceId.parse(placeId);
    const raw = await this.json(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, { headers: { 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': 'photos' } });
    const metadata = z.object({ photos: z.array(z.object({ name: z.string().max(10000), authorAttributions: z.array(z.object({ displayName: z.string().min(1).max(300), uri: z.url().optional() })).max(20).optional() })).max(10).optional() }).safeParse(raw);
    if (!metadata.success) throw new ProviderError('INVALID_RESPONSE', 'Google returned invalid place photo information.');
    const photo = metadata.data.photos?.[0];
    if (!photo) return { photo: null };
    if (!photo.name.startsWith(`places/${id}/photos/`) || !/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photo.name)) throw new ProviderError('INVALID_RESPONSE', 'Google returned an invalid photo reference.');
    await beforeMedia();
    const media = await this.json(`https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=720&maxHeightPx=480&skipHttpRedirect=true`, { headers: { 'X-Goog-Api-Key': this.key } });
    const uri = z.object({ photoUri: z.string() }).safeParse(media);
    const result = placePhotoSchema.safeParse({ photo: { uri: uri.success ? uri.data.photoUri : '', authors: (photo.authorAttributions ?? []).map(author => ({ name: author.displayName, uri: author.uri ?? null })) } });
    if (!result.success) throw new ProviderError('INVALID_RESPONSE', 'Google returned an invalid photo image.');
    return result.data;
  }
  private async json(url: string, init: RequestInit) {
    let response: Response; try { response = await this.request(url, { ...init, signal: AbortSignal.timeout(10000) }); } catch { throw new ProviderError('UNAVAILABLE', 'Place discovery timed out. Retry; no sample attractions were substituted.'); }
    if (!response.ok) throw new ProviderError(response.status === 429 ? 'QUOTA' : 'UNAVAILABLE', 'Google rejected guide discovery. Check Places API (New), billing and the server key restrictions.');
    try { return await response.json(); } catch { throw new ProviderError('INVALID_RESPONSE', 'Google returned unreadable attraction information.'); }
  }
  async discover(city: string, center: Coordinate, p: GuidePreferences, beforeAdditionalSearch?: () => void | Promise<void>) {
    if (!this.key) throw new ProviderError('NOT_CONFIGURED', 'Configure the Places API (New) server key for discovery.');
    const terms = { history: 'historic landmarks', forts: 'forts and castles', palaces: 'palaces', culture: 'cultural attractions', temples: 'temples and places of worship', shopping: 'markets and shopping', nature: 'nature parks and lakes', gardens: 'gardens', museums: 'museums', food: 'restaurants and cafes', nightlife: 'night clubs and bars', hidden_gems: 'lesser known attractions' };
    const queries = p.interests.length ? [...new Set(p.interests)].map(i => `${terms[i]} in ${city}`) : [`places to visit in ${city}`];
    const results: GuidePlace[][] = [];
    // Separate searches prevent a combined museums/food/nightlife query becoming only restaurants.
    // Three concurrent requests at most; every additional query is counted by the caller's guard.
    for (let offset = 0; offset < queries.length; offset += 3) {
      const batch = await Promise.all(queries.slice(offset, offset + 3).map(async (textQuery, i) => {
        if (offset + i > 0) await beforeAdditionalSearch?.();
        const raw = await this.json('https://places.googleapis.com/v1/places:searchText', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': fields.map(f => `places.${f}`).join(',') }, body: JSON.stringify({ textQuery, pageSize: 12, languageCode: 'en', locationBias: { circle: { center, radius: 40000 } } }) });
        const result = z.object({ places: z.array(z.unknown()).max(20).optional() }).safeParse(raw);
        if (!result.success) throw new ProviderError('INVALID_RESPONSE', 'Google discovery returned invalid results.');
        return (result.data.places ?? []).flatMap(item => { const parsed = guidePlaceSchema.safeParse(item); return parsed.success && !['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'].includes(parsed.data.businessStatus ?? '') ? [parsed.data] : []; });
      }));
      results.push(...batch);
    }
    const seen = new Set<string>();
    return results.flat().filter(place => { if (seen.has(place.id)) return false; seen.add(place.id); return true; });
  }
  async facts(placeId: string) {
    const raw = await this.json(`https://places.googleapis.com/v1/places/${encodeURIComponent(providerPlaceId.parse(placeId))}?languageCode=en`, { headers: { 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': fields.join(',') } });
    const parsed = guidePlaceSchema.safeParse(raw);
    if (!parsed.success || parsed.data.id !== placeId) throw new ProviderError('INVALID_RESPONSE', 'The selected place has incomplete guide information.');
    return parsed.data;
  }
  async nearbyRestaurants(center: Coordinate, radiusMeters: number) {
    if (!this.key) throw new ProviderError('NOT_CONFIGURED', 'Configure the Places API (New) server key for restaurant suggestions.');
    const raw = await this.json('https://places.googleapis.com/v1/places:searchNearby', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': fields.map(f => `places.${f}`).join(',') }, body: JSON.stringify({ includedTypes: ['restaurant'], maxResultCount: 8, rankPreference: 'DISTANCE', languageCode: 'en', locationRestriction: { circle: { center: coordinateSchema.parse(center), radius: z.number().min(100).max(3000).parse(radiusMeters) } } }) });
    const result = z.object({ places: z.array(z.unknown()).max(20).optional() }).safeParse(raw);
    if (!result.success) throw new ProviderError('INVALID_RESPONSE', 'Google returned incomplete nearby restaurant results.');
    const seen = new Set<string>();
    return (result.data.places ?? []).flatMap(item => {
      const place = guidePlaceSchema.safeParse(item);
      if (!place.success || seen.has(place.data.id) || !place.data.types.some(t => t === 'restaurant' || t.endsWith('_restaurant')) || ['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'].includes(place.data.businessStatus ?? '')) return [];
      seen.add(place.data.id); return [place.data];
    });
  }
}
const addDays = (date: string, count: number) => new Date(Date.parse(`${date}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
const dateText = (d: z.infer<typeof daySchema>) => `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
export function openingWindows(place: GuidePlace, date: string, timezone: string, now = Date.now()): GuideFacts['hours'] {
  const descriptions = place.currentOpeningHours?.weekdayDescriptions ?? place.regularOpeningHours?.weekdayDescriptions ?? [];
  if (['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'].includes(place.businessStatus ?? '')) return { status: 'closed', windows: [], description: descriptions };
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  const part = (name: string) => parts.find(p => p.type === name)!.value, today = `${part('year')}-${part('month')}-${part('day')}`;
  const useCurrent = date >= today && date <= addDays(today, 6) && !!place.currentOpeningHours?.periods;
  const periods = useCurrent ? place.currentOpeningHours!.periods : place.regularOpeningHours?.periods;
  if (!periods) return { status: 'unknown', windows: [], description: descriptions };
  const windows: GuideFacts['hours']['windows'] = []; let invalid = false;
  try {
    const begin = zonedTime(date, '00:00', timezone), finish = zonedTime(addDays(date, 1), '00:00', timezone);
    for (const period of periods) {
      if (!period.close && period.open.day === 0 && period.open.hour === 0 && period.open.minute === 0) { windows.push({ opens: new Date(begin).toISOString(), closes: new Date(finish).toISOString() }); continue; }
      if (!period.close) { invalid = true; continue; }
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const openDay = useCurrent && period.open.date ? dateText(period.open.date) : addDays(date, -((weekday - period.open.day + 7) % 7));
      let closeDay = useCurrent && period.close.date ? dateText(period.close.date) : addDays(openDay, (period.close.day - period.open.day + 7) % 7);
      const clock = (p: z.infer<typeof point>) => `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
      const opens = zonedTime(openDay, clock(period.open), timezone); let closes = zonedTime(closeDay, clock(period.close), timezone);
      if (closes <= opens && !period.close.date) { closeDay = addDays(closeDay, 7); closes = zonedTime(closeDay, clock(period.close), timezone); }
      if (closes > begin && opens < finish) windows.push({ opens: new Date(Math.max(opens, begin)).toISOString(), closes: new Date(Math.min(closes, finish)).toISOString() });
    }
  } catch { invalid = true; }
  if (invalid) return { status: 'unknown', windows: [], description: descriptions };
  return { status: windows.length ? useCurrent ? 'date_specific' : 'usual' : 'closed', windows: windows.sort((a, b) => a.opens.localeCompare(b.opens)), description: descriptions };
}
export function factsFor(place: GuidePlace, date: string, timezone: string): GuideFacts {
  const types = place.types.join(' ').toLowerCase();
  const dining = /restaurant|cafe|\bbar\b|night_club/.test(types), landmark = /museum|historical|cultural/.test(types);
  const text = `${types} ${dining && !landmark ? '' : place.displayName.text}`.toLowerCase(), categories: GuideFacts['categories'] = [];
  const rules: Array<[GuideFacts['categories'][number], RegExp]> = [['forts', /\bfort\b|castle/], ['palaces', /palace/], ['history', /historical|monument|\bfort\b|castle|palace|museum/], ['culture', /tourist_attraction|cultural|heritage|museum|art_gallery|performing_arts/], ['temples', /temple|place_of_worship/], ['shopping', /market|bazaar|shopping|\bstore\b|_store/], ['nature', /\bpark\b|natural|lake|wildlife|garden/], ['gardens', /garden|\bpark\b/], ['museums', /museum/], ['food', /restaurant|cafe|food/], ['nightlife', /night_club|\bbar\b/]];
  for (const [category, pattern] of rules) if (category === 'museums' ? place.types.includes('museum') : category === 'nightlife' ? place.types.some(t => t === 'night_club' || t === 'bar' || t.endsWith('_bar')) : pattern.test(text)) categories.push(category);
  const environment = /museum|art_gallery/.test(place.types.join(' ')) ? 'indoor' : /\bpark\b|garden|natural_feature/.test(place.types.join(' ')) ? 'outdoor' : 'unknown';
  return { ...(place.priceLevel ? { priceLevel: place.priceLevel } : {}), mealServices: { lunch: place.servesLunch ?? null }, containingPlaceIds: place.containingPlaces?.map(p => p.id) ?? [], categories, environment, rating: place.rating ?? null, reviews: place.userRatingCount ?? null, hours: openingWindows(place, date, timezone), admission: null, accessible: place.accessibilityOptions?.wheelchairAccessibleEntrance ?? null, goodForChildren: place.goodForChildren ?? null, vegetarianOptions: place.servesVegetarianFood ?? null, website: place.websiteUri ?? null, providerUri: place.googleMapsUri ?? null, description: place.editorialSummary?.text ?? null, checkedAt: new Date().toISOString() };
}
