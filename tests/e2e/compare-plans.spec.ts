import { expect, test, type Page } from '@playwright/test';
import { setup } from './helpers/live-guide';
import { savedAcceptedTrips } from './helpers/accepted-trips';
import type { GuidePlan } from '../../packages/contracts/src/guide';
const localKey = 'daywise-live-active-v1';
const acknowledgement = 'I will confirm unverified hours, costs, accessibility and food preparation before visiting';
const comparison = (page: Page) => page.getByRole('region', { name: 'Compare three plans', exact: true });

for (const width of [390, 1440]) test(`compare three plans, switch previews and save only the accepted choice at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 960 });
  const state = await setup(page, false, true);
  await page.getByRole('button', { name: 'Compare three plans', exact: true }).click();
  await expect(comparison(page)).toBeVisible();
  expect(state.comparisons).toHaveLength(1); expect(state.inputs).toHaveLength(0);
  await expect(comparison(page).getByRole('article')).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toHaveCount(0);
  expect(await savedAcceptedTrips(page)).toHaveLength(0);
  expect(await page.evaluate(key => localStorage.getItem(key), localKey)).toBeNull();
  const sightseeing = comparison(page).getByRole('article', { name: 'More sightseeing', exact: true });
  await expect(sightseeing).toContainText('Known group subtotal'); await expect(sightseeing).toContainText('₹');
  await expect(sightseeing).toContainText('Partial estimate');
  await sightseeing.getByRole('button', { name: 'Review More sightseeing', exact: true }).click();
  await expect(page.locator('.guide-timeline .guide-stop-card')).toHaveCount(2);
  await page.getByRole('checkbox', { name: acknowledgement, exact: true }).check();
  await comparison(page).getByRole('button', { name: 'Review Less travelling', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: acknowledgement, exact: true })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Accept this guided itinerary', exact: true })).toBeDisabled();
  await expect(page.locator('.guide-timeline .guide-stop-card')).toHaveCount(1);
  const relaxed = comparison(page).getByRole('article', { name: 'Relaxed day', exact: true });
  await expect(relaxed.locator('dl > div').filter({ hasText: 'Time at visits' })).toContainText('40 min');
  await expect(relaxed).toContainText('Adds 25% more time');
  await expect(comparison(page).getByRole('article', { name: 'Less travelling', exact: true }).locator('dl > div').filter({ hasText: 'Time at visits' })).toContainText('30 min');
  expect(state.comparisons).toHaveLength(1); expect(state.inputs).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.tmp/compare-plans-${width}.png`, fullPage: true });
  await comparison(page).screenshot({ path: `.tmp/compare-plans-cards-${width}.png` });
  await page.getByRole('checkbox', { name: acknowledgement, exact: true }).check();
  await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
  await expect.poll(async () => (await savedAcceptedTrips(page)).length).toBe(1);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), localKey);
  expect(saved.acceptedGuide.itinerary.stops).toHaveLength(1);
  await page.reload(); await expect(page.locator('.guide-timeline .guide-stop-card')).toHaveCount(1);
});

test('form edits clear comparisons, do not trigger planning, and preserve an existing accepted trip', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await page.getByRole('checkbox', { name: acknowledgement, exact: true }).check();
  await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
  const saved = await page.evaluate(key => localStorage.getItem(key), localKey);
  await page.getByRole('button', { name: 'My day plan', exact: true }).click();
  await page.getByRole('button', { name: 'Compare three plans', exact: true }).click();
  await expect(comparison(page)).toBeVisible();
  await comparison(page).getByRole('button', { name: 'Review Relaxed day', exact: true }).click();
  await page.getByRole('button', { name: 'gardens', exact: true }).click();
  await expect(comparison(page)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toHaveCount(0);
  await page.waitForTimeout(1100);
  expect(state.inputs).toHaveLength(1); expect(state.comparisons).toHaveLength(1);
  expect(await page.evaluate(key => localStorage.getItem(key), localKey)).toBe(saved);
});

async function existingPlan(page: Page) {
  const response = page.waitForResponse(r => r.url().endsWith('/api/guide/plan'));
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  return (await (await response).json()) as GuidePlan;
}

test('repeating comparison before selecting an option retains locks, must-visits and user visit durations', async ({ page }) => {
  const state = await setup(page); await existingPlan(page);
  await page.getByText('Adjust the planned visits', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Must visit Provider Museum', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Lock Provider Garden in this position', exact: true }).check();
  await page.getByLabel('Visit duration for Provider Museum', { exact: true }).fill('75');
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Compare three plans', exact: true }).click();
    await expect(comparison(page)).toBeVisible();
  }
  expect(state.comparisons).toHaveLength(2);
  for (const input of state.comparisons) {
    expect(input.stops[0]).toMatchObject({ locationId: state.bank[1].location.id, locked: true });
    expect(input.stops.find(s => s.locationId === state.bank[0].location.id)).toMatchObject({ mustVisit: true, durationMinutes: 75, durationSource: 'user' });
  }
  await comparison(page).getByRole('button', { name: 'Review More sightseeing', exact: true }).click();
  await page.getByText('Adjust the planned visits', { exact: true }).click();
  await expect(page.getByLabel('Visit duration for Provider Museum', { exact: true })).toHaveValue('75');
});

