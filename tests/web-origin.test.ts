import { afterEach, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { webOriginFromEnvironment, webOriginPolicy } from '../apps/api/src/web-origin';
import { createServer } from '../apps/api/src/server';
import { localAuthenticator } from '../apps/api/src/auth';
import { LocalTripStore } from '../apps/api/src/store';

const servers: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())); vi.unstubAllEnvs(); });

it('derives the default origin from the preview port and honors an explicit origin', () => {
  expect(webOriginFromEnvironment({})).toBe('http://127.0.0.1:5173');
  expect(webOriginFromEnvironment({ WEB_PORT: '5178' })).toBe('http://127.0.0.1:5178');
  expect(webOriginFromEnvironment({ WEB_PORT: '5178', WEB_ORIGIN: 'https://travel.example/' })).toBe('https://travel.example');
  for (const WEB_PORT of ['NaN', '0', '80', '65536', '5173.5', '']) expect(() => webOriginFromEnvironment({ WEB_PORT })).toThrow('WEB_PORT');
});

it('rejects malformed origin configuration before starting the server', async () => {
  for (const value of ['', 'null', '*', 'file:///app', 'http://user:password@localhost:5173', 'http://localhost:5173/api', 'http://localhost:5173/?key=secret', 'http://localhost:5173/#app']) {
    expect(() => webOriginPolicy(value, true)).toThrow('WEB_ORIGIN');
  }
  await expect(createServer({ auth: localAuthenticator(randomBytes(32)), store: new LocalTripStore(), fixtures: false, webOrigin: 'invalid' })).rejects.toThrow('WEB_ORIGIN');
});

it('accepts only localhost and 127.0.0.1 on the configured local scheme and port', () => {
  const policy = webOriginPolicy('http://localhost:5178/', true);
  expect(policy.accepts('http://localhost:5178')).toBe(true);
  expect(policy.accepts('http://127.0.0.1:5178')).toBe(true);
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:3001', 'https://localhost:5178', 'http://localhost.evil.example:5178', 'http://127.0.0.2:5178', 'http://localhost:5178/path', 'http://user@localhost:5178', 'http://localhost:5178/', 'null', '']) expect(policy.accepts(origin)).toBe(false);
  expect(webOriginPolicy('https://travel.example', true).accepts('http://localhost:5173')).toBe(false);
});

it('keeps deployment origins exact without development aliases', () => {
  const local = webOriginPolicy('http://127.0.0.1:5173', false);
  expect(local.accepts('http://127.0.0.1:5173')).toBe(true);
  expect(local.accepts('http://localhost:5173')).toBe(false);
  const publicOrigin = webOriginPolicy('https://travel.example/', false);
  expect(publicOrigin.accepts('https://travel.example')).toBe(true);
  for (const origin of ['http://travel.example', 'https://other.travel.example', 'https://travel.example:5173', 'null']) expect(publicOrigin.accepts(origin)).toBe(false);
});

it('allows local location requests and echoes the accepted origin for preflight', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  const auth = localAuthenticator(randomBytes(32));
  const app = await createServer({ auth, store: new LocalTripStore(), fixtures: false, webOrigin: 'http://127.0.0.1:5173/' }); servers.push(app);
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
    const preflight = await app.inject({ method: 'OPTIONS', url: '/api/locations/autocomplete', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
    expect(preflight.statusCode).toBe(204); expect(preflight.headers['access-control-allow-origin']).toBe(origin); expect(preflight.headers.vary).toBe('Origin');
    const session = await app.inject({ method: 'POST', url: '/api/dev/session', headers: { origin } });
    expect(session.statusCode).toBe(200);
    const headers = { origin, authorization: `Bearer ${session.json().token}` };
    const search = await app.inject({ method: 'POST', url: '/api/locations/autocomplete', headers, payload: { input: 'Jaipur', sessionToken: randomUUID(), citiesOnly: true } });
    expect(search.statusCode).toBe(503); expect(search.json().error.code).toBe('LOCATION_PROVIDER_NOT_CONFIGURED'); expect(search.headers['access-control-allow-origin']).toBe(origin);
    // Synthetic test coordinates; no provider adapter or paid request is enabled.
    const reverse = await app.inject({ method: 'POST', url: '/api/locations/reverse', headers, payload: { coordinates: { latitude: 1, longitude: 2 }, source: 'gps', accuracyMeters: 20, observedAt: new Date().toISOString() } });
    expect(reverse.statusCode).toBe(200); expect(reverse.json().address).toBeNull(); expect(reverse.json().provider).toBe('device'); expect(reverse.json().coordinates).toEqual({ latitude: 1, longitude: 2 });
  }
  for (const origin of ['http://localhost:5174', 'https://untrusted.example', 'null', '']) {
    const rejected = await app.inject({ method: 'POST', url: '/api/dev/session', headers: { origin } });
    expect(rejected.statusCode).toBe(403); expect(rejected.headers['access-control-allow-origin']).toBeUndefined(); expect(rejected.json().error.message).toContain('WEB_ORIGIN');
  }
});

it('does not enable hostname aliases for Firebase auth, including production', async () => {
  for (const environment of ['development', 'production']) {
    vi.stubEnv('NODE_ENV', environment);
    const app = await createServer({ auth: { mode: 'firebase', async verify() { return 'test-owner'; } }, store: new LocalTripStore(), fixtures: false, webOrigin: 'http://127.0.0.1:5173' }); servers.push(app);
    expect((await app.inject({ url: '/api/health', headers: { origin: 'http://127.0.0.1:5173' } })).statusCode).toBe(200);
    const rejected = await app.inject({ url: '/api/health', headers: { origin: 'http://localhost:5173' } });
    expect(rejected.statusCode).toBe(403); expect(rejected.json().error.message).toBe('This browser origin is not allowed.');
  }
});
