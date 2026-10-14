import { expect, test } from '@playwright/test';
import { setup } from './helpers/live-guide';

for (const width of [390, 1440]) {
  test(`multiple interests toggle independently and reach planning at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await setup(page);
    const interests = page.getByRole('group', { name: 'Your interests', exact: true });
    const chip = (name: string) => interests.getByRole('button', { name, exact: true });
    await expect(chip('history')).toHaveAttribute('aria-pressed', 'true');
    await chip('forts').click(); await chip('palaces').click(); await chip('gardens').click();
    await chip('history').click();
    await chip('museums').focus(); await page.keyboard.press('Space');
    for (const name of ['culture', 'forts', 'palaces', 'gardens', 'museums']) {
      await expect(chip(name)).toHaveAttribute('aria-pressed', 'true');
      await expect(chip(name).locator('.interest-check')).toHaveText('✓');
    }
    await expect(chip('history')).toHaveAttribute('aria-pressed', 'false');
    await expect(chip('forts')).toHaveCSS('background-color', 'rgb(36, 110, 91)');
    await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
    await expect.poll(() => state.inputs.length).toBe(1);
    expect(state.inputs[0].preferences.interests).toEqual(['culture', 'forts', 'palaces', 'gardens', 'museums']);
    await expect(page.getByRole('region', { name: 'Guided itinerary review', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
