let maps: Promise<void> | null = null;
let attempt = 0, authFailed = false;
const failures = new Set<(message: string) => void>();
const authorizationMessage = 'Google Maps authorization failed. Check billing, Maps JavaScript API and the browser key website restrictions, then reload the page.';
export function loadMaps(key: string) {
  if (!authFailed && typeof google !== 'undefined' && google.maps?.Map && google.maps.geometry?.encoding) return Promise.resolve();
  if (authFailed) return Promise.reject(new Error(authorizationMessage));
  if (!maps) maps = new Promise<void>((resolve, reject) => {
    const scope = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');
    const callback = `daywiseMapsReady${++attempt}`; let settled = false;
    const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timeout); delete scope[callback]; if (error) { maps = null; script.remove(); reject(error); } else resolve(); };
    const timeout = setTimeout(() => finish(new Error('The Google map took too long to load. Check your connection and retry.')), 15000);
    scope[callback] = () => { if (typeof google === 'undefined' || !google.maps?.Map || !google.maps.geometry?.encoding) finish(new Error('Google Maps returned an incomplete SDK. Retry loading the map.')); else finish(); };
    scope.gm_authFailure = () => { authFailed = true; failures.forEach(notify => notify(authorizationMessage)); finish(new Error(authorizationMessage)); };
    const params = new URLSearchParams({ key, callback, loading: 'async', libraries: 'geometry', v: 'quarterly' });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`; script.async = true;
    script.onerror = () => finish(new Error('The Google map is unavailable. Check your connection and retry.'));
    document.head.append(script);
  });
  return maps;
}

export function subscribeMapFailures(notify: (message: string) => void) { failures.add(notify); return () => { failures.delete(notify); }; }
export function mapAuthorizationFailed() { return authFailed; }
export { authorizationMessage };
