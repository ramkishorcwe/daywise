import { planSchema, tripInputSchema, type ConfirmedPlan, type Plan, type TripInput } from '../../contracts/src';
export function sameValue(a: unknown, b: unknown): boolean {
  const encode = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  return encode(a) === encode(b);
}
export function confirmPlan(input: TripInput, plan: Plan, current: ConfirmedPlan | null, expectedVersionId: string | null): ConfirmedPlan {
  if ((current?.id ?? null) !== expectedVersionId) throw new Error('The confirmed plan changed. Review the latest version before accepting.');
  tripInputSchema.parse(input); planSchema.parse(plan);
  if (input.cityId !== plan.cityId || input.currency !== plan.currency || input.mustVisitIds.some(id => !plan.order.includes(id)) || input.excludedPlaceIds.some(id => plan.order.includes(id))) throw new Error('The plan does not match its reviewed preferences.');
  return structuredClone({ id: crypto.randomUUID(), input, plan, confirmedAt: new Date().toISOString() });
}
export function planChanges(previous: Plan, next: Plan): string[] {
  const changes: string[] = [];
  const removed = previous.stops.filter(s => s.kind !== 'break' && !next.order.includes(s.id));
  const added = next.stops.filter(s => s.kind !== 'break' && !previous.order.includes(s.id));
  if (removed.length) changes.push(`Remove ${removed.map(s => s.name).join(', ')}`);
  if (added.length) changes.push(`Add ${added.map(s => s.name).join(', ')}`);
  if (previous.order.join('|') !== next.order.join('|') && !removed.length && !added.length) changes.push('Change the order of your stops');
  const shift = Math.round((next.finishMs - previous.finishMs) / 60000);
  if (shift) changes.push(`Return ${Math.abs(shift)} minutes ${shift > 0 ? 'later' : 'earlier'}`);
  if (previous.total[1] !== next.total[1]) changes.push('Update the upper group cost estimate');
  if (!changes.length) changes.push('Refresh the plan with your current preferences');
  return changes;
}
