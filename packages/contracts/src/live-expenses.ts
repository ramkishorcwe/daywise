import { z } from 'zod';
import { expenseRecordSchema } from './expenses';
import { providerPlaceId } from './locations';
export const liveExpenseSchema = z.strictObject({ cityId: providerPlaceId, currency: z.string().regex(/^[A-Z]{3}$/), records: z.array(expenseRecordSchema).max(10) }).refine(value => new Set(value.records.map(row => `${row.category}:${row.status}`)).size === value.records.length, 'Keep one whole-category amount per status.');
export type LiveExpenses = z.infer<typeof liveExpenseSchema>;
