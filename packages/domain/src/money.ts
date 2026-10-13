import type { City, TripInput } from '../../contracts/src';
export type Range = [number, number];
export const add = (a: Range, b: Range): Range => [a[0] + b[0], a[1] + b[1]];
export const multiply = (a: Range, n: number): Range => [a[0] * n, a[1] * n];
export function groupBudget(input: TripInput): number { return input.budgetMinor * (input.budgetBasis === 'per_person' ? input.adults + input.childAges.length : 1); }
export function formatMoney(minor: number, city: Pick<City, 'currency' | 'currencyExponent'>): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency: city.currency, maximumFractionDigits: city.currencyExponent }).format(minor / 10 ** city.currencyExponent);
}
export function formatRange(range: Range, city: Pick<City, 'currency' | 'currencyExponent'>): string { return range[0] === range[1] ? formatMoney(range[0], city) : `${formatMoney(range[0], city)}–${formatMoney(range[1], city)}`; }
export function parseMoney(text: string, exponent: number): number | null {
  const pattern = exponent === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${exponent}})?$`);
  if (!pattern.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const result = Number(whole) * 10 ** exponent + Number(fraction.padEnd(exponent, '0'));
  return Number.isSafeInteger(result) && result <= 1_000_000_000 ? result : null;
}
