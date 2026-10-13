import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const webPort = process.env.WEB_PORT ?? '5174', apiPort = process.env.API_PORT ?? '3002';
const webUrl = `http://127.0.0.1:${webPort}`, apiUrl = `http://127.0.0.1:${apiPort}`;
const testEnv = { CI: 'true', NODE_ENV: 'development', WEB_PORT: webPort, API_PORT: apiPort, WEB_ORIGIN: webUrl, LOCAL_DATA_DIR: process.env.LOCAL_DATA_DIR ?? resolve(`.tmp/release-api-${randomUUID()}`), PROVIDER_DAILY_LIMIT: '0', AI_DAILY_LIMIT: '0', GOOGLE_PLACES_API_KEY: '', GOOGLE_GEOCODING_API_KEY: '', GOOGLE_TIME_ZONE_API_KEY: '', GOOGLE_ROUTES_API_KEY: '', VITE_GOOGLE_MAPS_BROWSER_KEY: '' };
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 2,
  expect: { timeout: 15000 },
  use: { baseURL: webUrl, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'npm run dev', url: webUrl, reuseExistingServer: false, env: { ...testEnv, VITE_ENABLE_FIXTURE_UI: 'true' } },
    { command: 'node --import tsx scripts/e2e-api.ts', url: `${apiUrl}/api/health`, reuseExistingServer: false, env: testEnv },
  ],
});
