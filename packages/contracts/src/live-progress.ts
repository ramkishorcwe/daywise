import { z } from 'zod';
import { providerPlaceId } from './locations';
export const liveProgressSchema = z.strictObject({ acceptedId: z.string().uuid(), completedPlaceIds: z.array(providerPlaceId).max(5), reportedAt: z.iso.datetime(), returnedAt: z.iso.datetime().optional() });
export type LiveProgress = z.infer<typeof liveProgressSchema>;
