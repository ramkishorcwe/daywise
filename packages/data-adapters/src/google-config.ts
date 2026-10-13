export const serverGoogleVariables = ['GOOGLE_PLACES_API_KEY', 'GOOGLE_GEOCODING_API_KEY', 'GOOGLE_TIME_ZONE_API_KEY', 'GOOGLE_ROUTES_API_KEY'] as const;
export function googleKeyIsValid(value: string | undefined): boolean { return !!value && /^AIza[A-Za-z0-9_-]{35}$/.test(value); }
export function validateGoogleConfiguration(env: Record<string, string | undefined>) {
  const issues: string[] = [], keys: Record<string, string> = {};
  for (const field of [...serverGoogleVariables, 'VITE_GOOGLE_MAPS_BROWSER_KEY']) {
    const value = env[field] ?? '';
    keys[field] = googleKeyIsValid(value) ? value : '';
    if (value && !keys[field]) issues.push(`${field} has an invalid API-key format. Use the key value only, without a credential file, link or placeholder.`);
  }
  const browser = keys.VITE_GOOGLE_MAPS_BROWSER_KEY;
  if (browser && serverGoogleVariables.some(field => keys[field] === browser)) {
    issues.push('Use a distinct website-restricted browser map key; a private server key must never be used in VITE_GOOGLE_MAPS_BROWSER_KEY.');
    for (const field of [...serverGoogleVariables, 'VITE_GOOGLE_MAPS_BROWSER_KEY']) keys[field] = '';
  }
  return { keys, issues };
}
