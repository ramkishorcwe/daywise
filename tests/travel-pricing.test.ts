import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { guidePreferencesSchema, type GuideCandidate, type GuideCost } from '../packages/contracts/src/guide';
import { admissionFor, convertCost, groupCost, mealAllowance, pricedCandidate, roundedPrice, visitorCategory } from '../packages/domain/src/travel-pricing';
import { budgetFor } from '../packages/domain/src/guide-planner';
import { FrankfurterRates } from '../packages/data-adapters/src/exchange-rates';
import { stopPriceLines, mapStopPrice } from '../apps/web/src/stop-price';
const now = Date.parse('2026-10-14T12:00:00Z');
const prefs = (extra = {}) => guidePreferencesSchema.parse({ adults: 2, childAges: [], groupBudget: null, currency: 'INR', dietaryRules: [], ...extra });
const quote = { rate: 0.01, date: '2026-10-14', sourceUrl: 'https://api.frankfurter.dev/v2/rate/inr/usd' };
const rates = { quote: vi.fn(async () => quote) };
// Provider-shaped evidence belongs only to this test, never production discovery.
function candidate(name = 'Nahargarh Fort'): GuideCandidate {
  return { location: { id: randomUUID(), placeId: 'provider-real-venue', provider: 'google', source: 'search', name, address: 'Test address', city: { name: 'Jaipur', countryCode: 'IN', placeId: 'provider-real-city' }, coordinates: { latitude: 26, longitude: 75 }, types: ['tourist_attraction'], fetchedAt: new Date(now).toISOString(), expiresAt: new Date(now + 1800000).toISOString(), persistence: 'memory_only' }, suggestedMinutes: 60, score: 1, reasons: [], facts: { categories: ['forts'], environment: 'outdoor', rating: null, reviews: null, hours: { status: 'unknown', windows: [], description: [] }, admission: null, accessible: null, goodForChildren: null, vegetarianOptions: null, website: null, providerUri: null, description: null, checkedAt: new Date(now).toISOString() } };
}
const stop = (c: GuideCandidate) => ({ locationId: c.location.id, durationMinutes: 60, mustVisit: false, locked: false, preferredTime: null, costEstimate: null });

