import { expect, test } from '@playwright/test';

test('location is read only on tap, shown with accuracy, and never becomes a fictional route source or saved data', async ({ page, context }) => {
  await context.setGeolocation({ latitude: 26.9124, longitude: 75.7873, accuracy: 25 }); await context.grantPermissions(['geolocation']);
  await page.addInitScript(() => { const state = window as unknown as { locationReads: number }; state.locationReads = 0; const read = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation); navigator.geolocation.getCurrentPosition = (success, failure, options) => { state.locationReads++; read(success, failure, options); }; });
  const requests: string[] = []; page.on('request', request => { if (request.url().includes('/api/')) requests.push(request.url()); });
  await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const reads = () => page.evaluate(() => (window as unknown as { locationReads: number }).locationReads);
  expect(await reads()).toBe(0); await page.getByRole('button', { name: 'Change starting point', exact: true }).click(); expect(await reads()).toBe(0);
  await expect(page.getByRole('region', { name: 'Choose your starting point', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Use my current location', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Location captured', exact: true })).toBeVisible();
  await expect(page.getByLabel('Captured coordinates', { exact: true })).toHaveText('26.91240, 75.78730');
  await expect(page.locator('.location-preview')).toContainText('about 25 m'); expect(await reads()).toBe(1);
  await expect(page.getByRole('button', { name: 'Your preferences', exact: true })).toBeDisabled();
  await expect(page.locator('.location-availability')).toContainText('Real-location planning is not connected');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Change starting point', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Location captured', exact: true })).toHaveCount(0); expect(await reads()).toBe(1);
  await expect(page.getByLabel('Starting point', { exact: true })).toHaveValue('jaipur-test-stay'); await page.keyboard.press('Escape');
  const saved = await page.evaluate(() => new Promise<unknown[]>((resolve, reject) => { const opening = indexedDB.open('daywise-m1', 1); opening.onerror = () => reject(opening.error); opening.onsuccess = () => { const db = opening.result, read = db.transaction('sessions').objectStore('sessions').getAll(); read.onsuccess = () => { db.close(); resolve(read.result); }; }; }));
  expect(JSON.stringify(saved)).not.toMatch(/26\.9124|75\.7873|accuracyMeters|observedAt/); expect(requests).toEqual([]);
});

test('permission denial recovers through manual search and explicit separate return selection', async ({ page }) => {
  await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = (_success, failure) => failure!({ code: 1 } as GeolocationPositionError); });
  await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click();
  await page.getByRole('button', { name: 'Change starting point', exact: true }).click(); await page.getByRole('button', { name: 'Use my current location', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('permission was denied');
  await page.getByRole('button', { name: 'Choose a place', exact: true }).click(); await page.getByLabel('Address or place name', { exact: true }).fill('station');
  await page.locator('.test-start-matches').getByRole('button', { name: /Demo station/ }).click();
  await expect(page.getByLabel('Starting point', { exact: true })).toHaveValue('jaipur-test-station'); await expect(page.getByRole('checkbox', { name: 'Return to the same place', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Return to the same place', exact: true }).uncheck();
  await expect(page.getByLabel('Return point', { exact: true })).toHaveValue('jaipur-test-stay');
  await page.getByRole('button', { name: 'Your preferences', exact: true }).click(); await page.getByRole('button', { name: 'Build my day', exact: true }).click();
  await expect(page.locator('.start-point')).toContainText('Start at Demo station'); await expect(page.locator('.end-point')).toContainText('Back at Demo stay');
  await expect(page.getByText('Your confirmed plan is safe.', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
});

test('late location callbacks cannot override manual choices or a new destination', async ({ page }) => {
  await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = success => { (window as unknown as { deliverLocation: PositionCallback }).deliverLocation = success; }; });
  await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).waitFor(); await page.getByRole('button', { name: 'Change starting point', exact: true }).click(); await page.getByRole('button', { name: 'Use my current location', exact: true }).click();
  await page.getByRole('button', { name: 'Choose a place', exact: true }).click(); await page.locator('.test-start-matches').getByRole('button', { name: /Demo station/ }).click();
  const deliver = () => page.evaluate(() => (window as unknown as { deliverLocation: PositionCallback }).deliverLocation({ coords: { latitude: 26.9, longitude: 75.8, accuracy: 10 }, timestamp: Date.now() } as GeolocationPosition));
  await deliver(); await expect(page.getByLabel('Starting point', { exact: true })).toHaveValue('jaipur-test-station'); await expect(page.getByRole('heading', { name: 'Location captured', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use my current location', exact: true }).click(); await page.getByLabel('Destination', { exact: true }).selectOption('harbor-test'); await deliver();
  await expect(page.getByLabel('Starting point', { exact: true })).toHaveValue('harbor-test-stay'); await expect(page.getByRole('heading', { name: 'Location captured', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Your preferences', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape'); await expect(page.getByRole('combobox', { name: 'Destination city', exact: true })).toHaveValue('jaipur-test');
});

test('any typed address stays an unlooked-up preview and phone recovery preserves the accepted plan', async ({ page }) => {
  const requests: string[] = []; page.on('request', request => { if (request.url().includes('/api/')) requests.push(request.url()); });
  await page.setViewportSize({ width: 320, height: 760 }); await page.goto('/'); await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click();
  const times = await page.locator('.stop-time').allTextContents();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Change starting point', exact: true }).click(); await page.getByRole('button', { name: 'Choose a place', exact: true }).click();
  await page.getByLabel('Address or place name', { exact: true }).fill('My hotel at 42 Example Street, another city');
  await expect(page.getByText('This place needs connected address lookup. No real-world search has been performed.', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Your preferences', exact: true })).toBeDisabled();
  expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Choose a test starting point', exact: true }).click(); await expect(page.getByRole('button', { name: 'Your preferences', exact: true })).toBeEnabled(); await page.keyboard.press('Escape');
  expect(await page.locator('.stop-time').allTextContents()).toEqual(times); await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled(); expect(requests).toEqual([]);
});
