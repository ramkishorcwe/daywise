import { z } from 'zod';

// Only these user-selected changes can affect a local revision. No arbitrary
// preference patch, source claim or inferred closure receives mutation rights.
export const localDayChangeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('delay') }),
  z.strictObject({ kind: z.literal('skip'), placeId: z.string().min(1).max(80) }),
  z.strictObject({ kind: z.literal('meal'), placeId: z.string().min(1).max(80) }),
  z.strictObject({ kind: z.literal('pace'), pace: z.enum(['relaxed', 'balanced', 'packed']) }),
]);
export type LocalDayChange = z.infer<typeof localDayChangeSchema>;
