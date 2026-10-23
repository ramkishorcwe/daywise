import { expect, test, type Page } from '@playwright/test';
import { setup } from './helpers/live-guide';
import { activeAcceptedTrip, savedAcceptedTrips } from './helpers/accepted-trips';
const synced = (page: Page) => expect(page.getByText('Accepted itinerary saved to database · ID kept on this device', { exact: true })).toBeVisible();
async function accept(page: Page, name: string, wait = true) {
  await page.getByLabel('Private day name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check();
  await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Opened trip', exact: true })).toContainText(name);
  if (wait) await synced(page);
}
async function nextTrip(page: Page, date: string) {
  await page.getByRole('button', { name: 'New trip', exact: true }).click();
  for (const label of ['Destination city', 'Starting location']) {
    await page.getByRole('combobox', { name: label, exact: true }).fill('search');
    await page.getByRole('listbox', { name: `${label} suggestions` }).getByRole('button').first().click();
  }
  await page.getByLabel('Travel date', { exact: true }).fill(date);
}

for (const width of [390, 1440]) test(`earlier trips appear during a pending save and following identifies the opened trip at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await setup(page);
  await accept(page, 'First saved adventure');
  const first = await activeAcceptedTrip(page);
  await nextTrip(page, state.inputs[0].date);
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/itineraries/**', async route => { if (route.request().method() === 'PUT') await hold; return route.fallback(); });
  try {
    await accept(page, 'Second saved adventure', false);
    await expect(page.getByText('Saving accepted itinerary to database…', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Saved trips', exact: true }).click();
    await expect(page.getByText('Loading remaining trips…', { exact: true })).toBeVisible();
    await expect(page.locator('.saved-card')).toHaveCount(2);
    await expect(page.locator('.saved-card').filter({ hasText: 'First saved adventure' })).toBeVisible();
    await expect(page.locator('.saved-card').filter({ hasText: 'Second saved adventure' })).toContainText('Opened trip');
    await expect(page.getByRole('heading', { name: 'No accepted itineraries saved yet.', exact: true })).toHaveCount(0);
    await page.getByRole('region', { name: 'Saved itineraries', exact: true }).screenshot({ path: `.tmp/saved-library-loading-${width}.png` });
    const saved = page.waitForResponse(response => response.url().includes('/api/itineraries/') && response.request().method() === 'PUT');
    // An already-available trip remains openable while the newer trip is still saving.
    await page.locator('.saved-card').filter({ hasText: 'First saved adventure' }).getByRole('button', { name: 'Open saved itinerary', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Opened trip', exact: true })).toContainText('First saved adventure');
    release();
    expect((await saved).status()).toBe(200);
    await page.getByRole('button', { name: 'Saved trips', exact: true }).click();
    await expect(page.getByText('Loading remaining trips…', { exact: true })).toHaveCount(0);
    await expect(page.locator('.saved-card')).toHaveCount(2);
  } finally { release(); }

  await page.locator('.saved-card').filter({ hasText: 'First saved adventure' }).getByRole('button', { name: 'Open saved itinerary', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Opened trip', exact: true })).toContainText('First saved adventure');
  await page.getByRole('button', { name: 'Follow this trip', exact: true }).click();
  const progress = page.getByRole('region', { name: 'Trip progress', exact: true });
  await expect(progress).toBeFocused(); await expect(progress).toContainText('Progress for First saved adventure');
  await page.clock.setFixedTime(new Date(Date.parse(first.accepted.route.departureTime) + 3600000));
  await page.getByRole('combobox', { name: 'Completed visits', exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Record visit progress', exact: true }).click();
  await expect.poll(async () => (await activeAcceptedTrip(page)).progress?.completedPlaceIds.length).toBe(1);
  await page.getByRole('button', { name: 'Saved trips', exact: true }).click();
  await expect(page.locator('.saved-card').filter({ hasText: 'First saved adventure' })).toContainText('Opened trip');
  await page.locator('.saved-card').filter({ hasText: 'Second saved adventure' }).getByRole('button', { name: 'Open saved itinerary', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Opened trip', exact: true })).toContainText('Second saved adventure');
  await page.getByRole('button', { name: 'Follow this trip', exact: true }).click();
  await expect(progress).toContainText('Progress for Second saved adventure');
  await expect(page.getByRole('combobox', { name: 'Completed visits', exact: true })).toHaveValue('0');
  const stored = await savedAcceptedTrips(page);
  expect(stored.find(trip => trip.acceptedId === first.acceptedId).progress.acceptedId).toBe(first.acceptedId);
  expect(stored.find(trip => trip.acceptedId !== first.acceptedId).progress).toBeUndefined();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Opened trip', exact: true })).toContainText('Second saved adventure');
  expect(state.inputs).toHaveLength(2);
});

test('loading never looks empty and one unavailable database trip does not hide the other trips', async ({ page }) => {
  const state = await setup(page); await accept(page, 'Available database trip');
  const original = await activeAcceptedTrip(page);
  const copies = await page.evaluate(async original => {
    const session = JSON.parse(sessionStorage.getItem('daywise-api-session')!);
    const rows = ['Temporarily unavailable trip', 'Another database trip'].map(title => ({ ...original, acceptedId: crypto.randomUUID(), title }));
    for (const trip of rows) { const response = await fetch(`/api/itineraries/${trip.acceptedId}`, { method: 'PUT', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ trip, create: true }) }); if (!response.ok) throw Error('Test trip could not be created'); }
    return rows.map(trip => trip.acceptedId);
  }, original);
  await page.getByRole('button', { name: 'New trip', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Destination city', exact: true })).toHaveValue('');
  await page.evaluate(() => new Promise<void>((resolve, reject) => { const open = indexedDB.open('daywise-accepted-trips', 1); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction('trips', 'readwrite'); tx.objectStore('trips').clear(); tx.oncomplete = () => { db.close(); resolve(); }; }; }));
  let releaseList!: () => void, releaseDetails!: () => void, unavailable = true;
  const listGate = new Promise<void>(resolve => { releaseList = resolve; }), detailsGate = new Promise<void>(resolve => { releaseDetails = resolve; });
  await page.route('**/api/itineraries', async route => { await listGate; return route.fallback(); });
  await page.route('**/api/itineraries/**', async route => {
    if (route.request().method() === 'GET' && route.request().url().endsWith(copies[0]) && unavailable) return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Test-only temporary interruption.' } } });
    if (route.request().method() === 'GET' && route.request().url().endsWith(copies[1])) await detailsGate;
    return route.fallback();
  });
  try {
    await page.getByRole('button', { name: 'Saved trips', exact: true }).click();
    await expect(page.getByText('Loading remaining trips…', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No accepted itineraries saved yet.', exact: true })).toHaveCount(0);
    releaseList();
    await expect(page.locator('.saved-card').filter({ hasText: 'Available database trip' })).toBeVisible();
    await expect(page.getByText('Loading remaining trips…', { exact: true })).toBeVisible();
    releaseDetails();
    await expect(page.locator('.saved-card')).toHaveCount(2);
    await expect(page.getByText('Loading remaining trips…', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('HTTP 503');
    unavailable = false;
    await page.getByRole('button', { name: 'Refresh saved days', exact: true }).click();
    await expect(page.locator('.saved-card')).toHaveCount(3);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(state.inputs).toHaveLength(1);
  } finally { releaseList(); releaseDetails(); }
});
