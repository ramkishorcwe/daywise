import { z } from 'zod';
export type ExchangeQuote = { rate: number; date: string; sourceUrl: string };
export interface ExchangeRates { quote(from: string, to: string): Promise<ExchangeQuote> }
export class FrankfurterRates implements ExchangeRates {
  private cache = new Map<string, { quote: ExchangeQuote; expires: number }>();
  private pending = new Map<string, Promise<ExchangeQuote>>();
  constructor(private request: typeof fetch = fetch, private clock = () => Date.now()) {}
  async quote(from: string, to: string): Promise<ExchangeQuote> {
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to) throw new Error('Invalid exchange-rate pair.');
    const key = `${from}/${to}`, cached = this.cache.get(key);
    if (cached && cached.expires > this.clock()) return cached.quote;
    const waiting = this.pending.get(key); if (waiting) return waiting;
    const lookup = (async () => {
      const sourceUrl = `https://api.frankfurter.dev/v2/rate/${from.toLowerCase()}/${to.toLowerCase()}`;
      const response = await this.request(sourceUrl, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Exchange rate unavailable.');
      const data = z.object({ base: z.literal(from), quote: z.literal(to), rate: z.number().finite().positive().max(1e9), date: z.iso.date() }).parse(await response.json());
      const age = this.clock() - Date.parse(`${data.date}T00:00:00Z`);
      if (age < -86400000 || age > 7 * 86400000) throw new Error('Exchange rate is stale.');
      const quote = { rate: data.rate, date: data.date, sourceUrl }; this.cache.set(key, { quote, expires: this.clock() + 1800000 });
      if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
      return quote;
    })();
    this.pending.set(key, lookup);
    try { return await lookup; } finally { this.pending.delete(key); }
  }
}
