import type { ZodError } from 'zod';
export type GuideFieldIssue = { field: string; label: string; message: string };
const labels: Record<string, string> = {
  groupBudget: 'Group budget', currency: 'Budget currency', adults: 'Adults', childAges: 'Children', groupType: 'Group type',
  perPersonBudget: 'Optional per-person budget limit', mealGroupEstimate: 'Your group meal estimate', transportGroupEstimate: 'Your fixed group transport estimate', transportPerKmEstimate: 'Your group transport estimate per km', bufferMinutes: 'Arrival buffer (minutes)',
  'meals.lunch.durationMinutes': 'Meal duration (minutes)', 'meals.nearbyMeters': 'Maximum distance from previous visit (km)', 'meals.maxExtraMinutes': 'Maximum extra travel per meal (minutes)', 'meals.maxExtraMeters': 'Maximum extra distance per meal (km)',
  notes: 'Tell the guide what matters', interests: 'Your interests', pace: 'Preferred pace', environment: 'Indoor or outdoor', mobility: 'Mobility requirements', travelMode: 'Travel mode',
};
const rules: Record<string, string> = {
  adults: 'Enter a whole number from 1 to 12.', childAges: 'Enter an age from 0 to 17 for each child.', bufferMinutes: 'Enter a whole number from 0 to 45.',
  'meals.lunch.durationMinutes': 'Enter a whole number from 15 to 120.', 'meals.nearbyMeters': 'Enter a distance from 0.1 to 3 km.', 'meals.maxExtraMinutes': 'Enter a whole number from 0 to 30.', 'meals.maxExtraMeters': 'Enter a distance from 0 to 5 km.',
  groupBudget: 'Enter a valid amount of zero or more, or leave it empty.', perPersonBudget: 'Enter a valid amount of zero or more, or leave it empty.', mealGroupEstimate: 'Enter a valid amount of zero or more, or leave it empty.', transportGroupEstimate: 'Enter a valid amount of zero or more, or leave it empty.', transportPerKmEstimate: 'Enter a valid amount of zero or more, or leave it empty.',
};
export function guideFieldIssues(error: ZodError): GuideFieldIssue[] {
  const rows = error.issues.map(issue => {
    const path = issue.path.map(String).join('.'), parent = String(issue.path[0] ?? '');
    const child = parent === 'childAges' && typeof issue.path[1] === 'number';
    const label = child ? `Child ${Number(issue.path[1]) + 1} age` : labels[path] ?? labels[parent] ?? 'Travel preferences';
    const message = issue.code === 'custom' ? issue.message : rules[path] ?? rules[parent] ?? (path === 'notes' ? 'Use no more than 1,200 characters.' : path === 'currency' ? 'Select a valid budget currency.' : 'Choose a valid value for this preference.');
    return { field: child ? path : labels[path] ? path : parent, label, message };
  });
  return rows.filter((row, i) => rows.findIndex(r => r.field === row.field && r.message === row.message) === i);
}
export function focusGuideField(scope: HTMLElement, field: string) {
  if (!/^[A-Za-z0-9_.]+$/.test(field)) return;
  const control = scope.querySelector<HTMLElement>(`[data-guide-field="${field}"]`);
  if (!control) return;
  for (let node = control.parentElement; node; node = node.parentElement) if (node instanceof HTMLDetailsElement) node.open = true;
  control.focus(); control.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
