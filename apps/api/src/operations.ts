import { timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors';
export function requireOperator(token: string | undefined, authorization: string | undefined, ip: string, origin: string | undefined) {
  if (!token) throw new ApiError(404, 'NOT_FOUND', 'This endpoint is unavailable.');
  // Operator diagnostics are for the local CLI, never the browser or proxy clients.
  if (origin || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) throw new ApiError(403, 'OPERATOR_ONLY', 'Local operator access is required.');
  const actual = Buffer.from(authorization?.startsWith('Bearer ') ? authorization.slice(7) : '');
  const expected = Buffer.from(token);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ApiError(403, 'OPERATOR_ONLY', 'Local operator access is required.');
}
