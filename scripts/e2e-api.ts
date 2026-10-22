import { LocalAcceptedItineraries } from '../apps/api/src/accepted-itineraries';
import { resolve, sep } from 'node:path';
import { createServer } from '../apps/api/src/server';
import { LocalTripStore } from '../apps/api/src/store';
import { loadLocalSecret, localAuthenticator } from '../apps/api/src/auth';

// Dedicated fixture harness. No cloud adapters, provider keys or existing trip file.
const directory = resolve(process.env.LOCAL_DATA_DIR ?? '');
if (process.env.CI !== 'true' || process.env.NODE_ENV !== 'development' || !directory.startsWith(resolve('.tmp') + sep + 'release-api-')) throw new Error('The browser API harness requires isolated release-check storage and development CI mode.');
const port = Number(process.env.API_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid isolated API port.');
const store = new LocalTripStore(resolve(directory, 'trips.json')); await store.initialize();
const auth = localAuthenticator(await loadLocalSecret(directory));
// Multiple isolated browser guests share one loopback IP during a suite.
// Normal API startup keeps 90 requests and 10 development sessions per minute.
const app = await createServer({ auth, store, itineraries: new LocalAcceptedItineraries(), fixtures: true, webOrigin: process.env.WEB_ORIGIN ?? 'http://127.0.0.1:5174', rateMax: 300, fixtureSessionRateMax: 30, providerDailyLimit: 0, aiDailyLimit: 0 });
await app.listen({ port, host: '127.0.0.1' });
const close = async () => { await app.close(); process.exit(0); };
process.on('SIGTERM', close); process.on('SIGINT', close);
