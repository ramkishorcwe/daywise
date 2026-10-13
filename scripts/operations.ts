import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MaintenanceStore, proposalDigest } from '../apps/api/src/maintenance';
import { ApiError } from '../apps/api/src/errors';
import { z } from 'zod';

async function main() {
  const [command, ...raw] = process.argv.slice(2);
  const options = new Map<string, string>();
  for (let index = 0; index < raw.length; index += 2) {
    if (!raw[index].startsWith('--') || !raw[index + 1] || options.has(raw[index])) throw new Error('Use unique --option value pairs.');
    options.set(raw[index], raw[index + 1]);
  }
  const allowed: Record<string, string[]> = { status: [], 'catalog-status': [], stage: ['--input', '--revision', '--operator', '--reason'], inspect: ['--proposal'], approve: ['--proposal', '--digest', '--revision', '--reviewer'], reject: ['--proposal', '--digest', '--revision', '--reviewer'] };
  if (!allowed[command] || [...options.keys()].some(key => !allowed[command].includes(key))) throw new Error('Commands: status, catalog-status, stage, inspect, approve, reject. See operations.md.');
  const required = (key: string) => { const value = options.get(key); if (!value) throw new Error(`Missing ${key}.`); return value; };
  const revision = () => { const value = required('--revision'); if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Revision must be a nonnegative integer.'); return Number(value); };
  const store = new MaintenanceStore(resolve(process.env.MAINTENANCE_DIR ?? 'catalogs/private/maintenance'));
  if (command === 'catalog-status') return store.status();
  if (command === 'stage') {
    const rawContent = await readFile(resolve(required('--input')), 'utf8');
    if (rawContent.length > 3_000_000) throw new Error('Input is too large.');
    return store.stage(JSON.parse(rawContent), revision(), required('--operator'), required('--reason'));
  }
  if (command === 'inspect') {
    const proposal = await store.inspect(required('--proposal'));
    return { proposal, digest: proposalDigest(proposal), note: 'Review independent source/branch evidence and reuse rights. Structural validation does not verify facts.' };
  }
  if (command === 'approve' || command === 'reject') return store.decide(required('--proposal'), required('--digest'), revision(), required('--reviewer'), command === 'approve');
  const token = process.env.OPERATIONS_TOKEN || (await readFile(resolve(process.env.LOCAL_DATA_DIR ?? '.local', 'operations/development-session-secret'))).toString('base64url');
  const port = Number(process.env.API_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid API_PORT.');
  const response = await fetch(`http://127.0.0.1:${port}/api/ops/status`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Operator diagnostics unavailable (${response.status}). Start the API with matching configuration.`);
  return response.json();
}
main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
  console.error(error instanceof ApiError ? `${error.code}: ${error.message}` : error instanceof z.ZodError ? 'Invalid maintenance fields. Check the documented schema.' : (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'File unavailable. Start the API for diagnostics, or check the input/proposal path.' : error instanceof SyntaxError ? 'Input is not valid JSON.' : error instanceof Error ? error.message : 'Operator command failed.');
  process.exitCode = 1;
});
