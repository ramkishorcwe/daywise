import { festivalSearchResultSchema, type FestivalSearchInput, type FestivalSearchResult } from '../../../packages/contracts/src/festival-search';
import { postLocation } from './location-api';
const cache = new Map<string, { expires: number; promise: Promise<FestivalSearchResult> }>();
export const festivalSearchKey = (input: FestivalSearchInput) => JSON.stringify([input.city.countryCode, input.city.placeId, input.city.name, input.state ?? '', input.month]);
export const clearFestivalSearch = (input: FestivalSearchInput) => cache.delete(festivalSearchKey(input));
export function searchLocalFestivals(input: FestivalSearchInput, refresh = false): Promise<FestivalSearchResult> {
  const key = festivalSearchKey(input), previous = cache.get(key);
  if (!refresh && previous && previous.expires > Date.now()) return previous.promise;
  if (cache.size >= 12) cache.delete(cache.keys().next().value!);
  const record = { expires: Date.now() + 60000, promise: Promise.resolve(null!) as Promise<FestivalSearchResult> };
  record.promise = postLocation('/festivals/search', input).then(raw => {
    const result = festivalSearchResultSchema.parse(raw);
    if (result.city.placeId !== input.city.placeId || result.city.name !== input.city.name || result.city.countryCode !== input.city.countryCode || result.month !== input.month) throw new Error('Festival results did not match the selected destination. Retry the check.');
    record.expires = Date.parse(result.expiresAt); return result;
  });
  cache.set(key, record); return record.promise;
}
