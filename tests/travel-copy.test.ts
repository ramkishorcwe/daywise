import { expect, it } from 'vitest';
import { cities, defaultInput } from '../fixtures/cities';
import { generatePlan } from '../packages/domain/src/planner';
import { confirmPlan } from '../packages/domain/src/versioning';
import { travelCopy, travelCopyHtml } from '../packages/domain/src/travel-copy';
import { formatTime } from '../packages/domain/src/time-format';
import { replan, progressReadyAt } from '../packages/domain/src/replan';

function baseline(city = cities[0]) {
  const input = defaultInput(city), result = generatePlan(input, city);
  if (result.outcome !== 'feasible') throw new Error('A feasible test baseline is required.');
  return confirmPlan(input, result.plan, null, null);
}
it('copies the exact accepted schedule including meals, rest, travel, start and return', () => {
  const confirmed = baseline(), original = structuredClone(confirmed), copy = travelCopy(confirmed, cities[0]);
  expect(copy.stops.map(stop => stop.name)).toEqual(confirmed.plan.stops.map(stop => stop.name));
  expect(copy.stops.map(stop => stop.arrival)).toEqual(confirmed.plan.stops.map(stop => formatTime(stop.arrivalMs, confirmed.plan.timezone)));
  expect(copy.stops.some(stop => stop.kind === 'Meal')).toBe(true); expect(copy.stops.some(stop => stop.kind === 'Rest break')).toBe(true);
  expect(copy.end.time).toBe(formatTime(confirmed.plan.finishMs, confirmed.plan.timezone)); expect(copy.end.travel).toBe(confirmed.plan.returnLeg.durationMinutes);
  copy.stops[0].name = 'Edited returned copy'; expect(confirmed).toEqual(original);
});
it('excludes private preferences, identifiers, reasons and all cost amounts by default', () => {
  const confirmed = baseline(), copy = travelCopy(confirmed, cities[0]), text = JSON.stringify(copy);
  expect(copy.budget).toBeNull(); expect(text).not.toContain(confirmed.id);
  for (const key of ['input', 'adults', 'childAges', 'dietaryRules', 'stepFree', 'budgetMinor', 'reason', 'confirmedAt', 'point', 'placeId']) expect(copy).not.toHaveProperty(key);
  expect(text).not.toContain(confirmed.plan.stops[0].reason); expect(travelCopyHtml(copy)).not.toContain('₹');
});
it('includes only accepted fixture estimates when opted in and uses the city currency/timezone', () => {
  for (const city of cities) {
    const confirmed = baseline(city), copy = travelCopy(confirmed, city, true);
    expect(copy.timezone).toBe(city.timezone); expect(copy.budget!.rows).toHaveLength(6);
    expect(copy.budget!.total).toContain(city.currency === 'INR' ? '₹' : '$'); expect(copy.budget!.rows.at(-1)!.name).toBe('Contingency reserve');
    expect(travelCopyHtml(copy)).toContain('reported booked/actual costs are excluded');
  }
});
it('escapes untrusted text and generates a self-contained script-free document', () => {
  const confirmed = baseline(); confirmed.plan.stops[0].name = '</h3><img src="https://evil.invalid" onerror="alert(1)"><script>attack()</script>&';
  const city = { ...cities[0], name: '<iframe src="https://evil.invalid">' };
  const html = travelCopyHtml(travelCopy(confirmed, city));
  expect(html).toContain('&lt;script&gt;attack()&lt;/script&gt;'); expect(html).toContain('&amp;'); expect(html).not.toMatch(/<(script|iframe|img|link)\b/i);
  expect(html).toContain("default-src 'none'"); expect(html).not.toContain('src="https://'); expect(html).toContain('Fictional test itinerary');
});
it('preserves accepted delay times and discloses old catalog versions without recalculating', () => {
  const confirmed = baseline(); const progress = { revision: 1, completedCount: 1, readyAt: new Date(progressReadyAt(confirmed.plan, 1, 30)).toISOString() };
  const result = replan(confirmed.input, cities[0], confirmed.plan, progress); if (result.outcome !== 'feasible') throw new Error('Feasible test revision required.');
  const revised = confirmPlan(confirmed.input, result.plan, confirmed, confirmed.id), city = { ...cities[0], catalogVersion: 'fixture-v2' };
  const copy = travelCopy(revised, city); expect(copy.stale).toBe(true); expect(copy.source).toContain(revised.plan.catalogVersion); expect(copy.end.time).toBe(formatTime(result.plan.finishMs, city.timezone));
  expect(travelCopyHtml(copy)).toContain('Older test catalog');
});
it('rejects city/currency mismatches and corrupt snapshots rather than exporting a fabricated itinerary', () => {
  const confirmed = baseline(); expect(() => travelCopy(confirmed, cities[1])).toThrow('city or currency');
  expect(() => travelCopy({ ...confirmed, plan: { ...confirmed.plan, total: [0, 0] } }, cities[0])).toThrow();
});
