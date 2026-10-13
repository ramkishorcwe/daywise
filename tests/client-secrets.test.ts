import { expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkClientSecrets } from '../scripts/client-secrets.mjs';
import { checkFixtureLocations } from '../scripts/client-locations.mjs';
it('rejects configured server values in client output without exposing the value or filename', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'daywise-client-'));
  const secret = 'synthetic-server-value-123456'; await writeFile(join(directory, 'client.js'), `const bad = '${secret}';`);
  const result = await checkClientSecrets(directory, { GOOGLE_ROUTES_API_KEY: secret });
  expect(result).toMatchObject({ passed: false, findings: 1 }); expect(JSON.stringify(result)).not.toContain(secret); expect(JSON.stringify(result)).not.toContain('client.js');
});
it('finds private-key markers while allowing public browser configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'daywise-client-'));
  await writeFile(join(directory, 'client.js'), 'const project = "public-project-config";'); expect((await checkClientSecrets(directory, {})).passed).toBe(true);
  await writeFile(join(directory, 'client.js'), '-----BEGIN PRIVATE KEY-----'); expect((await checkClientSecrets(directory, {})).passed).toBe(false);
});
it('rejects new geocoding and timezone server key values in client artifacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'daywise-client-locations-'));
  for (const key of ['GOOGLE_GEOCODING_API_KEY', 'GOOGLE_TIME_ZONE_API_KEY']) {
    await writeFile(join(directory, 'client.js'), 'const key = "synthetic-private-location-key-987654";');
    expect((await checkClientSecrets(directory, { [key]: 'synthetic-private-location-key-987654' })).passed).toBe(false);
  }
});
it('rejects a leaked fixture location chunk in a production build', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'daywise-no-fixture-'));
  await writeFile(join(directory, 'client.js'), 'const city = "jaipur-test";'); expect((await checkFixtureLocations(directory)).passed).toBe(false);
  await writeFile(join(directory, 'client.js'), 'const location = null;'); expect((await checkFixtureLocations(directory)).passed).toBe(true);
});
