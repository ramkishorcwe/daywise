export type LocationPreview = { latitude: number; longitude: number; accuracyMeters: number; observedAt: number };
export function validatePosition(position: GeolocationPosition, now = Date.now()): LocationPreview {
  const { latitude, longitude, accuracy } = position.coords, observedAt = position.timestamp;
  if (![latitude, longitude, accuracy, observedAt, now].every(Number.isFinite) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || accuracy < 0 || observedAt < now - 120000 || observedAt > now + 60000) throw new Error('The browser returned an invalid or old location. Try again or choose a starting point manually.');
  return { latitude, longitude, accuracyMeters: accuracy, observedAt };
}
export function readCurrentPosition(): Promise<LocationPreview> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) { reject(new Error('Location is unavailable on this connection. Use HTTPS in production or localhost for development, or choose a starting point manually.')); return; }
    if (!navigator.geolocation) { reject(new Error('Location is unavailable in this browser. Search for a starting point manually.')); return; }
    let settled = false;
    const timer = setTimeout(() => finish(new Error('Location took too long. Retry or choose a starting point manually.')), 15000);
    function finish(error: Error | null, preview?: LocationPreview) { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(preview!); }
    try {
      navigator.geolocation.getCurrentPosition(position => {
        try { finish(null, validatePosition(position)); } catch (error) { finish(error instanceof Error ? error : new Error('Location could not be read. Choose manually.')); }
      }, error => finish(new Error(error.code === 1 ? 'Location permission was denied. Allow location access in your browser settings or choose a starting point manually.' : error.code === 3 ? 'Location took too long. Retry or choose a starting point manually.' : 'Your location could not be determined. Retry or choose a starting point manually.')), { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
    } catch { finish(new Error('Location could not be read. Choose a starting point manually.')); }
  });
}
