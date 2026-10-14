import { expect, test, type Page } from '@playwright/test';
import { setup } from './helpers/live-guide';
const key = 'daywise-live-active-v1';
const savedTrip = (page: Page) => page.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
async function generate(page: Page) {
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  await expect.poll(async () => (await savedTrip(page))?.guideReview?.stops.length).toBeGreaterThan(0);
}
async function accept(page: Page) {
  await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check();
  await page.getByRole('button', { name: 'Accept this guided itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report your progress', exact: true })).toBeVisible();
  await expect.poll(async () => (await savedTrip(page))?.acceptedId).toBeTruthy();
}
test('phone refresh retains an accepted itinerary, price ranges and reported expenses without another lookup', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page, true);
  await page.getByText('Group, budget and food preferences', { exact: true }).click();
  await page.getByLabel('Budget currency', { exact: true }).selectOption('USD'); await page.getByLabel('Group budget', { exact: true }).fill('2000');
  await generate(page); await accept(page);
  await page.getByText('Add missing cost ranges', { exact: true }).click();
  await page.getByLabel('Additional food & drinks minimum', { exact: true }).fill('100'); await page.getByLabel('Additional food & drinks maximum', { exact: true }).fill('200');
  await page.getByLabel('Additional transport minimum', { exact: true }).fill('50'); await page.getByLabel('Additional transport maximum', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Apply price ranges', exact: true }).click();
  await expect(page.getByTestId('trip-price-range')).toHaveText('$150.00 – $300.00');
  await page.getByRole('button', { name: 'Trip budget', exact: true }).click();
  await page.getByRole('combobox', { name: 'Cost status', exact: true }).selectOption('actual');
  await page.getByLabel('Whole-category amount (USD)', { exact: true }).fill('123'); await page.getByRole('button', { name: 'Save category amount', exact: true }).click();
  await expect(page.getByTestId('reported-effective-total')).toContainText('$123.00');
  await page.getByRole('button', { name: 'Follow my day', exact: true }).click();
  const before = await savedTrip(page), times = await page.locator('.guide-timeline').allTextContents();
  const lookups: string[] = []; page.on('request', r => { if (/\/api\/(guide|locations\/(resolve|reverse|autocomplete))/.test(r.url())) lookups.push(r.url()); });
  await page.route('**/api/**', r => r.abort()); await page.reload();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
  expect(await page.locator('.guide-timeline').allTextContents()).toEqual(times); expect((await savedTrip(page)).acceptedId).toBe(before.acceptedId);
  await expect(page.getByTestId('trip-price-range')).toHaveText('$150.00 – $300.00'); expect(lookups).toEqual([]);
  await page.getByRole('button', { name: 'Trip budget', exact: true }).click(); await expect(page.getByTestId('reported-effective-total')).toContainText('$123.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/trip-tools-mobile.png', fullPage: true });
});
test('draft choices and guide notes survive refresh without replacing the accepted day', async ({ page }) => {
  await setup(page); await generate(page); await accept(page); const before = await savedTrip(page);
  await page.getByRole('button', { name: /My day plan/ }).click();
  await page.getByLabel('Private day name', { exact: true }).fill('Presentation day');
  await page.getByText('Cost estimates, breaks and guide notes', { exact: true }).click(); await page.getByRole('textbox', { name: 'Tell the guide what matters', exact: true }).fill('Private guide note');
  await expect.poll(async () => (await savedTrip(page))?.guideSaved.preferences.notes).toBe('Private guide note');
  await page.reload(); await expect(page.getByLabel('Private day name', { exact: true })).toHaveValue('Presentation day');
  await page.getByText('Cost estimates, breaks and guide notes', { exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Tell the guide what matters', exact: true })).toHaveValue('Private guide note');
  expect((await savedTrip(page)).accepted).toEqual(before.accepted);
  await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Refresh saved locations', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'View accepted route', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible(); expect((await savedTrip(page)).accepted).toEqual(before.accepted);
});
test('share preview hides private points, downloads exactly that copy and provides native sharing cancellation and clipboard fallback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (value: ShareData) => { (window as any).sharedTrip = value; if ((window as any).cancelShare) throw new DOMException('cancel', 'AbortError'); } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } });
  });
  await setup(page); await generate(page); const trip = await savedTrip(page);
  await page.getByRole('button', { name: 'Share trip', exact: true }).click(); const preview = page.getByRole('textbox', { name: 'Trip sharing preview', exact: true });
  const text = await preview.inputValue(); expect(text).not.toContain(trip.start.address); expect(text).not.toContain(trip.start.id); expect(text).toContain('query_place_id=');
  await expect(page.getByRole('checkbox', { name: 'Include starting and return locations', exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Copy trip', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Clipboard access is unavailable');
  await page.evaluate(() => { (window as any).cancelShare = true; }); await page.getByRole('button', { name: 'Open share options', exact: true }).click(); await expect(page.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => { (window as any).cancelShare = false; }); await page.getByRole('button', { name: 'Open share options', exact: true }).click();
  await expect(page.getByText('Trip copy shared.', { exact: true })).toBeVisible(); expect(await page.evaluate(() => (window as any).sharedTrip.text)).toBe(text);
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download trip', exact: true }).click();
  const download = await downloading; const { readFile } = await import('node:fs/promises'); expect(await readFile((await download.path())!, 'utf8')).toBe(text);
  await page.getByRole('checkbox', { name: 'Include starting and return locations', exact: true }).check(); expect(await preview.inputValue()).toContain(trip.start.address);
  await page.getByRole('checkbox', { name: 'Include price summary', exact: true }).uncheck(); expect(await preview.inputValue()).not.toContain('Group price estimate:');
});
test('delete cancels safely or removes the active trip and linked named preferences permanently', async ({ page }) => {
  await setup(page); await generate(page); await page.getByLabel('Private day name', { exact: true }).fill('Saved presentation');
  await page.getByRole('button', { name: 'Save day preferences', exact: true }).click(); await expect(page.getByText(/Private day preferences saved/)).toBeVisible();
  await page.evaluate(() => localStorage.setItem('unrelated-setting', 'keep'));
  await page.getByRole('button', { name: 'Delete local trip', exact: true }).click(); await page.getByRole('button', { name: 'Keep trip', exact: true }).click(); expect(await savedTrip(page)).not.toBeNull();
  await page.getByRole('button', { name: 'Delete local trip', exact: true }).click(); await page.getByRole('button', { name: 'Delete trip from this device', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); expect(await savedTrip(page)).toBeNull(); await page.reload(); expect(await savedTrip(page)).toBeNull();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toHaveCount(0); expect(await page.evaluate(() => localStorage.getItem('unrelated-setting'))).toBe('keep');
  await page.getByRole('button', { name: 'Saved plans', exact: true }).click(); await expect(page.locator('.saved-card')).toHaveCount(0);
});
test('local storage failures keep the previous trip, show retry and do not falsely report deletion', async ({ page }) => {
  await page.addInitScript(() => {
    const put = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function(k, v) { if (k === 'daywise-live-active-v1' && (window as any).blockTripWrites) throw new DOMException('full', 'QuotaExceededError'); return put.call(this, k, v); };
    Storage.prototype.removeItem = function(k) { if (k === 'daywise-live-active-v1' && (window as any).blockTripDeletes) throw new Error('denied'); return remove.call(this, k); };
  });
  await setup(page); await generate(page); const previous = await savedTrip(page);
  await page.evaluate(() => { (window as any).blockTripWrites = true; }); await page.getByLabel('Private day name', { exact: true }).fill('Failed name');
  await expect(page.getByRole('alert')).toContainText('Local saving failed'); expect((await savedTrip(page)).title).toBe(previous.title);
  await page.evaluate(() => { (window as any).blockTripWrites = false; }); await page.getByRole('button', { name: 'Retry local saving', exact: true }).click(); await expect.poll(async () => (await savedTrip(page)).title).toBe('Failed name');
  await page.evaluate(() => { (window as any).blockTripDeletes = true; }); await page.getByRole('button', { name: 'Delete local trip', exact: true }).click(); await page.getByRole('button', { name: 'Delete trip from this device', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be deleted'); expect(await savedTrip(page)).not.toBeNull();
  await page.evaluate(() => { (window as any).blockTripDeletes = false; }); await page.getByRole('button', { name: 'Delete trip from this device', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); expect(await savedTrip(page)).toBeNull();
});
test('malformed local data is preserved until explicit deletion', async ({ page }) => {
  await setup(page); await generate(page); await page.evaluate(k => localStorage.setItem(k, '{broken'), key); await page.reload();
  await expect(page.getByRole('alert')).toContainText('stored copy has been preserved'); expect(await page.evaluate(k => localStorage.getItem(k), key)).toBe('{broken');
  await page.getByRole('combobox', { name: 'Destination city', exact: true }).fill('query'); await page.getByRole('listbox', { name: 'Destination city suggestions', exact: true }).getByRole('button').first().click();
  expect(await page.evaluate(k => localStorage.getItem(k), key)).toBe('{broken');
  await page.getByRole('button', { name: 'Delete local trip', exact: true }).click(); await page.getByRole('button', { name: 'Delete trip from this device', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); expect(await savedTrip(page)).toBeNull();
});
test('expired saved estimates remain readable and cannot be silently accepted as fresh', async ({ page }) => {
  await setup(page); await generate(page); await accept(page);
  await page.evaluate(k => { const trip = JSON.parse(localStorage.getItem(k)!); for (const t of [trip.preview, trip.accepted, trip.guideReview?.itinerary, trip.acceptedGuide?.itinerary]) if (t) t.route.expiresAt = new Date(Date.now() - 1000).toISOString(); localStorage.setItem(k, JSON.stringify(trip)); }, key);
  await page.reload(); await expect(page.getByText(/original traffic estimate has expired/)).toBeVisible(); await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toContainText('Provider Museum');
  await expect(page.locator('[data-map-rendered=true]')).toBeVisible();
  await page.getByRole('button', { name: /My day plan/ }).click(); await page.getByRole('checkbox', { name: 'I will confirm unverified hours, costs, accessibility and food preparation before visiting', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Accept this guided itinerary', exact: true })).toBeDisabled();
});
test('cleared draft fields remain cleared after refresh and local deletion reaches another open tab', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Clear destination city', exact: true }).click();
  await page.getByRole('button', { name: 'Clear starting location', exact: true }).click();
  await page.getByLabel('Travel date', { exact: true }).fill('');
  await expect.poll(async () => (await savedTrip(page))?.date).toBe('');
  await page.reload(); await expect(page.getByRole('combobox', { name: 'Starting location', exact: true })).toHaveValue(''); expect((await savedTrip(page)).start).toBeNull();
  // A same-origin second tab using Delete local trip must not resurrect this tab's old copy.
  const other = await page.context().newPage(); await other.goto('/?live=1');
  await other.getByRole('button', { name: 'Delete local trip', exact: true }).click();
  await other.getByRole('button', { name: 'Delete trip from this device', exact: true }).click();
  await expect(other.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Local trip saving', exact: true })).toHaveCount(0); expect(await savedTrip(page)).toBeNull(); await other.close();
});
test('a successful clipboard copy contains exactly the reviewed itinerary', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as any).copiedTrip = text; } } }); });
  await setup(page); await generate(page); await page.getByRole('button', { name: 'Share trip', exact: true }).click();
  const text = await page.getByRole('textbox', { name: 'Trip sharing preview', exact: true }).inputValue(); await page.getByRole('button', { name: 'Copy trip', exact: true }).click();
  await expect(page.getByText('Trip copied. Paste it into the app you want to share with.', { exact: true })).toBeVisible(); expect(await page.evaluate(() => (window as any).copiedTrip)).toBe(text);
});
test('new draft price allowances cannot replace the accepted trip price, including after refresh', async ({ page }) => {
  const state = await setup(page); await page.getByText('Group, budget and food preferences', { exact: true }).click(); await page.getByLabel('Budget currency', { exact: true }).selectOption('USD'); await generate(page);
  const allowances = async (minimum: string, maximum: string) => {
    await page.getByText('Add missing cost ranges', { exact: true }).click();
    await page.getByLabel('Additional food & drinks minimum', { exact: true }).fill(minimum); await page.getByLabel('Additional food & drinks maximum', { exact: true }).fill(maximum);
    await page.getByRole('button', { name: 'Apply price ranges', exact: true }).click();
  };
  await allowances('10', '20'); await accept(page);
  await page.getByRole('button', { name: /My day plan/ }).click(); await page.getByText('Cost estimates, breaks and guide notes', { exact: true }).click();
  await page.getByLabel('Arrival buffer (minutes)', { exact: true }).fill('15'); await expect.poll(() => state.inputs.length).toBe(2);
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible(); await allowances('100', '200');
  await expect(page.getByTestId('trip-price-range')).toHaveText('$100.00 – $200.00');
  await page.getByRole('button', { name: 'Follow my day', exact: true }).click(); await expect(page.getByTestId('trip-price-range')).toHaveText('$10.00 – $20.00');
  await page.reload(); await expect(page.getByTestId('trip-price-range')).toHaveText('$10.00 – $20.00');
  await page.getByRole('button', { name: /My day plan/ }).click(); await expect(page.getByTestId('trip-price-range')).toHaveText('$100.00 – $200.00');
});
test('invalid ranges do not replace prices and deleting during planning cannot recreate the trip', async ({ page }) => {
  await setup(page); await page.getByText('Group, budget and food preferences', { exact: true }).click(); await page.getByLabel('Budget currency', { exact: true }).selectOption('USD'); await generate(page);
  await page.getByText('Add missing cost ranges', { exact: true }).click(); await page.getByLabel('Additional food & drinks minimum', { exact: true }).fill('200'); await page.getByLabel('Additional food & drinks maximum', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Apply price ranges', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('maximum must be at least'); await expect(page.getByTestId('trip-price-range')).toHaveText('$0.00 – $0.00');
  let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; }); let requested = false;
  await page.route('**/api/guide/plan', async r => { requested = true; await waiting; await r.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Delayed comparison unavailable.' } } }).catch(() => {}); });
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click(); await expect.poll(() => requested).toBe(true);
  await page.getByRole('button', { name: 'Delete local trip', exact: true }).click(); await page.getByRole('button', { name: 'Delete trip from this device', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); release();
  await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toHaveCount(0); expect(await savedTrip(page)).toBeNull(); await page.reload(); expect(await savedTrip(page)).toBeNull();
});