test('unavailable styles show actionable errors while a valid alternative remains selectable', async ({ page }) => {
  await setup(page); const plan = await existingPlan(page);
  await page.route('**/api/guide/compare', r => r.fulfill({ json: { options: [
    { style: 'sightseeing', status: 'ready', plan },
    { style: 'less_travel', status: 'unavailable', code: 'PROVIDER_QUOTA', reason: 'Google routing quota reached. Retry later.' },
    { style: 'relaxed', status: 'unavailable', code: 'GUIDE_INFEASIBLE', reason: 'Your locked visits leave no feasible relaxed alternative.' },
  ] } }));
  await page.getByRole('button', { name: 'Compare three plans', exact: true }).click();
  await expect(comparison(page)).toContainText('Google routing quota reached');
  await expect(comparison(page).getByRole('button')).toHaveCount(1);
  await comparison(page).getByRole('button').click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
});

test('a stale comparison cannot overwrite changed preferences or send a duplicate request', async ({ page }) => {
  const state = await setup(page); const plan = await existingPlan(page);
  let release!: () => void, count = 0;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/guide/compare', async r => { count++; await pending; await r.fulfill({ json: { options: ['sightseeing', 'less_travel', 'relaxed'].map(style => ({ style, status: 'ready', plan })) } }).catch(() => {}); });
  await page.getByRole('button', { name: 'Compare three plans', exact: true }).click();
  await expect.poll(() => count).toBe(1);
  await expect(page.getByRole('button', { name: 'Compare three plans', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'forts', exact: true }).click(); release();
  await expect(page.getByRole('button', { name: 'Compare three plans', exact: true })).toBeEnabled();
  await page.waitForTimeout(1100);
  await expect(comparison(page)).toHaveCount(0); expect(count).toBe(1); expect(state.inputs).toHaveLength(1);
});

test('expired comparison estimates cannot be selected or accepted', async ({ page }) => {
  await setup(page); const plan = await existingPlan(page); plan.itinerary.route.expiresAt = new Date(Date.now() - 1000).toISOString();
  await page.route('**/api/guide/compare', r => r.fulfill({ json: { options: ['sightseeing', 'less_travel', 'relaxed'].map(style => ({ style, status: 'ready', plan })) } }));
  await page.getByRole('button', { name: 'Compare three plans', exact: true }).click();
  await comparison(page).getByRole('button', { name: 'Review Relaxed day', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('comparison route estimate expired');
  await expect(page.getByRole('button', { name: 'Accept this guided itinerary', exact: true })).toHaveCount(0);
});

test('a duplicate comparison has no second itinerary or review button', async ({ page }) => {
  await setup(page); const plan = await existingPlan(page);
  await page.route('**/api/guide/compare', r => r.fulfill({ json: { options: [
    { style: 'sightseeing', status: 'ready', plan },
    { style: 'less_travel', status: 'unavailable', code: 'NO_DISTINCT_PLAN', reason: 'This style selected the same itinerary. No separate alternative is shown.' },
    // Compatibility with a previously returned comparison also hides duplicated choices.
    { style: 'relaxed', status: 'ready', plan, sameAs: 'sightseeing' },
  ] } }));
  await page.getByRole('button', { name: 'Compare three plans', exact: true }).click();
  await expect(comparison(page).getByRole('article', { name: 'Less travelling', exact: true })).toContainText('No separate alternative');
  await expect(comparison(page).getByRole('article', { name: 'Relaxed day', exact: true })).toContainText('No separate alternative');
  await expect(comparison(page).getByRole('button')).toHaveCount(1);
});

test('relaxed visit time stays distinct without compounding and survives acceptance and refresh', async ({ page }) => {
  const state = await setup(page);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Compare three plans', exact: true }).click();
    await comparison(page).getByRole('button', { name: 'Review Relaxed day', exact: true }).click();
    await expect(page.locator('.guide-stop-time')).toContainText('40 min visit');
  }
  expect(state.comparisons[1].stops[0]).toMatchObject({ durationMinutes: 40, baseDurationMinutes: 30 });
  await page.getByRole('checkbox', { name: acknowledgement, exact: true }).check();
  await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), localKey);
  expect(saved.acceptedGuide.itinerary.stops[0].durationMinutes).toBe(40);
  expect(saved.acceptedGuide.stops[0].baseDurationMinutes).toBe(30);
  await page.reload(); await expect(page.locator('.guide-stop-time')).toContainText('40 min visit');
});
