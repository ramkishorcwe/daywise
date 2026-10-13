import { expect, it } from 'vitest';
import { googleKeyIsValid, serverGoogleVariables, validateGoogleConfiguration } from '../packages/data-adapters/src/google-config';
const server = `AIza${'a'.repeat(35)}`, browser = `AIza${'b'.repeat(35)}`; // Synthetic keys; never sent upstream.
it('keeps absent optional Google credentials disabled without invented values', () => {
  const result = validateGoogleConfiguration({}); expect(result.issues).toEqual([]); expect(Object.values(result.keys).every(value => value === '')).toBe(true);
});
it('supports one server key across the four APIs and a distinct browser key', () => {
  const result = validateGoogleConfiguration({ ...Object.fromEntries(serverGoogleVariables.map(field => [field, server])), VITE_GOOGLE_MAPS_BROWSER_KEY: browser });
  expect(result.issues).toEqual([]); expect(result.keys.GOOGLE_ROUTES_API_KEY).toBe(server); expect(result.keys.VITE_GOOGLE_MAPS_BROWSER_KEY).toBe(browser);
});
it('rejects malformed credentials with field-only diagnostics and no credential values', () => {
  for (const value of ['YOUR_SERVER_KEY', `${server}\\`, `https://example.com/${server}`, ` ${server}`, '-----BEGIN PRIVATE KEY-----']) {
    expect(googleKeyIsValid(value)).toBe(false);
    const result = validateGoogleConfiguration({ GOOGLE_PLACES_API_KEY: value }); expect(result.keys.GOOGLE_PLACES_API_KEY).toBe(''); expect(result.issues.join(' ')).toContain('GOOGLE_PLACES_API_KEY'); expect(result.issues.join(' ')).not.toContain(value);
  }
});
it('disables shared public/private keys without disclosing them', () => {
  const result = validateGoogleConfiguration({ GOOGLE_PLACES_API_KEY: server, VITE_GOOGLE_MAPS_BROWSER_KEY: server }); expect(result.issues.join(' ')).toContain('distinct'); expect(Object.values(result.keys).every(value => !value)).toBe(true); expect(result.issues.join(' ')).not.toContain(server);
});
