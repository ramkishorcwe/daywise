import { expect, it, vi } from 'vitest';
import { ProviderGuard } from '../apps/api/src/provider-guard';
it('prevents duplicate paid calls without caching the provider response and enforces its allowance', async () => {
  const guard = new ProviderGuard(1), work = vi.fn().mockResolvedValue({ secretProviderGeometry: 'transient' });
  expect(await guard.run('owner', 'request-key', { from: 'one' }, work)).toHaveProperty('secretProviderGeometry');
  await expect(guard.run('owner', 'request-key', { from: 'one' }, work)).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_FINISHED' });
  await expect(guard.run('owner', 'request-key', { from: 'two' }, work)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(guard.run('owner', 'another-key', {}, work)).rejects.toMatchObject({ code: 'PROVIDER_BUDGET_LIMIT' });
  expect(work).toHaveBeenCalledTimes(1); expect(JSON.stringify(guard)).not.toContain('transient');
});
it('counts failed upstream calls, prevents concurrent duplication and resets on the UTC day', async () => {
  let time = Date.parse('2026-10-09T00:00:00Z'); const guard = new ProviderGuard(1, () => time);
  let reject: (reason: Error) => void = () => {}; const work = vi.fn(() => new Promise((_resolve, decline) => { reject = decline; }));
  const pending = guard.run('owner', 'pending-key', {}, work);
  await expect(guard.run('owner', 'pending-key', {}, work)).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_IN_PROGRESS' });
  reject(new Error('provider failure')); await expect(pending).rejects.toThrow('provider failure');
  await expect(guard.run('owner', 'another-key', {}, async () => null)).rejects.toMatchObject({ code: 'PROVIDER_BUDGET_LIMIT' });
  time += 86400000; await expect(guard.run('owner', 'another-key', {}, async () => 'new day')).resolves.toBe('new day');
});
it('allows exactly 100 AI requests and identifies its local limit separately from Maps', () => {
  const guard = new ProviderGuard(100, () => Date.parse('2026-10-14T12:00:00Z'), 'ai');
  for (let i = 0; i < 100; i++) guard.consume();
  expect(guard.usage()).toMatchObject({ attempts: 100, limit: 100, remaining: 0 });
  expect(() => guard.consume()).toThrow(expect.objectContaining({ code: 'AI_BUDGET_LIMIT', message: expect.stringContaining('100/100') }));
  expect(guard.usage().attempts).toBe(100);
});
it('supports the moderate 600-request Maps allowance and preserves the existing hard cutoff', () => {
  const guard = new ProviderGuard(600);
  for (let i = 0; i < 600; i++) guard.consume();
  expect(() => guard.consume()).toThrow(expect.objectContaining({ code: 'PROVIDER_BUDGET_LIMIT', message: expect.stringContaining('600/600') }));
  expect(guard.usage().remaining).toBe(0);
});
