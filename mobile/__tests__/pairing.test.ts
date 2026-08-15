import {
  APP_ID,
  emptyDeck,
  formatCountdown,
  formatFingerprint,
  GRID_SLOTS,
  padDeck,
  parsePairingPayload,
  PROTOCOL_VERSION,
} from '../src/protocol';
import { upsertDesktop, type DesktopProfile } from '../src/store';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const payload = {
  v: PROTOCOL_VERSION,
  app: APP_ID,
  name: 'DESKTOP-RAY',
  os: 'Windows 11',
  host: '192.168.1.24',
  port: 47890,
  token: 'aabbccddeeff0011',
  fingerprint: '7F:2A:D1',
};

describe('pairing protocol', () => {
  it('parses a JSON pairing payload', () => {
    expect(parsePairingPayload(JSON.stringify(payload))).toEqual(payload);
  });

  it('parses a compact pairing code', () => {
    const compact = 'nb1|DESKTOP-RAY|Windows 11|192.168.1.24|47890|aabbccddeeff0011|7F:2A:D1';
    expect(parsePairingPayload(compact)).toEqual(payload);
  });

  it('rejects a payload without a fingerprint', () => {
    const { fingerprint: _fingerprint, ...rest } = payload;
    expect(() => parsePairingPayload(JSON.stringify(rest))).toThrow(
      'Not a Nudgeboard pairing code',
    );
  });

  it('formats a 3-byte fingerprint', () => {
    expect(formatFingerprint([0x7f, 0x2a, 0xd1])).toBe('7F:2A:D1');
  });

  it('formats a countdown timer', () => {
    expect(formatCountdown(298_000)).toBe('04:58');
    expect(formatCountdown(72_000)).toBe('01:12');
    expect(formatCountdown(0)).toBe('00:00');
  });
});

describe('desktop profiles', () => {
  const office: DesktopProfile = {
    name: 'OFFICE-PC',
    os: 'Windows 11',
    fingerprint: 'A1:B2:C3',
    host: '192.168.1.10',
    port: 47890,
    token: 'token-office',
    pairedAt: 1,
  };

  const ray: DesktopProfile = {
    name: 'DESKTOP-RAY',
    os: 'Windows 11',
    fingerprint: '7F:2A:D1',
    host: '192.168.1.24',
    port: 47890,
    token: 'token-ray',
    pairedAt: 2,
  };

  it('adds a new computer profile', () => {
    expect(upsertDesktop([], ray)).toEqual([ray]);
  });

  it('updates an existing computer in place', () => {
    const updated = { ...ray, name: 'STUDIO-RAY', token: 'token-new' };
    expect(upsertDesktop([office, ray], updated)).toEqual([office, updated]);
  });
});

describe('deck layout', () => {
  it('starts with 8 empty slots', () => {
    expect(emptyDeck()).toEqual(Array.from({ length: GRID_SLOTS }, () => null));
  });

  it('pads a short deck to 8 slots', () => {
    const tiles = [{ id: 'a', name: 'Android Studio' }, null];
    const next = padDeck(tiles);
    expect(next).toHaveLength(GRID_SLOTS);
    expect(next[0]).toEqual({ id: 'a', name: 'Android Studio' });
    expect(next.slice(1).every((tile) => tile === null)).toBe(true);
  });

  it('keeps only the first 8 slots', () => {
    const tiles = Array.from({ length: 10 }, (_, index) => ({
      id: String(index),
      name: `App ${index}`,
    }));
    expect(padDeck(tiles)).toHaveLength(GRID_SLOTS);
    expect(padDeck(tiles)[7]).toEqual({ id: '7', name: 'App 7' });
  });
});
