import { expect, test } from '@playwright/test';
import { setup } from './helpers/live-guide';
import type { GuidePlan, GuidePlanRequest } from '../../packages/contracts/src/guide';

for (const width of [390, 1440]) test(`interest coverage explains an impossible preference and survives acceptance at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 950 });
  const state = await setup(page);
  for (const name of ['history', 'culture', 'museums', 'gardens', 'nightlife']) await page.getByRole('button', { name, exact: true }).click();
  const initialResponse = page.waitForResponse(r => r.url().endsWith('/api/guide/plan'));
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  const plan = await (await initialResponse).json() as GuidePlan;
  plan.interestCoverage = [
    { interest: 'museums', status: 'included', places: ['Provider Museum'] },
    { interest: 'gardens', status: 'included', places: ['Provider Garden'] },
    { interest: 'nightlife', status: 'not_scheduled', places: [], reason: 'Your day ends before evening nightlife can be scheduled (from 18:00 destination time). Extend Return by or deselect nightlife.' },
  ];
  let input: GuidePlanRequest | undefined;
  await page.route('**/api/guide/plan', async r => { input = r.request().postDataJSON(); await r.fulfill({ json: plan }); });
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  const coverage = page.getByRole('region', { name: 'Selected interest coverage', exact: true });
  await expect(coverage).toContainText('2/3 covered');
  await expect(coverage).toContainText('Included: museums · gardens');
  await expect(coverage).toContainText('Extend Return by');
  expect(input?.preferences.interests).toEqual(['museums', 'gardens', 'nightlife']);
  await coverage.screenshot({ path: `.tmp/interest-coverage-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check();
  await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
  await page.reload(); await expect(coverage).toContainText('2/3 covered');
  expect(state.inputs).toHaveLength(1);
});

test('comparison cards expose covered and omitted interests before choosing a plan', async ({ page }) => {
  await setup(page);
  const response = page.waitForResponse(r => r.url().endsWith('/api/guide/plan'));
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  const plan = await (await response).json() as GuidePlan;
  plan.interestCoverage = [{ interest: 'museums', status: 'included', places: ['Provider Museum'] }, { interest: 'nightlife', status: 'not_scheduled', places: [], reason: 'Nightlife does not fit the selected daytime window.' }];
  await page.route('**/api/guide/compare', r => r.fulfill({ json: { options: ['sightseeing', 'less_travel', 'relaxed'].map(style => ({ style, status: 'ready', plan })) } }));
  await page.getByRole('button', { name: 'Compare three plans', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'Compare three plans', exact: true });
  await expect(comparison.getByRole('region', { name: 'Selected interest coverage', exact: true })).toHaveCount(3);
  await expect(comparison.getByRole('article', { name: 'More sightseeing', exact: true })).toContainText('Not scheduled: nightlife');
  await comparison.getByRole('button', { name: 'Review More sightseeing', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toContainText('Nightlife does not fit');
  await page.getByRole('button', { name: 'temples', exact: true }).click();
  await expect(comparison).toHaveCount(0);
});
