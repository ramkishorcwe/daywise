import { z } from 'zod';
export const priceCategories = ['tickets', 'food', 'transport', 'parking', 'other'] as const;
const range = z.strictObject({ minimum: z.number().finite().nonnegative().max(1e9), maximum: z.number().finite().nonnegative().max(1e9) }).refine(r => r.maximum >= r.minimum, 'Maximum must be at least the minimum.');
export const priceAllowancesSchema = z.strictObject({ planKey: z.string().max(12000), currency: z.string().regex(/^[A-Z]{3}$/), ranges: z.partialRecord(z.enum(priceCategories), range) });
export type PriceAllowances = z.infer<typeof priceAllowancesSchema>;
