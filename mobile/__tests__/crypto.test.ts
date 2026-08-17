import { decryptEnvelope, deriveKeyHex, encryptEnvelope } from '../src/crypto';
import { parseClientMessage } from '../src/protocol';

declare const Buffer: {
  from(value: string | Uint8Array, encoding?: string): any;
};

describe('AES-256-GCM E2EE Crypto', () => {
  const token = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

  it('derives a deterministic 256-bit hex key from token', () => {
    const key1 = deriveKeyHex(token);
    const key2 = deriveKeyHex(token);
    expect(key1).toMatch(/^[0-9a-f]{64}$/);
    expect(key1).toBe(key2);
  });

  it('encrypts and decrypts a JSON payload successfully', () => {
    const key = deriveKeyHex(token);
    const payload = { type: 'press', id: 'app-terminal-123' };

    const envelope = encryptEnvelope(key, payload, 1);
    expect(envelope).not.toBeNull();
    expect(envelope?.type).toBe('encrypted');
    expect(envelope?.seq).toBe(1);
    expect(envelope?.iv).toBeDefined();
    expect(envelope?.data).toBeDefined();
    expect(envelope?.tag).toBeDefined();

    const decrypted = decryptEnvelope<typeof payload>(key, envelope!, 1);
    expect(decrypted).toEqual(payload);
  });

  it('rejects decryption when sequence number does not match expected', () => {
    const key = deriveKeyHex(token);
    const payload = { type: 'press', id: 'tile-1' };
    const envelope = encryptEnvelope(key, payload, 1);
    expect(envelope).not.toBeNull();

    // Replay attempt with sequence 2
    const result = decryptEnvelope(key, envelope!, 2);
    expect(result).toBeNull();
  });

  it('rejects decryption when ciphertext or tag is tampered with', () => {
    const key = deriveKeyHex(token);
    const payload = { type: 'logout' };
    const envelope = encryptEnvelope(key, payload, 1);
    expect(envelope).not.toBeNull();

    // Tamper with data
    const tamperedData = {
      ...envelope!,
      data: Buffer.from('corrupted_ciphertext').toString('base64'),
    };
    expect(decryptEnvelope(key, tamperedData, 1)).toBeNull();

    // Tamper with tag
    const tamperedTag = {
      ...envelope!,
      tag: Buffer.from('0123456789abcdef').toString('base64'),
    };
    expect(decryptEnvelope(key, tamperedTag, 1)).toBeNull();
  });

  it('parses encrypted message types in client message parser', () => {
    const key = deriveKeyHex(token);
    const envelope = encryptEnvelope(key, { type: 'press', id: 'tile-5' }, 3);

    const parsed = parseClientMessage(envelope);
    expect(parsed).toEqual(envelope);

    const reconnectEnc = {
      type: 'reconnect_enc',
      id: 'phone-device-id-1',
      iv: envelope!.iv,
      data: envelope!.data,
      tag: envelope!.tag,
      seq: envelope!.seq,
    };
    const parsedReconnect = parseClientMessage(reconnectEnc);
    expect(parsedReconnect).toEqual(reconnectEnc);
  });
});
