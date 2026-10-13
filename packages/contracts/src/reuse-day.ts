import { z } from 'zod';
export const reuseDaySchema = z.strictObject({
  basis: z.enum(['accepted', 'draft']), title: z.string().trim().min(1).max(160), date: z.iso.date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), keepOrder: z.boolean(),
});
export type ReuseDay = z.infer<typeof reuseDaySchema>;
