import { z } from 'zod';
import { sessionSchema } from './index';

export const backupByteLimit = 1_048_576;
export const dayBackupSchema = z.strictObject({
  kind: z.literal('daywise-private-day'), formatVersion: z.literal(1),
  dataMode: z.literal('software_fixture'), exportedAt: z.iso.datetime(),
  session: sessionSchema,
}).refine(value => !value.session.assistant || value.session.assistant.tripId === null, { message: 'Backups cannot carry a backend workspace connection.' })
  .refine(value => z.uuid().safeParse(value.session.id).success && z.iso.datetime().safeParse(value.session.updatedAt).success && (!value.session.confirmed || (z.uuid().safeParse(value.session.confirmed.id).success && z.iso.datetime().safeParse(value.session.confirmed.confirmedAt).success)), { message: 'Backup identifiers and timestamps are invalid.' });
export type DayBackup = z.infer<typeof dayBackupSchema>;
