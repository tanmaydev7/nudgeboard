import { NativeModules } from 'react-native';
import type { EncryptedEnvelope } from './protocol';

declare const Buffer: {
  from(value: string | Uint8Array, encoding?: string): any;
  concat(list: any[]): any;
  isBuffer(obj: unknown): boolean;
};

type NudgeDeviceModule = {
  deriveKeyHex?: (token: string) => string;
  encryptAesGcm?: (
    keyHex: string,
    plaintext: string,
    seq: number,
  ) => { iv?: string; data?: string; tag?: string; seq?: number };
  decryptAesGcm?: (
    keyHex: string,
    ivBase64: string,
    dataBase64: string,
    tagBase64: string,
    seq: number,
  ) => string;
};

const native = (): NudgeDeviceModule | undefined =>
  (NativeModules as { NudgeDevice?: NudgeDeviceModule })?.NudgeDevice;

interface NodeCryptoCipher {
  setAAD(aad: any): void;
  update(data: string, encoding: string): any;
  final(): any;
  getAuthTag(): any;
}

interface NodeCryptoDecipher {
  setAAD(aad: any): void;
  setAuthTag(tag: any): void;
  update(data: any): any;
  final(): any;
}

interface NodeCryptoLike {
  createHmac(algo: string, salt: string): { update(data: string, enc: string): { digest(format: string): string } };
  randomBytes(size: number): any;
  createCipheriv(algo: string, key: any, iv: any): NodeCryptoCipher;
  createDecipheriv(algo: string, key: any, iv: any): NodeCryptoDecipher;
}

const nodeCrypto = (): NodeCryptoLike | undefined => {
  try {
    const nodeReq = typeof require !== 'undefined' ? require : undefined;
    return nodeReq?.('crypto') as NodeCryptoLike | undefined;
  } catch {
    return undefined;
  }
};

export function deriveKeyHex(token: string): string {
  const mod = native();
  if (typeof mod?.deriveKeyHex === 'function') {
    const res = mod.deriveKeyHex(token);
    if (res && res.length === 64) {
      return res;
    }
  }
  const nc = nodeCrypto();
  if (nc) {
    return nc
      .createHmac('sha256', 'nudgeboard-e2ee-v1')
      .update(token, 'utf8')
      .digest('hex');
  }
  return '';
}

export function encryptEnvelope(
  keyHex: string,
  payload: unknown,
  seq: number,
): EncryptedEnvelope | null {
  const plaintext = JSON.stringify(payload);
  const mod = native();
  if (typeof mod?.encryptAesGcm === 'function') {
    const res = mod.encryptAesGcm(keyHex, plaintext, seq);
    if (res?.iv && res.data && res.tag && typeof res.seq === 'number') {
      return {
        type: 'encrypted',
        iv: res.iv,
        data: res.data,
        tag: res.tag,
        seq: res.seq,
      };
    }
  }
  const nc = nodeCrypto();
  if (nc) {
    try {
      const keyBuffer = Buffer.from(keyHex, 'hex');
      const iv = nc.randomBytes(12);
      const cipher = nc.createCipheriv('aes-256-gcm', keyBuffer, iv);
      cipher.setAAD(Buffer.from(`seq:${seq}`, 'utf8'));
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
    } catch {
      return null;
    }
  }
  return null;
}

export function decryptEnvelope<T = unknown>(
  keyHex: string,
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
  const mod = native();
  if (typeof mod?.decryptAesGcm === 'function') {
    const plaintext = mod.decryptAesGcm(
      keyHex,
      envelope.iv,
      envelope.data,
      envelope.tag,
      envelope.seq,
    );
    if (plaintext) {
      try {
        return JSON.parse(plaintext) as T;
      } catch {
        return null;
      }
    }
  }
  const nc = nodeCrypto();
  if (nc) {
    try {
      const keyBuffer = Buffer.from(keyHex, 'hex');
      const iv = Buffer.from(envelope.iv, 'base64');
      const data = Buffer.from(envelope.data, 'base64');
      const tag = Buffer.from(envelope.tag, 'base64');
      const decipher = nc.createDecipheriv('aes-256-gcm', keyBuffer, iv);
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
  return null;
}
