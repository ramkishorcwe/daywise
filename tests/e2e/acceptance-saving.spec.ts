import { expect, test } from '@playwright/test';
import { setup } from './helpers/live-guide';
import { activeAcceptedTrip, savedAcceptedTrips } from './helpers/accepted-trips';
const key = 'daywise-live-active-v1';
async function accept(page: import('@playwright/test').Page) {
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check();
  await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
}

for (const destinationMode of ['starting_city', 'custom']) {
  test(`accepted trips saved with ${destinationMode} metadata reopen with separate location fields`, async ({ page }) => {
    const state = await setup(page);
    await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
    await accept(page);
    const endpoints = await page.evaluate(async ({ key, destinationMode, value }) => {
      value.destinationMode = destinationMode;
      localStorage.setItem(key, JSON.stringify(value));
      await new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('daywise-accepted-trips', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result, tx = db.transaction('trips', 'readwrite');
          tx.objectStore('trips').put(value);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
      });
      return { destination: value.accepted.destination, start: value.accepted.start, end: value.accepted.end };
    }, { key, destinationMode, value: await activeAcceptedTrip(page) });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'My day plan', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Destination city', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Starting location', exact: true })).toBeVisible();
    const restored = await activeAcceptedTrip(page); expect({ destination: restored.accepted.destination, start: restored.accepted.start, end: restored.accepted.end }).toEqual(endpoints);
    expect(state.inputs).toHaveLength(1);
    await page.getByRole('button', { name: 'Saved plans', exact: true }).click();
    await expect(page.locator('.saved-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Open saved itinerary', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Whole journey map', exact: true })).toBeVisible();
  });
}
test('form edits and generated previews do not save; acceptance saves one itinerary with its prices', async ({ page }) => {
  await setup(page, false, true);
  await expect(page.getByRole('button', { name: 'Trip budget', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save day preferences', exact: true })).toHaveCount(0);
  expect(await page.evaluate(k => localStorage.getItem(k), key)).toBeNull();
  await page.getByLabel('Private day name', { exact: true }).fill('Accepted presentation');
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  expect(await page.evaluate(k => localStorage.getItem(k), key)).toBeNull(); expect(await savedAcceptedTrips(page)).toHaveLength(0);
  await page.getByRole('button', { name: 'Saved plans', exact: true }).click(); await expect(page.locator('.saved-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'My day plan', exact: true }).click(); await accept(page);
  await expect.poll(async () => (await savedAcceptedTrips(page)).length).toBe(1);
  const accepted = await page.evaluate(k => localStorage.getItem(k), key);
  await page.getByRole('button', { name: 'My day plan', exact: true }).click();
  await page.getByLabel('Private day name', { exact: true }).fill('Unaccepted draft');
  await page.getByRole('button', { name: 'gardens', exact: true }).click();
  await page.waitForTimeout(1200); expect(await page.evaluate(k => localStorage.getItem(k), key)).toBe(accepted);
  await page.getByRole('button', { name: 'Saved plans', exact: true }).click(); await expect(page.locator('.saved-card')).toHaveCount(1);
  await expect(page.locator('.saved-card')).toContainText('Accepted presentation'); await expect(page.locator('.saved-card')).not.toContainText('Unaccepted draft');
  await page.getByRole('button', { name: 'Open saved itinerary', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Trip price summary', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Whole journey map', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Saved plans', exact: true }).click(); await expect(page.locator('.saved-card')).toHaveCount(1);
});
test('reaccepting the same itinerary does not duplicate it; accepting a new trip keeps both saved copies', async ({ page }) => {
  await setup(page); await page.getByLabel('Private day name', { exact: true }).fill('First accepted trip');
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await accept(page);
  const first = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!).acceptedId, key);
  await page.getByRole('button', { name: 'My day plan', exact: true }).click(); await accept(page);
  expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)!).acceptedId, key)).toBe(first);
  await page.getByRole('button', { name: 'My day plan', exact: true }).click();
  await page.getByLabel('Private day name', { exact: true }).fill('Second accepted trip');
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await accept(page);
  await page.getByRole('button', { name: 'Saved plans', exact: true }).click(); await expect(page.locator('.saved-card')).toHaveCount(2);
  const firstCard = page.locator('.saved-card').filter({ hasText: 'First accepted trip' });
  await firstCard.getByRole('button', { name: 'Delete First accepted trip', exact: true }).click();
  await page.getByRole('button', { name: 'Keep trip', exact: true }).click(); await expect(page.locator('.saved-card')).toHaveCount(2);
  await firstCard.getByRole('button', { name: 'Delete First accepted trip', exact: true }).click();
  await page.getByRole('button', { name: 'Delete trip from this device', exact: true }).click(); await expect(page.locator('.saved-card')).toHaveCount(1);
  await expect(page.locator('.saved-card')).toContainText('Second accepted trip');
  await page.getByRole('button', { name: 'Open saved itinerary', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
});
test('an old unaccepted auto-saved draft is not shown as a saved itinerary', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await accept(page);
  const legacy = await activeAcceptedTrip(page);
  await page.evaluate(async ({ key, raw }) => { const session = JSON.parse(sessionStorage.getItem('daywise-api-session')!); await fetch(`/api/itineraries/${raw.acceptedId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.token}` } }); raw.accepted = null; raw.acceptedGuide = null; raw.acceptedId = null; localStorage.setItem(key, JSON.stringify(raw)); }, { key, raw: legacy });
  // Keep the legacy draft on disk while removing this test's accepted library record.
  await page.evaluate(() => new Promise<void>((resolve, reject) => { const opening = indexedDB.open('daywise-accepted-trips', 1); opening.onerror = () => reject(opening.error); opening.onsuccess = () => { const db = opening.result, tx = db.transaction('trips', 'readwrite'); tx.objectStore('trips').clear(); tx.oncomplete = () => { db.close(); resolve(); }; }; }));
  await page.reload(); await expect(page.getByRole('combobox', { name: 'Destination city', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Saved plans', exact: true }).click(); await expect(page.locator('.saved-card')).toHaveCount(0);
  expect(await page.evaluate(k => !!localStorage.getItem(k), key)).toBe(true);
});
