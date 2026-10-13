import { z } from 'zod';
import { checkedCatalogSchema, evidenceSchema, CheckedCatalog } from './catalog';
import { dietRules } from '../../contracts/src';

export const foodRecordSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,80}$/), cityId: z.string().regex(/^[a-z0-9-]{1,80}$/), locationId: z.string().regex(/^[a-z0-9-]{1,80}$/),
  rule: z.enum(dietRules), status: z.enum(['supported', 'unsupported', 'unknown']),
  scope: z.literal('branch_preparation'), evidence: evidenceSchema.nullable(),
}).refine(row => row.status === 'unknown' || row.evidence !== null, 'A dietary assertion requires branch-specific source evidence.');
export const maintenanceContentSchema = z.strictObject({
  catalog: checkedCatalogSchema, food: z.array(foodRecordSchema).max(500),
}).superRefine((content, context) => {
  const seen = new Set<string>(), rules = new Set<string>();
  for (const [index, row] of content.food.entries()) {
    const city = content.catalog.cities.find(city => city.id === row.cityId);
    if (!city?.locations.some(location => location.id === row.locationId)) context.addIssue({ code: 'custom', path: ['food', index], message: 'Food evidence must refer to a catalog branch location.' });
    const key = `${row.cityId}:${row.locationId}:${row.rule}`;
    if (seen.has(row.id) || rules.has(key)) context.addIssue({ code: 'custom', path: ['food', index], message: 'Food IDs and branch/rule pairs must be unique.' });
    seen.add(row.id); rules.add(key);
  }
});
export const maintenanceStateSchema = z.strictObject({
  schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), content: maintenanceContentSchema,
  audit: z.array(z.strictObject({ proposalId: z.uuid(), submitter: z.string().max(80), reviewer: z.string().max(80), at: z.iso.datetime(), digest: z.string().regex(/^[a-f0-9]{64}$/), fromRevision: z.number().int().nonnegative() })).max(100),
});
export const maintenanceProposalSchema = z.strictObject({
  schemaVersion: z.literal(1), id: z.uuid(), baseRevision: z.number().int().nonnegative(), submittedAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
  submitter: z.string().regex(/^[a-zA-Z0-9_-]{2,80}$/), reason: z.string().trim().min(10).max(500), content: maintenanceContentSchema,
});
export type MaintenanceContent = z.infer<typeof maintenanceContentSchema>;
export type MaintenanceState = z.infer<typeof maintenanceStateSchema>;
export type MaintenanceProposal = z.infer<typeof maintenanceProposalSchema>;
export const emptyMaintenance = (): MaintenanceState => ({ schemaVersion: 1, revision: 0, content: { catalog: { schemaVersion: 1, cities: [] }, food: [] }, audit: [] });
export function currentFood(content: MaintenanceContent, now = Date.now()) {
  return content.food.map(row => ({ ...row, effectiveStatus: row.evidence && Date.parse(row.evidence.checkedAt) <= now && Date.parse(row.evidence.validUntil) > now ? row.status : 'unknown' as const }));
}
export function reviewProblems(content: MaintenanceContent, now = Date.now()) {
  const problems: string[] = [];
  const available = new CheckedCatalog(content.catalog.cities, () => now).available();
  for (const city of content.catalog.cities) {
    if (city.status === 'route_review' && !available.some(value => value.id === city.id)) problems.push(`City ${city.id} needs at least two current route locations.`);
  }
  for (const row of content.food) if (row.status !== 'unknown' && currentFood({ ...content, food: [row] }, now)[0].effectiveStatus === 'unknown') problems.push(`Food record ${row.id} has expired or future evidence; recheck it or set it to unknown.`);
  return problems;
}
