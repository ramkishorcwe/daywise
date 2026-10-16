import { z } from 'zod';
import { cityIdentitySchema } from './locations';
export const festivalSearchInputSchema = z.strictObject({ city: cityIdentitySchema, state: z.string().trim().max(300).nullable().optional(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
const httpsUrl = z.url().max(3000).refine(value => { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; });
export const searchedFestivalSchema = z.strictObject({ name: z.string().trim().min(1).max(180), startsOn: z.iso.date(), endsOn: z.iso.date(), city: z.string().trim().min(1).max(300), countryCode: z.string().regex(/^[A-Z]{2}$/), area: z.string().trim().max(400), sourceUrl: httpsUrl });
export const festivalSearchResultSchema = z.strictObject({
  city: cityIdentitySchema, month: festivalSearchInputSchema.shape.month, checkedAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
  events: z.array(searchedFestivalSchema).max(40), sources: z.array(z.strictObject({ title: z.string().max(300), url: httpsUrl })).max(40),
  searchSuggestions: z.string().max(100000), incomplete: z.boolean(),
});
export type FestivalSearchInput = z.infer<typeof festivalSearchInputSchema>;
export type FestivalSearchResult = z.infer<typeof festivalSearchResultSchema>;
