import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { GeminiFestivalSearch } from '../packages/data-adapters/src/festival-search';
import { festivalSearchResultSchema, type FestivalSearchInput, type FestivalSearchResult } from '../packages/contracts/src/festival-search';
import { createServer } from '../apps/api/src/server';
import { LocalTripStore } from '../apps/api/src/store';
import { localAuthenticator } from '../apps/api/src/auth';
import { GeminiInterpreter } from '../packages/data-adapters/src/gemini';
import { ProviderGuard } from '../apps/api/src/provider-guard';
const input: FestivalSearchInput = { city: { placeId: 'provider-city-identity', name: 'Any destination', countryCode: 'GB' }, state: 'Provider region', month: '2027-04' };
const event = { name: 'Local spring procession', city: input.city.name, countryCode: 'GB', startsOn: '2027-04-09', endsOn: '2027-04-10', area: 'Published event area', sourceUrl: 'https://official.example/events/2027' };
const result = (): FestivalSearchResult => ({ city: input.city, month: input.month, checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), events: [event], sources: [{ title: 'Test-only organiser source', url: event.sourceUrl }], incomplete: false, searchSuggestions: '<div>Google search suggestions</div>' });
const grounded = (events: unknown[] = [event]) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ events }) }] }, groundingMetadata: { webSearchQueries: ['city festivals April 2027'], groundingChunks: [{ web: { uri: event.sourceUrl, title: 'Organiser dates' } }], searchEntryPoint: { renderedContent: '<div>Google Search</div>' } } }] });
const provider = (raw = grounded(), status = 200) => { const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(raw), { status })); return { request, search: new GeminiFestivalSearch('server-only-test-key', 'test-model', request) }; };
describe('source-backed local festival provider', () => {
  it('uses the requested city, state and month with actual search grounding and no browser key', async () => {
    const p = provider(), value = await p.search.search(input);
    expect(value.events).toEqual([event]); expect(value.city).toEqual(input.city);
    const init = p.request.mock.calls[0][1]!, body = JSON.parse(init.body as string);
    expect(body.tools).toEqual([{ googleSearch: {} }]); expect(JSON.parse(body.contents[0].parts[0].text)).toEqual(input);
    expect(init.headers).toMatchObject({ 'x-goog-api-key': 'server-only-test-key' });
    expect(value.searchSuggestions).toContain('Google Search'); expect(Date.parse(value.expiresAt) - Date.parse(value.checkedAt)).toBe(3600000);
  });
  it('drops other cities/countries, wrong months, invalid dates and unsupported URLs without inventing replacements', async () => {
    const p = provider(grounded([event, { ...event, city: 'Another city' }, { ...event, countryCode: 'IN' }, { ...event, startsOn: '2028-04-09', endsOn: '2028-04-10' }, { ...event, startsOn: '2027-04-31' }, { ...event, sourceUrl: 'https://invented.example/date' }]));
    const value = await p.search.search(input); expect(value.events).toEqual([event]); expect(value.incomplete).toBe(true);
  });
  it('requires search metadata, even if an ungrounded model returns plausible dates', async () => {
    const raw = grounded(); raw.candidates[0].groundingMetadata.groundingChunks = [];
    await expect(provider(raw).search.search(input)).rejects.toThrow('source evidence');
  });
  it('uses a Google citation redirect only when the cited segment actually contains this event and date', async () => {
    const raw = grounded() as any; const uri = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/test-only';
    raw.candidates[0].groundingMetadata.groundingChunks[0].web.uri = uri;
    raw.candidates[0].groundingMetadata.groundingSupports = [{ segment: { text: `${event.name} ${event.startsOn}` }, groundingChunkIndices: [0] }];
    expect((await provider(raw).search.search(input)).events[0].sourceUrl).toBe(uri);
    raw.candidates[0].groundingMetadata.groundingSupports[0].segment.text = 'Some unrelated event';
    await expect(provider(raw).search.search(input)).rejects.toThrow('source evidence');
  });
  it('allows a grounded empty search without claiming complete coverage', async () => { const value = await provider(grounded([])).search.search(input); expect(value.events).toEqual([]); expect(value.sources).toHaveLength(1); });
  it('keeps a published multi-month festival when its dates overlap the requested month', async () => {
    const longEvent = { ...event, startsOn: '2027-02-01', endsOn: '2027-05-01' };
    expect((await provider(grounded([longEvent])).search.search(input)).events).toEqual([longEvent]);
  });
  it('exposes quota and provider failures as an advisory failure, with no retry or fallback data', async () => {
    for (const status of [429, 503, 400]) { const p = provider(grounded(), status); await expect(p.search.search(input)).rejects.toThrow(status === 429 ? 'quota' : 'unavailable'); expect(p.request).toHaveBeenCalledTimes(1); }
  });
  it('rejects malformed model output rather than presenting fictional events', async () => { const raw = grounded(); raw.candidates[0].content.parts[0].text = 'not JSON'; await expect(provider(raw).search.search(input)).rejects.toThrow('source evidence'); });
});
const servers: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => s.close())); });
async function server(extra: Partial<Parameters<typeof createServer>[0]> = {}) {
  const auth = localAuthenticator(randomBytes(32)), app = await createServer({ auth, store: new LocalTripStore(), fixtures: false, webOrigin: 'http://127.0.0.1:5174', interpreter: new GeminiInterpreter('test-key', 'test-model'), aiDailyLimit: 2, ...extra }); servers.push(app);
  const headers = { authorization: `Bearer ${auth.issue!().token}` };
  return { app, post: (payload = input) => app.inject({ method: 'POST', url: '/api/festivals/search', headers, payload }) };
}
describe('authenticated festival lookup and shared AI allowance', () => {
  it('retains reserved AI calls for explicit planning in both local and hosted counters', async () => {
    const guard = new ProviderGuard(5, () => Date.now(), 'ai');
    for (let i = 0; i < 3; i++) guard.consume(2);
    expect(() => guard.consume(2)).toThrow('allowance');
    expect(() => { guard.consume(); guard.consume(); }).not.toThrow();
    const consume = vi.fn(async () => {}), hosted = new ProviderGuard(100, () => Date.now(), 'ai', { consume, claim: async () => {} });
    await hosted.consume(10); await hosted.consume(); expect(consume.mock.calls).toEqual([['ai', 90], ['ai', 100]]);
  });
  it('coalesces concurrent requests and caches the city/month instead of spending AI allowance for every day', async () => {
    let finish!: (value: FestivalSearchResult) => void;
    const search = vi.fn(() => new Promise<FestivalSearchResult>(resolve => { finish = resolve; }));
    const s = await server({ festivalSearch: { search } });
    const a = s.post(), b = s.post(); const pending = Promise.all([a, b]);
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1)); finish(result());
    const values = await pending; expect(values.map(r => r.statusCode)).toEqual([200, 200]);
    expect((await s.post()).statusCode).toBe(200); expect(search).toHaveBeenCalledTimes(1);
    const otherMonth = { ...input, month: '2027-05' }; search.mockResolvedValueOnce({ ...result(), month: otherMonth.month });
    expect((await s.post(otherMonth)).statusCode).toBe(200);
    expect((await s.post({ ...input, month: '2027-06' })).statusCode).toBe(429); expect(search).toHaveBeenCalledTimes(2);
  });
  it('requires authentication and a valid country, city identity and month', async () => {
    const search = vi.fn(async () => result()), s = await server({ festivalSearch: { search } });
    expect((await s.app.inject({ method: 'POST', url: '/api/festivals/search', payload: input })).statusCode).toBe(401);
    expect((await s.post({ ...input, month: '2027-13' })).statusCode).toBe(400);
    expect(search).not.toHaveBeenCalled();
  });
  it('does not cache failures or mismatched results, and preserves all unrelated endpoints', async () => {
    const search = vi.fn(async () => ({ ...result(), city: { ...input.city, name: 'Wrong city' } })), s = await server({ festivalSearch: { search } });
    expect((await s.post()).statusCode).toBe(502); expect((await s.app.inject({ url: '/api/health' })).statusCode).toBe(200);
    search.mockResolvedValueOnce(result()); expect((await s.post()).statusCode).toBe(200); expect(search).toHaveBeenCalledTimes(2);
  });
  it('returns an actionable configuration error without requiring a new key for trip planning', async () => {
    const s = await server(); expect((await s.post()).statusCode).toBe(503);
    expect((await s.app.inject({ url: '/api/locations/config' })).json().festivalSearch).toBe(false);
  });
});
