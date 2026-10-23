import { expect, it, vi } from 'vitest';
import { GoogleGuidePlaces } from '../packages/data-adapters/src/google-guide';
import { createServer } from '../apps/api/src/server';
import { localAuthenticator } from '../apps/api/src/auth';
import { LocalTripStore } from '../apps/api/src/store';
import { randomBytes } from 'node:crypto';

const placeId = 'verified-place-id', uri = 'https://lh3.googleusercontent.com/place-photo', name = `places/${placeId}/photos/provider-photo-reference`;
it('loads the selected Google place photo and author attribution without exposing the server key', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ photos: [{ name, authorAttributions: [{ displayName: 'Photo author', uri: 'https://maps.google.com/maps/contrib/123' }] }] })).mockResolvedValueOnce(Response.json({ photoUri: uri }));
  const reserve = vi.fn(async () => {});
  const result = await new GoogleGuidePlaces('server-secret', request).photo(placeId, reserve);
  expect(result).toEqual({ photo: { uri, authors: [{ name: 'Photo author', uri: 'https://maps.google.com/maps/contrib/123' }] } });
  expect(reserve).toHaveBeenCalledOnce(); expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[0][0]).toBe(`https://places.googleapis.com/v1/places/${placeId}`);
  expect(new Headers(request.mock.calls[0][1]?.headers).get('X-Goog-FieldMask')).toBe('photos');
  expect(request.mock.calls[1][0]).toContain(`${name}/media?maxWidthPx=720&maxHeightPx=480&skipHttpRedirect=true`);
  expect(JSON.stringify(result)).not.toContain('server-secret');
});
it('returns an empty image when Google has no photos and does not request media', async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json({})), reserve = vi.fn(async () => {});
  expect(await new GoogleGuidePlaces('server-secret', request).photo(placeId, reserve)).toEqual({ photo: null });
  expect(request).toHaveBeenCalledOnce(); expect(reserve).not.toHaveBeenCalled();
});
it('rejects a different place photo reference before making a media request', async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json({ photos: [{ name: 'places/another-place/photos/photo-reference' }] }));
  await expect(new GoogleGuidePlaces('server-secret', request).photo(placeId, async () => {})).rejects.toThrow('photo reference');
  expect(request).toHaveBeenCalledOnce();
});
it.each(['http://lh3.googleusercontent.com/image', 'https://example.com/image', 'https://googleusercontent.com.example.com/image'])('rejects an invalid provider media URL: %s', async photoUri => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ photos: [{ name }] })).mockResolvedValueOnce(Response.json({ photoUri }));
  await expect(new GoogleGuidePlaces('server-secret', request).photo(placeId, async () => {})).rejects.toThrow('invalid photo image');
});
it('honors the provider allowance before requesting media and surfaces provider failure', async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json({ photos: [{ name }] }));
  await expect(new GoogleGuidePlaces('server-secret', request).photo(placeId, async () => { throw new Error('Allowance exhausted'); })).rejects.toThrow('Allowance exhausted');
  expect(request).toHaveBeenCalledOnce();
  await expect(new GoogleGuidePlaces('server-secret', async () => new Response('', { status: 403 })).photo(placeId, async () => {})).rejects.toThrow('Google rejected');
});
it('requires authentication and validates photo input before touching the provider', async () => {
  const auth = localAuthenticator(randomBytes(32));
  const app = await createServer({ auth, store: new LocalTripStore(), fixtures: false, webOrigin: 'http://127.0.0.1:5174' });
  try {
    expect((await app.inject({ method: 'POST', url: '/api/guide/photo', payload: { placeId } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/guide/photo', headers: { authorization: `Bearer ${auth.issue!().token}` }, payload: { placeId: '../bad/place' } })).statusCode).toBe(400);
  } finally { await app.close(); }
});
it('serves photos through the authenticated API with no-store and the existing provider allowance', async () => {
  const auth = localAuthenticator(randomBytes(32)), photo = vi.fn(async (_id: string, beforeMedia: () => Promise<void>) => { await beforeMedia(); return { photo: { uri, authors: [] } }; });
  const app = await createServer({ auth, store: new LocalTripStore(), fixtures: false, webOrigin: 'http://127.0.0.1:5174', providerDailyLimit: 2,
    guide: { discover: async () => [], facts: async () => { throw new Error('Unused'); }, photo },
    locations: { autocomplete: async () => ({ provider: 'google', suggestions: [] }), details: async () => { throw new Error('Unused'); }, reverse: async () => { throw new Error('Unused'); }, timezone: async () => 'UTC' },
  });
  try {
    const headers = { authorization: `Bearer ${auth.issue!().token}` };
    const first = await app.inject({ method: 'POST', url: '/api/guide/photo', headers, payload: { placeId } });
    expect(first.statusCode).toBe(200); expect(first.headers['cache-control']).toBe('private, no-store'); expect(first.json()).toEqual({ photo: { uri, authors: [] } });
    const second = await app.inject({ method: 'POST', url: '/api/guide/photo', headers, payload: { placeId } });
    expect(second.statusCode).toBe(429); expect(photo).toHaveBeenCalledOnce();
  } finally { await app.close(); }
});
