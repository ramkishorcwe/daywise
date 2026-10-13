import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, sep } from 'node:path';
import { googleKeyIsValid, serverGoogleVariables } from './packages/data-adapters/src/google-config.ts';
const isolatedFixtureTest = process.env.CI === 'true' && process.env.VITE_ENABLE_FIXTURE_UI === 'true' && !!process.env.LOCAL_DATA_DIR?.startsWith(resolve('.tmp') + sep + 'release-api-');
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, resolve('.'), ''), ...process.env };
  const browserKey = env.VITE_GOOGLE_MAPS_BROWSER_KEY;
  if (browserKey && !googleKeyIsValid(browserKey)) throw new Error('VITE_GOOGLE_MAPS_BROWSER_KEY has an invalid API-key format. Correct or clear it before starting/building the web app.');
  if (browserKey && serverGoogleVariables.some(field => env[field] === browserKey)) throw new Error('Use separate server and browser Google Maps keys. A server key cannot be exposed in VITE_GOOGLE_MAPS_BROWSER_KEY.');
  return {
  root: 'apps/web',
  envDir: '../..',
  plugins: [react()],
  define: { 'import.meta.env.VITE_ENABLE_FIXTURE_UI': JSON.stringify(isolatedFixtureTest ? 'true' : 'false') },
  server: { port: Number(env.WEB_PORT ?? 5173), strictPort: true, fs: { deny: ['.env', '.env.*', '**/secrets.txt', '**/*[cC]redential*.txt', '*.{crt,pem}', '**/.git/**', '**/.local/**', '**/.tmp/**', '**/catalogs/private/**'] }, proxy: { '/api': { target: `http://127.0.0.1:${env.API_PORT ?? 3001}`, changeOrigin: false } } },
  build: { outDir: '../../dist', emptyOutDir: true },
}; });
