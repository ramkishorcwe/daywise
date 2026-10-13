import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError } from './errors';

export interface Authenticator { mode: 'local' | 'firebase'; verify(token: string): Promise<string>; issue?(): { token: string; expiresAt: string }; }
export function localAuthenticator(secret: Buffer, clock = () => Date.now()): Authenticator {
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');
  return {
    mode: 'local',
    issue() {
      const expires = clock() + 24 * 60 * 60 * 1000;
      const payload = Buffer.from(JSON.stringify({ uid: `local-${randomUUID()}`, expires })).toString('base64url');
      return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(expires).toISOString() };
    },
    async verify(token) {
      try {
        if (token.length > 2048) throw new Error();
        const [payload, signature, extra] = token.split('.');
        const expected = Buffer.from(sign(payload)), actual = Buffer.from(signature ?? '');
        if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
        const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (typeof value.uid !== 'string' || !/^local-[0-9a-f-]{36}$/.test(value.uid) || !Number.isFinite(value.expires) || value.expires <= clock()) throw new Error();
        return value.uid;
      } catch { throw new ApiError(401, 'UNAUTHENTICATED', 'Connect again to obtain a valid session.'); }
    },
  };
}
export async function loadLocalSecret(directory: string): Promise<Buffer> {
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'development-session-secret');
  try { await writeFile(path, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const secret = await readFile(path);
  if (secret.length !== 32) throw new Error('The development session secret is invalid. Restore it or explicitly reset local sessions.');
  return secret;
}
