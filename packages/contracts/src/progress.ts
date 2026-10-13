import { z } from 'zod';
export const progressSchema = z.strictObject({ revision: z.number().int().nonnegative(), completedCount: z.number().int().min(0).max(12), readyAt: z.iso.datetime() });
export type TripProgress = z.infer<typeof progressSchema>;