it.each([['Nahargarh Fort', 100, 600], ['Amber Palace', 200, 1000], ['Amer Fort', 200, 1000], ['The City Palace', 400, 1200], ['Hawa Mahal', 100, 600]])('selects published %s Indian and foreign adult prices', (name, indian, foreign) => {
  const l = candidate(name).location;
  expect(admissionFor(l, prefs(), now)).toMatchObject({ minimum: indian, maximum: indian, tariff: { category: 'indian' } });
  expect(admissionFor(l, prefs({ currency: 'USD' }), now)).toMatchObject({ minimum: foreign, maximum: foreign, tariff: { category: 'foreign' } });
});
it('currency suggests eligibility but explicit category overrides it in either direction', () => {
  expect(visitorCategory(prefs({ currency: 'USD', visitorPricing: 'indian' }))).toBe('indian');
  expect(visitorCategory(prefs({ visitorPricing: 'foreign' }))).toBe('foreign');
  expect(visitorCategory(prefs({ currency: null }))).toBeNull();
  expect(admissionFor(candidate().location, prefs({ currency: null }), now)).toMatchObject({ minimum: 100, maximum: 600, tariff: { category: null } });
});
it('never conflates another City Palace, zoo, unverified country or expired review with a priced venue', () => {
  const c = candidate('City Palace'); c.location.city!.name = 'Udaipur'; expect(admissionFor(c.location, prefs(), now)).toBeUndefined();
  c.location.city!.name = 'Jaipur'; c.location.city!.countryCode = 'GB'; expect(admissionFor(c.location, prefs(), now)).toBeUndefined();
  expect(admissionFor(candidate('Nahargarh Biological Park').location, prefs(), now)).toBeUndefined();
  expect(admissionFor(candidate().location, prefs(), Date.parse('2026-12-01'))).toBeUndefined();
  c.location.city!.countryCode = 'IN'; c.location.city!.name = 'Jaipur Nagar Nigam Area'; expect(admissionFor(c.location, prefs(), now)?.minimum).toBe(400);
  const amber = candidate('Amber Palace'); amber.location.city!.name = 'Jaipur Heritage (M Corp.) (Part)'; expect(admissionFor(amber.location, prefs(), now)?.minimum).toBe(200);
});
it('applies published City Palace under-12 tickets and otherwise reserves full admission', () => {
  const c = admissionFor(candidate('City Palace').location, prefs(), now)!;
  expect(groupCost(c, prefs({ adults: 2, childAges: [5, 11, 12] }))).toEqual({ minimum: 1600, maximum: 1600 });
  expect(groupCost(admissionFor(candidate().location, prefs(), now)!, prefs({ childAges: [5] })).maximum).toBe(300);
});
it('converts prices using dated provider rates and rounds up without assuming currencies are equal', async () => {
  const cost = admissionFor(candidate('City Palace').location, prefs({ visitorPricing: 'foreign' }), now)!;
  const converted = await convertCost(cost, 'USD', { quote: async () => ({ ...quote, rate: 0.01048 }) });
  expect(converted).toMatchObject({ minimum: 13, maximum: 13, original: { minimum: 1200, currency: 'INR' }, childRate: { minimum: 7 }, exchange: { date: '2026-10-14' } });
  expect(roundedPrice(225, 'INR')).toBe(230); expect(roundedPrice(0, 'INR')).toBe(0);
  await expect(convertCost(cost, 'EUR', { quote: async () => { throw new Error('unavailable'); } })).rejects.toThrow('unavailable');
});
it('uses explicit meal tiers, provider price level and budget without claiming a menu quote', () => {
  expect(mealAllowance(prefs({ groupBudget: 1500 }), 'IN')).toMatchObject({ minimum: 150, maximum: 300, basis: 'person' });
  expect(mealAllowance(prefs(), 'IN', 'PRICE_LEVEL_EXPENSIVE')).toMatchObject({ minimum: 600, maximum: 1200 });
  expect(mealAllowance(prefs({ mealPriceTier: 'budget' }), 'IN', 'PRICE_LEVEL_EXPENSIVE')?.maximum).toBe(300);
  expect(mealAllowance(prefs({ mealBreak: false }), 'IN')).toBeUndefined(); expect(mealAllowance(prefs(), 'GB')).toBeUndefined();
});
it('includes food only in an actual or reserved meal and never double counts the group override', () => {
  const c = candidate('Test restaurant'); c.facts.categories = ['food']; c.facts.mealCost = mealAllowance(prefs(), 'IN'); c.facts.mealReserve = c.facts.mealCost;
  const p = prefs({ travelMode: 'WALK' });
  expect(budgetFor([stop(c)], [c], p).breakdown!.food.maximum).toBe(0);
  expect(budgetFor([stop(c)], [c], p, 0, true).breakdown!.food.maximum).toBe(1200);
  expect(budgetFor([{ ...stop(c), mealKind: 'lunch' }], [c], p).breakdown!.food.maximum).toBe(1200);
  expect(budgetFor([{ ...stop(c), mealKind: 'lunch' }], [c], { ...p, mealGroupEstimate: 700 }).breakdown!.food.maximum).toBe(700);
  expect(budgetFor([{ ...stop(c), mealKind: 'lunch' }], [c], { ...p, mealBreak: false }).breakdown!.food.maximum).toBe(0);
});
it('includes conservative route-distance driving allowances and honors explicit transport overrides', () => {
  const c = candidate(); c.facts.admission = admissionFor(c.location, prefs(), now)!;
  expect(budgetFor([stop(c)], [c], prefs(), 10000).breakdown!.transport).toEqual({ minimum: 450, maximum: 750 });
  expect(budgetFor([stop(c)], [c], prefs({ transportGroupEstimate: 100, transportPerKmEstimate: 5 }), 10000).breakdown!.transport.maximum).toBe(150);
  expect(budgetFor([stop(c)], [c], prefs({ travelMode: 'WALK' }), 10000).breakdown!.transport.maximum).toBe(0);
});
it('keeps meal and admission price explanations consistent and exposes their planning basis', () => {
  const cost = admissionFor(candidate().location, prefs(), now)!, facts = candidate().facts;
  const d = { facts, cost, groupCost: { minimum: 200, maximum: 200, currency: 'INR', basis: 'group' as const }, locationId: randomUUID(), reasons: [], bufferMinutes: 0, travelMinutes: 0, waitingMinutes: 0, hoursStatus: 'unknown' as const };
  expect(stopPriceLines(d, 2).join(' ')).toContain('foreign INR 600'); expect(stopPriceLines(d, 2).join(' ')).toContain('₹200.00');
  expect(mapStopPrice({ ...d, cost: null }, 2)).toBeUndefined(); expect(mapStopPrice(d, 2)).toContain('Admission:');
  const meal = { ...d, cost: null, mealKind: 'lunch' as const, mealCost: mealAllowance(prefs(), 'IN')! };
  expect(stopPriceLines(meal, 2).join(' ')).toContain('₹450 midpoint allowance'); expect(stopPriceLines(meal, 2).join(' ')).toContain('₹1,200.00');
});
it('does not retain stale meal or FX pricing when preferences change', async () => {
  const c = candidate('Test restaurant'); c.facts.categories = ['food'];
  const converted = await pricedCandidate(c, prefs({ currency: 'USD' }), rates);
  const noMeal = await pricedCandidate(converted, prefs({ mealBreak: false }), rates);
  expect(noMeal.facts.mealCost).toBeUndefined(); expect(noMeal.facts.mealReserve).toBeUndefined(); expect(noMeal.facts.pricingExchange).toBeUndefined();
});
it('exact-ID reviewed admission evidence takes priority over generic standard tariffs', async () => {
  const c = candidate(); const cost: GuideCost = { minimum: 50, maximum: 50, basis: 'person', currency: 'INR', source: 'reviewed_catalog', sourceUrl: 'https://official.example/ticket' }; c.facts.admission = cost;
  expect((await pricedCandidate(c, prefs(), rates)).facts.admission).toEqual(cost);
});
it('FX lookup coalesces concurrent requests, caches briefly and refreshes after expiry', async () => {
  let clock = now; const request = vi.fn<typeof fetch>(async () => Response.json({ base: 'INR', quote: 'USD', date: '2026-10-14', rate: 0.01048 }));
  const fx = new FrankfurterRates(request, () => clock); const [a, b] = await Promise.all([fx.quote('INR', 'USD'), fx.quote('INR', 'USD')]);
  expect(a).toEqual(b); expect(request).toHaveBeenCalledTimes(1); await fx.quote('INR', 'USD'); expect(request).toHaveBeenCalledTimes(1);
  clock += 1800001; await fx.quote('INR', 'USD'); expect(request).toHaveBeenCalledTimes(2);
});
it.each([{ base: 'USD', quote: 'INR', date: '2026-10-14', rate: 1 }, { base: 'INR', quote: 'USD', date: '2026-09-01', rate: 1 }, { base: 'INR', quote: 'USD', date: '2026-10-14', rate: 0 }])('rejects wrong, stale or invalid FX evidence with no 1:1 fallback', async data => {
  const fx = new FrankfurterRates(async () => Response.json(data), () => now); await expect(fx.quote('INR', 'USD')).rejects.toThrow();
});
it('FX failures can be retried and do not enter the cache', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(Response.json({ base: 'INR', quote: 'USD', date: '2026-10-14', rate: 0.01 }));
  const fx = new FrankfurterRates(request, () => now); await expect(fx.quote('INR', 'USD')).rejects.toThrow(); expect((await fx.quote('INR', 'USD')).rate).toBe(0.01);
});
