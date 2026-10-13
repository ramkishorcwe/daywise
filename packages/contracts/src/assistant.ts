import { z } from 'zod';
import { planSchema, tripInputSchema } from './index';
export { progressSchema, type TripProgress } from './progress';
export const assistantActionSchema = z.strictObject({ intent: z.enum(['summary', 'food', 'delay', 'pace', 'remove', 'clarify', 'unavailable']), minutes: z.number().int().min(0).max(180).nullable(), pace: z.enum(['relaxed', 'balanced', 'packed']).nullable(), placeId: z.string().max(80).nullable() });
export type AssistantAction = z.infer<typeof assistantActionSchema>;
export const assistantTurnSchema = z.strictObject({ tripId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), message: z.string().trim().min(1).max(2000) });
export const progressRequestSchema = z.strictObject({ expectedRevision: z.number().int().nonnegative(), expectedProgressRevision: z.number().int().nonnegative(), completedCount: z.number().int().min(0).max(12), delayMinutes: z.number().int().min(0).max(180) });
export const proposalSchema = z.strictObject({
  id: z.string().uuid(), tripId: z.string().uuid(), baseRevision: z.number().int().nonnegative(), baseConfirmedId: z.string().uuid(), progressRevision: z.number().int().nonnegative(),
  input: tripInputSchema, plan: planSchema, changes: z.array(z.string()).max(20), trigger: z.enum(['delay', 'pace', 'remove']), expiresAt: z.iso.datetime(), catalogVersion: z.string(),
});
export type Proposal = z.infer<typeof proposalSchema>;
export const proposalDecisionSchema = z.strictObject({ expectedRevision: z.number().int().nonnegative(), expectedProgressRevision: z.number().int().nonnegative(), expectedConfirmedId: z.string().uuid() });
export const assistantReplySchema = z.strictObject({
  mode: z.enum(['local', 'openai', 'gemini']), message: z.string().max(5000), proposal: proposalSchema.nullable(),
  food: z.array(z.strictObject({ id: z.string(), name: z.string(), matches: z.boolean(), rules: z.array(z.strictObject({ rule: z.string(), status: z.enum(['supported', 'unknown', 'not_supported']) })), source: z.literal('software_fixture'), checkedAt: z.null() })).max(20),
});
export type AssistantReply = z.infer<typeof assistantReplySchema>;
