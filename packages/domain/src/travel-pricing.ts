import type { GuideCandidate, GuideCost, GuidePreferences } from '../../contracts/src/guide';
import type { SelectedLocation } from '../../contracts/src/locations';
import { admissionPrices, admissionCheckedAt, admissionValidUntil } from '../../data-adapters/src/admission-prices';
import type { ExchangeRates } from '../../data-adapters/src/exchange-rates';
export const visitorCategory = (p: Pick<GuidePreferences, 'visitorPricing' | 'currency'>) => p.visitorPricing !== 'auto' ? p.visitorPricing : !p.currency ? null : p.currency === 'INR' ? 'indian' : 'foreign';
export const roundedPrice = (value: number, currency: string) => value === 0 ? 0 : Math.ceil((value - 1e-9) / (currency === 'INR' ? 10 : 1)) * (currency === 'INR' ? 10 : 1);
export function mealAllowance(p: GuidePreferences, country: string | undefined, level?: string): GuideCost | undefined {
  if (country !== 'IN' || !p.mealBreak) return;
  const people = p.adults + p.childAges.length;
  const limits = [p.groupBudget === null ? null : p.groupBudget / people, p.perPersonBudget].filter((v): v is number => v !== null);
  const limit = limits.length ? Math.min(...limits) : null;
  const tier = p.mealPriceTier !== 'auto' ? p.mealPriceTier : level === 'PRICE_LEVEL_VERY_EXPENSIVE' || level === 'PRICE_LEVEL_EXPENSIVE' ? 'premium' : level === 'PRICE_LEVEL_INEXPENSIVE' || (limit !== null && limit < 1000) ? 'budget' : 'standard';
  const [minimum, maximum] = tier === 'budget' ? [150, 300] : tier === 'premium' ? [600, 1200] : [300, 600];
  return { minimum, maximum, currency: 'INR', basis: 'person', source: 'planning_estimate', sourceUrl: null, note: `${tier} meal allowance per person, not a restaurant quote or measured average. Drinks and optional extras excluded.` };
}
export function admissionFor(location: SelectedLocation, p: GuidePreferences, clock = Date.now()): GuideCost | undefined {
  const city = location.city?.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Google's verified municipal identity for Amber is Jaipur Heritage (M Corp.) (Part).
  if (location.provider !== 'google' || !location.placeId || location.city?.countryCode !== 'IN' || !['jaipur', 'amer', 'jaipurnagarnigamarea', 'jaipurheritagemcorppart'].includes(city ?? '') || clock < Date.parse(admissionCheckedAt) || clock > Date.parse(admissionValidUntil)) return;
  const name = location.name.toLowerCase().replace(/[^a-z0-9]/g, ''), row = admissionPrices.find(row => (row.aliases as readonly string[]).includes(name));
  if (!row) return;
  const category = visitorCategory(p), selected = category === 'indian' ? row.indian : category === 'foreign' ? row.foreign : undefined;
  const cost: GuideCost = { minimum: selected ?? row.indian, maximum: selected ?? row.foreign, currency: 'INR', basis: 'person', source: row.source, sourceUrl: row.url, checkedAt: admissionCheckedAt, note: row.note, tariff: { indianAdult: row.indian, foreignAdult: row.foreign, category, suggestedByCurrency: p.visitorPricing === 'auto', currency: 'INR' } };
  if ('belowAge' in row && category) cost.childRate = { belowAge: row.belowAge, minimum: category === 'indian' ? row.indianChild : row.foreignChild, maximum: category === 'indian' ? row.indianChild : row.foreignChild };
  return cost;
}
export async function convertCost(cost: GuideCost, currency: string | null, rates: ExchangeRates): Promise<GuideCost> {
  if (!currency || cost.currency === currency) return { ...cost, minimum: roundedPrice(cost.minimum, cost.currency), maximum: roundedPrice(cost.maximum, cost.currency) };
  const exchange = await rates.quote(cost.currency, currency);
  return { ...cost, original: { minimum: cost.minimum, maximum: cost.maximum, currency: cost.currency }, currency, minimum: roundedPrice(cost.minimum * exchange.rate, currency), maximum: roundedPrice(cost.maximum * exchange.rate, currency), ...(cost.childRate ? { childRate: { ...cost.childRate, minimum: roundedPrice(cost.childRate.minimum * exchange.rate, currency), maximum: roundedPrice(cost.childRate.maximum * exchange.rate, currency) } } : {}), exchange };
}
export async function pricedCandidate(candidate: GuideCandidate, p: GuidePreferences, rates: ExchangeRates): Promise<GuideCandidate> {
  const facts = { ...candidate.facts };
  delete facts.pricingExchange; delete facts.mealCost; delete facts.mealReserve;
  if (candidate.location.city?.countryCode === 'IN' && p.currency && p.currency !== 'INR') facts.pricingExchange = await rates.quote('INR', p.currency);
  const admission = admissionFor(candidate.location, p);
  // Independently maintained exact-ID evidence wins over the standard name tariff.
  if (facts.admission?.tariff) facts.admission = null;
  if (admission && !facts.admission) facts.admission = await convertCost(admission, p.currency, rates);
  else if (facts.admission && p.currency && facts.admission.currency !== p.currency) facts.admission = await convertCost(facts.admission, p.currency, rates);
  const reserve = mealAllowance(p, candidate.location.city?.countryCode);
  if (reserve) facts.mealReserve = await convertCost(reserve, p.currency, rates);
  if (facts.categories.includes('food')) { const meal = mealAllowance(p, candidate.location.city?.countryCode, facts.priceLevel); if (meal) facts.mealCost = await convertCost(meal, p.currency, rates); }
  return { ...candidate, facts };
}
export function groupCost(cost: GuideCost, p: Pick<GuidePreferences, 'adults' | 'childAges'>) {
  if (cost.basis === 'group') return { minimum: cost.minimum, maximum: cost.maximum };
  return p.childAges.reduce((total, age) => { const rate = cost.childRate && age < cost.childRate.belowAge ? cost.childRate : cost; return { minimum: total.minimum + rate.minimum, maximum: total.maximum + rate.maximum }; }, { minimum: cost.minimum * p.adults, maximum: cost.maximum * p.adults });
}
