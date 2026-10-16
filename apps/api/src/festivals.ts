import type { FastifyInstance, FastifyRequest } from 'fastify';
import { festivalSearchInputSchema, festivalSearchResultSchema, type FestivalSearchResult } from '../../../packages/contracts/src/festival-search';
import type { FestivalSearchProvider } from '../../../packages/data-adapters/src/festival-search';
import { ApiError } from './errors';

export function registerFestivalRoutes(app: FastifyInstance, provider: FestivalSearchProvider | undefined, reserveAI: () => void | Promise<void>, owner: (r: FastifyRequest) => string) {
  // Public city/month evidence only. No user locations, coordinates or accepted trips are cached here.
  const cache = new Map<string, FestivalSearchResult>(), pending = new Map<string, Promise<FestivalSearchResult>>();
  app.addHook('onClose', async () => { cache.clear(); pending.clear(); });
  app.post('/api/festivals/search', { config: { rateLimit: { max: 6, timeWindow: '1 minute', keyGenerator: r => owner(r) ?? r.ip } } }, async request => {
    const input = festivalSearchInputSchema.parse(request.body);
    if (!provider) throw new ApiError(503, 'FESTIVAL_SEARCH_NOT_CONFIGURED', 'Live local festival search is unavailable. Configure a server Gemini key and a Google Search compatible model. Trip planning is still available.');
    const year = Number(input.month.slice(0, 4)), now = Date.now();
    if (year < new Date(now).getUTCFullYear() - 1 || year > new Date(now).getUTCFullYear() + 4) throw new ApiError(422, 'FESTIVAL_SEARCH_DATE', 'Local festival search supports last year through the next four years. Dates further ahead may not be published.');
    const key = JSON.stringify([input.city.countryCode, input.city.placeId, input.city.name.normalize('NFKC').trim().toLowerCase(), input.state ?? '', input.month]);
    for (const [k, v] of cache) if (Date.parse(v.expiresAt) <= now) cache.delete(k);
    const saved = cache.get(key); if (saved) return saved;
    const work = pending.get(key); if (work) return work;
    if (pending.size >= 10) throw new ApiError(429, 'FESTIVAL_SEARCH_BUSY', 'Local event searches are busy. Retry shortly; trip planning is still available.');
    const lookup = Promise.resolve().then(async () => {
      try { await reserveAI(); } catch (error) { if (error instanceof ApiError && error.code === 'AI_BUDGET_LIMIT') throw new ApiError(429, 'FESTIVAL_AI_ALLOWANCE', 'Festival search is paused at the AI allowance limit. The app reserves capacity for itinerary planning. Retry after the daily reset; your saved trip is unchanged.'); throw error; }
      const result = festivalSearchResultSchema.parse(await provider.search(input));
      if (result.city.placeId !== input.city.placeId || result.city.name !== input.city.name || result.city.countryCode !== input.city.countryCode || result.month !== input.month) throw new ApiError(502, 'FESTIVAL_SEARCH_MISMATCH', 'Local festival results did not match the selected city and month. Retry; your itinerary is unchanged.');
      if (cache.size >= 80) cache.delete(cache.keys().next().value!);
      cache.set(key, result); return result;
    }).finally(() => pending.delete(key));
    pending.set(key, lookup); return lookup;
  });
}
