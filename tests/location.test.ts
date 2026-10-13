import { afterEach, expect, it, vi } from 'vitest';
import { readCurrentPosition, validatePosition } from '../apps/web/src/location';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const point = (patch: Partial<{ latitude: number; longitude: number; accuracy: number; timestamp: number }> = {}): GeolocationPosition => ({ coords: { latitude: 26.9124, longitude: 75.7873, accuracy: 25, ...patch }, timestamp: patch.timestamp ?? Date.now() }) as GeolocationPosition;
function browser(read: Geolocation['getCurrentPosition'] | undefined, secure = true) {
  vi.stubGlobal('window', { isSecureContext: secure }); vi.stubGlobal('navigator', { geolocation: read ? { getCurrentPosition: read } : undefined });
}
it('accepts a recent bounded location and rejects invalid coordinates, accuracy and observation time', () => {
  const now = Date.now(); expect(validatePosition(point({ timestamp: now }), now)).toEqual({ latitude: 26.9124, longitude: 75.7873, accuracyMeters: 25, observedAt: now });
  for (const patch of [{ latitude: 91 }, { longitude: -181 }, { accuracy: -1 }, { latitude: NaN }, { timestamp: now - 120001 }, { timestamp: now + 60001 }]) expect(() => validatePosition(point(patch), now)).toThrow('invalid or old');
});
it('requires a secure supported browser without attempting a location read', async () => {
  const read = vi.fn(); browser(read, false); await expect(readCurrentPosition()).rejects.toThrow('unavailable'); expect(read).not.toHaveBeenCalled();
  browser(undefined); await expect(readCurrentPosition()).rejects.toThrow('unavailable');
});
it('requests one fresh browser location with bounded options and no watcher', async () => {
  const read = vi.fn<Geolocation['getCurrentPosition']>((success) => success(point())); browser(read);
  await expect(readCurrentPosition()).resolves.toMatchObject({ latitude: 26.9124, accuracyMeters: 25 }); expect(read).toHaveBeenCalledTimes(1); expect(read.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
});
it('maps denial/unavailable/timeout and synchronous failures to manual recovery without leaking provider messages', async () => {
  for (const [code, text] of [[1, 'permission was denied'], [2, 'could not be determined'], [3, 'took too long']] as const) {
    browser((_success, failure) => failure!({ code, message: 'Private browser message' } as GeolocationPositionError));
    await expect(readCurrentPosition()).rejects.toThrow(text);
  }
  browser(() => { throw new Error('Private browser failure'); }); await expect(readCurrentPosition()).rejects.toThrow('Choose a starting point manually');
});
it('bounds even an unanswered permission request and ignores its late success callback', async () => {
  vi.useFakeTimers(); let respond!: PositionCallback; browser(success => { respond = success; });
  const reading = readCurrentPosition(), failure = expect(reading).rejects.toThrow('took too long');
  await vi.advanceTimersByTimeAsync(15000); await failure; respond(point()); expect(vi.getTimerCount()).toBe(0);
});
