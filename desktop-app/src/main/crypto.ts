import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';
import type { EncryptedEnvelope } from '../shared/protocol';

const HMAC_SALT = 'nudgeboard-e2ee-v1';
const IV_BYTES = 12;

export function deriveKey(token: string): Buffer {
  return createHmac('sha256', HMAC_SALT).update(token, 'utf8').digest();
}

export function deriveKeyHex(token: string): string {
  return deriveKey(token).toString('hex');
}

export function encryptEnvelope(
  key: Buffer | string,
  payload: unknown,
  seq: number,
): EncryptedEnvelope {
  const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv);
  const aad = Buffer.from(`seq:${seq}`, 'utf8');
  cipher.setAAD(aad);

  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    type: 'encrypted',
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
    tag: tag.toString('base64'),
    seq,
  };
}

export function decryptEnvelope<T = unknown>(
  key: Buffer | string,
  envelope: {
    iv: string;
    data: string;
    tag: string;
    seq: number;
  },
  expectedSeq?: number,
): T | null {
  if (expectedSeq !== undefined && envelope.seq !== expectedSeq) {
    return null;
  }
  try {
    const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex');
    const iv = Buffer.from(envelope.iv, 'base64');
    const data = Buffer.from(envelope.data, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');

    if (iv.length !== IV_BYTES || tag.length !== 16) {
      return null;
    }

    const decipher = createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAAD(Buffer.from(`seq:${envelope.seq}`, 'utf8'));
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]).toString('utf8');

    return JSON.parse(decrypted) as T;
  } catch {
    return null;
  }
}
