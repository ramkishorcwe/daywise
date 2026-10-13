import { z } from 'zod';
export const readinessSchema = z.strictObject({
  schemaVersion: z.literal(1), localPlanning: z.boolean(), livePlanning: z.literal(false),
  message: z.string(), pending: z.array(z.string()).max(12),
});
export type Readiness = z.infer<typeof readinessSchema>;
export const pendingReleaseGates = [
  'Independently checked hours, fees, accessibility and branch-specific food evidence',
  'Provider access, reuse rights and representative routing checks',
  'Shared operating limits, durable proposals and recovery checks',
  'Cloud authorization, deletion and backup expiry checks',
  'AI evaluation, measured costs and controlled traveler trials',
] as const;
