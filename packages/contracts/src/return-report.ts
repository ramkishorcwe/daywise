import { z } from 'zod';
export const returnReportSchema = z.strictObject({
  confirmedId: z.string().uuid(), arrivedAt: z.iso.datetime(), reportedAt: z.iso.datetime(), source: z.literal('user_reported_unverified'),
}).refine(value => Date.parse(value.arrivedAt) <= Date.parse(value.reportedAt), { message: 'Reported arrival cannot be later than the reporting time.' });
