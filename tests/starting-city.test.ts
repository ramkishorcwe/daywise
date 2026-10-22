import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SelectedLocation } from '../packages/contracts/src/locations';
import { exactStartingPoint, resolveStartingCity } from '../apps/web/src/starting-city';
import { selectLocation } from '../apps/web/src/location-api';
vi.mock('../apps/web/src/location-api', () => ({ selectLocation: vi.fn() }));
const city = { placeId: 'test-provider-city', name: 'Test city', countryCode: 'GB' };
const point = (): SelectedLocation => ({ id: randomUUID(), placeId: 'test-provider-hotel', provider: 'google', source: 'search', name: 'Test hotel', address: 'Test provider address', city, coordinates: { latitude: 51.5, longitude: -.1 }, types: ['lodging'], fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1800000).toISOString(), persistence: 'memory_only', receiptStatus: 'registered' });
beforeEach(() => vi.resetAllMocks());
it('resolves verified city identity and timezone while leaving the exact starting coordinates unchanged', async () => {
  const start = point(), original = structuredClone(start), destination = { ...point(), placeId: city.placeId, name: city.name, types: ['locality'], timezone: 'Europe/London', coordinates: { latitude: 51.7, longitude: .2 } };
  vi.mocked(selectLocation).mockResolvedValue(destination);
  const signal = new AbortController().signal;
  expect(await resolveStartingCity(start, signal)).toEqual(destination); expect(start).toEqual(original);
  expect(selectLocation).toHaveBeenCalledWith(city.placeId, expect.any(String), true, signal);
  expect(start.coordinates).not.toEqual(destination.coordinates);
});
it('accepts actual GPS/map coordinates but never substitutes a searched city centre for an exact start', () => {
  for (const type of ['locality', 'postal_town', 'country', 'administrative_area_level_1', 'administrative_area_level_2', 'administrative_area_level_3']) expect(exactStartingPoint({ ...point(), types: [type, 'political'] })).toBe(false);
  expect(exactStartingPoint(point())).toBe(true); expect(exactStartingPoint({ ...point(), source: 'pin', types: ['locality'] })).toBe(true); expect(exactStartingPoint(null)).toBe(false);
});
it('unknown/unregistered city evidence and broad city selections do not trigger speculative provider searches', async () => {
  for (const start of [{ ...point(), city: null }, { ...point(), receiptStatus: 'local' as const }, { ...point(), types: ['locality'] }]) await expect(resolveStartingCity(start, new AbortController().signal)).rejects.toThrow();
  expect(selectLocation).not.toHaveBeenCalled();
});
it('rejects different returned localities or missing timezones and propagates provider failures without a fallback city', async () => {
  const start = point();
  vi.mocked(selectLocation).mockResolvedValue({ ...point(), city: { ...city, placeId: 'different-test-city' }, timezone: 'Europe/London' });
  await expect(resolveStartingCity(start, new AbortController().signal)).rejects.toThrow('consistently');
  vi.mocked(selectLocation).mockResolvedValue(point()); await expect(resolveStartingCity(start, new AbortController().signal)).rejects.toThrow('timezone');
  vi.mocked(selectLocation).mockRejectedValue(new Error('Google unavailable')); await expect(resolveStartingCity(start, new AbortController().signal)).rejects.toThrow('Google unavailable');
});
