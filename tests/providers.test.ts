import { describe, expect, it, vi } from 'vitest';
import { GoogleRoutes, GooglePlaces } from '../packages/data-adapters/src/google';

const departure = '2026-10-10T09:00:00Z', origin = { latitude: 26.9, longitude: 75.8 }, destination = { latitude: 26.91, longitude: 75.82 };
describe('Google adapters with simulated responses — no live accuracy claims', () => {
  it('sends the planned departure and a narrow field mask; retains no provider secret', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ routes: [{ duration: '165.5s', distanceMeters: 772, polyline: { encodedPolyline: 'test-polyline' } }] })));
    const provider = new GoogleRoutes('server-secret', request, () => Date.parse('2026-10-09T00:00:00Z'));
    const result = await provider.compute(origin, destination, departure);
    const [url, options] = request.mock.calls[0]; expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(JSON.parse(options!.body as string)).toMatchObject({ departureTime: departure, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', origin: { location: { latLng: origin } } });
    expect((options!.headers as Record<string, string>)['X-Goog-FieldMask']).not.toContain('*');
    expect(result).toMatchObject({ durationSeconds: 165.5, persistence: 'memory_only', trafficBasis: 'prediction_for_departure' }); expect(JSON.stringify(result)).not.toContain('server-secret');
  });
  it('does not fabricate routes on empty, malformed, quota or network responses', async () => {
    await expect(new GoogleRoutes('key', vi.fn<typeof fetch>().mockResolvedValue(new Response('{"routes":[]}'))).compute(origin, destination, departure)).rejects.toMatchObject({ code: 'NO_ROUTE' });
    await expect(new GoogleRoutes('key', vi.fn<typeof fetch>().mockResolvedValue(new Response('{"routes":[{"duration":"wrong"}]}'))).compute(origin, destination, departure)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(new GoogleRoutes('key', vi.fn<typeof fetch>().mockResolvedValue(new Response('secret provider diagnostic', { status: 429 }))).compute(origin, destination, departure)).rejects.toMatchObject({ code: 'QUOTA' });
    await expect(new GoogleRoutes('key', vi.fn<typeof fetch>().mockRejectedValue(new Error('network'))).compute(origin, destination, departure)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
  it('refuses calls with no credential and prevents a Places URL from becoming arbitrary', async () => {
    const request = vi.fn<typeof fetch>(); await expect(new GoogleRoutes('', request).compute(origin, destination, departure)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    await expect(new GooglePlaces('key', request).details('../../other-host')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' }); expect(request).not.toHaveBeenCalled();
  });
  it('retains source attribution while never interpreting a place tag as strict dietary evidence', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 'place-id', displayName: { text: 'Simulated name' }, location: origin, attributions: [{ provider: 'Example source', providerUri: 'https://example.com' }], servesVegetarianFood: true })));
    const result = await new GooglePlaces('key', request).details('place-id');
    expect(result.attributions).toHaveLength(1); expect(result.persistence).toBe('memory_only'); expect(result).not.toHaveProperty('dietary'); expect(result).not.toHaveProperty('servesVegetarianFood');
  });
});
