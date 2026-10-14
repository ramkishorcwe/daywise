import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { z } from 'zod';
import { ApiError } from './errors';

const envelope = z.strictObject({ owner: z.string().min(1).max(200), kind: z.enum(['location', 'guide']), expires: z.number().finite(), value: z.unknown() });
// Provider evidence travels encrypted with its browser session, retaining the
// original expiry and owner. Cloud replicas do not persist addresses or facts.
export class EvidenceReceipts {
  private key: Buffer;
  constructor(secret: string, private clock = () => Date.now()) {
    this.key = Buffer.from(secret, 'base64url');
    if (this.key.length !== 32) throw new Error('EVIDENCE_RECEIPT_SECRET must encode 32 random bytes.');
  }
  seal(owner: string, kind: 'location' | 'guide', expires: number, value: unknown) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(deflateSync(Buffer.from(JSON.stringify({ owner, kind, expires, value })))), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }
  open(owner: string, kind: 'location' | 'guide', receipt: string): unknown {
    try {
      if (!/^[A-Za-z0-9_-]{40,50000}$/.test(receipt)) throw new Error();
      const raw = Buffer.from(receipt, 'base64url'), decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const plaintext = inflateSync(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]), { maxOutputLength: 100000 });
      const data = envelope.parse(JSON.parse(plaintext.toString()));
      if (data.owner !== owner || data.kind !== kind || data.expires <= this.clock()) throw new Error();
      return data.value;
    } catch { throw new ApiError(409, 'EVIDENCE_UNAVAILABLE', 'Selected place evidence expired or is invalid. Select the location again; your saved trip is preserved.'); }
  }
}
