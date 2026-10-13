import { expect, test } from '@playwright/test';

test('a delayed device write stays pending until the confirmed day is durably saved', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Confirm this plan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled();

  // A real IndexedDB transaction blocks later writes, as busy device storage can.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open('daywise-m1', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction('sessions', 'readwrite');
      let holding = true;
      (window as Window & { releaseSave?: () => void }).releaseSave = () => { holding = false; };
      transaction.oncomplete = () => db.close();
      const keepAlive = () => {
        const read = transaction.objectStore('sessions').get('__save_barrier__');
        read.onsuccess = () => { if (holding) keepAlive(); };
      };
      keepAlive(); resolve();
    };
  }));

  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving draft…', exact: true })).toBeDisabled();
  await expect(page.getByText('Your draft and confirmed plan are saved on this device.', { exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as Window & { releaseSave?: () => void }).releaseSave!());
  await expect(page.getByText('Your draft and confirmed plan are saved on this device.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled();
});
