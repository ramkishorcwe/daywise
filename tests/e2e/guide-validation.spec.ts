import { expect, test } from '@playwright/test';
import { setup } from './helpers/live-guide';

test('missing currency names and highlights the exact field, opens the section and makes no provider request', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page);
  await page.getByText('Group, budget and food preferences', { exact: true }).click(); await page.getByLabel('Group budget', { exact: true }).fill('1000');
  await page.getByText('Group, budget and food preferences', { exact: true }).click();
  const requests: string[] = []; page.on('request', r => { if (r.url().includes('/api/guide/')) requests.push(r.url()); });
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Budget currency: Select a budget currency');
  await expect(page.getByLabel('Budget currency', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Go to Budget currency', exact: true }).click(); await expect(page.getByLabel('Budget currency', { exact: true })).toBeFocused();
  expect(requests).toEqual([]); await page.getByLabel('Budget currency', { exact: true }).selectOption('INR'); await expect(page.locator('.guide-validation')).toHaveCount(0);
  await expect(page.getByLabel('Budget currency', { exact: true })).not.toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('solo mismatch identifies Group type and gives an exact correction', async ({ page }) => {
  await setup(page); await page.getByRole('combobox', { name: 'Group type', exact: true }).selectOption('solo'); await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Solo requires exactly one traveler'); await page.getByRole('button', { name: 'Go to Group type', exact: true }).click(); await expect(page.getByRole('combobox', { name: 'Group type', exact: true })).toBeFocused();
  await page.getByRole('combobox', { name: 'Group type', exact: true }).selectOption('friends'); await expect(page.locator('.guide-validation')).toHaveCount(0);
});
test('invalid budget and empty buffer each identify their control and preserve an accepted itinerary', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check(); await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  const original = await page.locator('.guide-stop-content').allTextContents(); await page.getByRole('button', { name: /My day plan/ }).click();
  await page.getByText('Group, budget and food preferences', { exact: true }).click(); await page.getByLabel('Group budget', { exact: true }).fill('bad'); await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page.locator('.guide-validation')).toContainText('Group budget: Enter a valid amount'); await page.getByRole('button', { name: 'Go to Group budget', exact: true }).click(); await expect(page.getByLabel('Group budget', { exact: true })).toBeFocused();
  await page.getByLabel('Group budget', { exact: true }).fill(''); await page.getByText('Cost estimates, breaks and guide notes', { exact: true }).click(); await page.getByLabel('Arrival buffer (minutes)', { exact: true }).fill('');
  await page.getByText('Cost estimates, breaks and guide notes', { exact: true }).click(); await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect(page.locator('.guide-validation')).toContainText('Arrival buffer (minutes): Enter a whole number from 0 to 45');
  await page.getByRole('button', { name: 'Go to Arrival buffer (minutes)', exact: true }).click(); await expect(page.getByLabel('Arrival buffer (minutes)', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Follow my day', exact: true }).click(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible(); expect(await page.locator('.guide-stop-content').allTextContents()).toEqual(original);
});
