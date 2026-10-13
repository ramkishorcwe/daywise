import { z } from 'zod';

export const expenseCategories = ['tickets', 'food', 'transport', 'parking', 'other'] as const;
export type ExpenseCategory = typeof expenseCategories[number];
export const expenseRecordSchema = z.strictObject({
  category: z.enum(expenseCategories), status: z.enum(['booked', 'actual']),
  amountMinor: z.number().int().min(0).max(1_000_000_000),
  confirmedId: z.string().min(1).max(160), updatedAt: z.iso.datetime(),
});
export const expenseLedgerSchema = z.strictObject({
  cityId: z.string().min(1).max(80), currency: z.string().length(3),
  records: z.array(expenseRecordSchema).max(10),
}).refine(ledger => new Set(ledger.records.map(record => `${record.category}:${record.status}`)).size === ledger.records.length, { message: 'Only one whole-category total per expense status is supported.' });
export type ExpenseRecord = z.infer<typeof expenseRecordSchema>;
export type ExpenseLedger = z.infer<typeof expenseLedgerSchema>;
