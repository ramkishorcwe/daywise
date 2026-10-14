import { expect, it } from 'vitest';
import { guidePreferencesSchema } from '../packages/contracts/src/guide';
import { guideFieldIssues } from '../apps/web/src/guide-validation';
const base = { adults: 2, childAges: [], groupBudget: null, currency: null, dietaryRules: [] };
const errors = (patch: Record<string, unknown>) => { const result = guidePreferencesSchema.safeParse({ ...base, ...patch }); if (result.success) throw new Error('Expected invalid profile'); return guideFieldIssues(result.error); };
it('identifies currency only when an entered monetary amount requires it, including zero', () => {
  expect(guidePreferencesSchema.safeParse(base).success).toBe(true);
  for (const field of ['groupBudget', 'perPersonBudget', 'mealGroupEstimate', 'transportGroupEstimate', 'transportPerKmEstimate']) expect(errors({ [field]: 0 })).toContainEqual({ field: 'currency', label: 'Budget currency', message: 'Select a budget currency when entering any budget or cost estimate.' });
});
it('names each malformed or negative monetary field instead of blaming all preferences', () => {
  for (const field of ['groupBudget', 'perPersonBudget', 'mealGroupEstimate', 'transportGroupEstimate', 'transportPerKmEstimate']) for (const amount of [NaN, -1, Infinity]) expect(errors({ [field]: amount })[0]).toMatchObject({ field, message: 'Enter a valid amount of zero or more, or leave it empty.' });
});
it('identifies solo and group-size conflicts with actionable corrections', () => {
  expect(errors({ groupType: 'solo' })[0]).toMatchObject({ field: 'groupType', label: 'Group type', message: expect.stringContaining('Adults to 1') });
  expect(errors({ adults: 12, childAges: [5] })[0]).toMatchObject({ field: 'adults', message: expect.stringContaining('Reduce Adults or Children') });
});
it('identifies the exact child age and required arrival buffer', () => {
  expect(errors({ childAges: [5, 18] })[0]).toMatchObject({ field: 'childAges.1', label: 'Child 2 age', message: 'Enter an age from 0 to 17 for each child.' });
  expect(errors({ bufferMinutes: null })[0]).toMatchObject({ field: 'bufferMinutes', label: 'Arrival buffer (minutes)', message: 'Enter a whole number from 0 to 45.' });
});
it('reports meal duration and distance limits in the units shown in the form', () => {
  const meals = { lunch: { enabled: true, startTime: '13:00', endTime: '14:00', durationMinutes: 5 }, nearbyMeters: 5000, maxExtraMinutes: 40, maxExtraMeters: 8000 };
  expect(errors({ meals }).map(row => row.message)).toEqual(['Enter a whole number from 15 to 120.', 'Enter a distance from 0.1 to 3 km.', 'Enter a whole number from 0 to 30.', 'Enter a distance from 0 to 5 km.']);
});
