import { expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { EvidenceReceipts } from '../apps/api/src/receipts';
import { LocationRegistry } from '../apps/api/src/locations';
import { coordinateLocation } from '../packages/contracts/src/locations';
import { attachEvidence, clearEvidence, rememberEvidence } from '../apps/web/src/evidence-cache';
import { ProviderGuard } from '../apps/api/src/provider-guard';
import type { HostedBudget } from '../apps/api/src/hosted-budget';

it('restores owner-bound real selections on a new replica without resetting their expiry', () => {
  let now = Date.now(); const receipts = new EvidenceReceipts(randomBytes(32).toString('base64url'), () => now);
  const first = new LocationRegistry(() => now, receipts), second = new LocationRegistry(() => now, receipts);
  const selected = first.add('owner', coordinateLocation({ latitude: 12.5, longitude: 75.5 }, 'pin'));
  second.restore('owner', selected.receipt!);
  expect(second.get('owner', selected.id)).toEqual(selected);
  expect(() => second.restore('stranger', selected.receipt!)).toThrow(expect.objectContaining({ code: 'EVIDENCE_UNAVAILABLE' }));
  now += 1800000;
  expect(() => second.restore('owner', selected.receipt!)).toThrow(expect.objectContaining({ code: 'EVIDENCE_UNAVAILABLE' }));
});
it('rejects tampering, wrong evidence kinds, wrong secrets and oversized tokens', () => {
  const secret = randomBytes(32).toString('base64url'), receipts = new EvidenceReceipts(secret);
  const token = receipts.seal('owner', 'guide', Date.now() + 10000, { secretAddress: 'private address' });
  expect(token).not.toContain('private address');
  for (const value of ['A'.repeat(50001), token.slice(0, -12) + 'AAAAAAAAAAAA']) expect(() => receipts.open('owner', 'guide', value)).toThrow();
  expect(() => receipts.open('owner', 'location', token)).toThrow();
  expect(() => new EvidenceReceipts(randomBytes(32).toString('base64url')).open('owner', 'guide', token)).toThrow();
  expect(() => new EvidenceReceipts('short')).toThrow();
});
it('attaches only referenced unexpired location and guide receipts and clears disconnected sessions', () => {
  clearEvidence();
  rememberEvidence({ candidates: [{ receipt: 'guide-token', location: { id: 'visit', receipt: 'location-token', expiresAt: new Date(Date.now() + 60000).toISOString() } }] });
  const body = JSON.parse(attachEvidence(JSON.stringify({ stops: [{ locationId: 'visit' }] })));
  expect(body._evidence).toEqual({ locations: ['location-token'], guides: ['guide-token'] });
  expect(attachEvidence('{"startId":"other"}')).toBe('{"startId":"other"}');
  clearEvidence(); expect(attachEvidence('{"startId":"visit"}')).toBe('{"startId":"visit"}');
});
it('awaits shared quota and duplicate claims before making a paid provider request', async () => {
  const order: string[] = [];
  const hosted: HostedBudget = { consume: vi.fn(async () => { order.push('consume'); }), claim: vi.fn(async () => { order.push('claim'); }) };
  const guard = new ProviderGuard(600, () => Date.now(), 'provider', hosted);
  await guard.run('owner', 'request-key', {}, async () => { order.push('paid'); });
  expect(order).toEqual(['claim', 'consume', 'paid']);
  const paid = vi.fn(); vi.mocked(hosted.consume).mockRejectedValue(new Error('Database unavailable'));
  await expect(guard.run('owner', 'different-key', {}, paid)).rejects.toThrow('Database unavailable');
  expect(paid).not.toHaveBeenCalled();
});
