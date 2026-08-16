import { resolveDeviceIdentity } from '../src/deviceIdentity';
import {
  APP_ID,
  deckPageCount,
  emptyDeck,
  fallbackLanCandidates,
  formatCountdown,
  formatFingerprint,
  isPairingPin,
  lanCandidates,
  GRID_SLOTS,
  MAX_PAGES,
  normalizeDeck,
  padDeck,
  pageTiles,
  parsePairingPayload,
  PROTOCOL_VERSION,
  isPrivateLanHost,
} from '../src/protocol';
import {
  makeDeviceId,
  makeOtp,
  upsertDesktop,
  type DesktopProfile,
} from '../src/store';

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

  it('rejects a payload whose host is not a private LAN address', () => {
    const rest = { ...payload, host: '8.8.8.8' };
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

  it('accepts RFC1918 hosts and rejects public ones', () => {
    expect(isPrivateLanHost('192.168.1.24')).toBe(true);
    expect(isPrivateLanHost('10.0.0.2')).toBe(true);
    expect(isPrivateLanHost('172.16.4.1')).toBe(true);
    expect(isPrivateLanHost('127.0.0.1')).toBe(true);
    expect(isPrivateLanHost('8.8.8.8')).toBe(false);
    expect(isPrivateLanHost('example.com')).toBe(false);
  });

  it('accepts a 6-digit pairing pin', () => {
    expect(isPairingPin('482910')).toBe(true);
    expect(isPairingPin('082910')).toBe(true);
    expect(isPairingPin('48291')).toBe(false);
    expect(isPairingPin('4829101')).toBe(false);
  });

  it('generates pairing ids from a secure rng', () => {
    expect(makeOtp()).toMatch(/^\d{6}$/);
    expect(makeDeviceId()).toMatch(/^[a-z]+-[0-9a-f]{32}$/);
  });

  it('builds LAN candidates for a /24', () => {
    const hosts = lanCandidates('192.168.1.24');
    expect(hosts).toHaveLength(253);
    expect(hosts).toContain('192.168.1.1');
    expect(hosts).not.toContain('192.168.1.24');
  });

  it('falls back to common home subnets', () => {
    expect(fallbackLanCandidates()).toContain('192.168.0.1');
    expect(fallbackLanCandidates()).toContain('10.0.0.254');
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

  it('grows a 9-tile deck into two pages', () => {
    const tiles = Array.from({ length: 9 }, (_, index) => ({
      id: String(index),
      name: `App ${index}`,
    }));
    const next = normalizeDeck(tiles);
    expect(deckPageCount(next)).toBe(2);
    expect(next).toHaveLength(GRID_SLOTS * 2);
    expect(next[8]).toEqual({ id: '8', name: 'App 8' });
    expect(next[9]).toBeNull();
  });

  it('caps the deck at eight pages', () => {
    const tiles = Array.from(
      { length: MAX_PAGES * GRID_SLOTS + 4 },
      (_, index) => ({
        id: String(index),
        name: `App ${index}`,
      }),
    );
    expect(normalizeDeck(tiles)).toHaveLength(MAX_PAGES * GRID_SLOTS);
  });

  it('slices a later page from a multi-page deck', () => {
    const tiles = normalizeDeck([
      ...Array.from({ length: GRID_SLOTS }, (_, index) => ({
        id: String(index),
        name: `App ${index}`,
      })),
      { id: 'x', name: 'Extra' },
    ]);
    expect(pageTiles(tiles, 1)[0]).toEqual({ id: 'x', name: 'Extra' });
    expect(pageTiles(tiles, 1)).toHaveLength(GRID_SLOTS);
  });
});

describe('device identity', () => {
  it('prefers the user-assigned phone name over the model code', () => {
    expect(
      resolveDeviceIdentity('android', {
        userName: "Tanmay's Redmi",
        marketName: 'Redmi Note 12 Pro 5G',
        manufacturer: 'Xiaomi',
        model: '22101320I',
      }),
    ).toEqual({ name: "Tanmay's Redmi", model: '22101320I' });
  });

  it('uses the marketing name when Settings still reports the model code', () => {
    expect(
      resolveDeviceIdentity('android', {
        userName: '22101320I',
        marketName: 'Redmi Note 12 Pro 5G',
        manufacturer: 'Xiaomi',
        model: '22101320I',
      }),
    ).toEqual({ name: 'Redmi Note 12 Pro 5G', model: '22101320I' });
  });

  it('falls back to manufacturer plus model', () => {
    expect(
      resolveDeviceIdentity('android', {
        manufacturer: 'xiaomi',
        model: '22101320I',
      }),
    ).toEqual({ name: 'Xiaomi 22101320I', model: '22101320I' });
  });

  it('prefers the Xiaomi Settings rename over the leftover marketing name', () => {
    expect(
      resolveDeviceIdentity('android', {
        names: ['POCO X5 Pro 5G pookie', 'POCO X5 Pro 5G'],
        marketName: 'POCO X5 Pro 5G',
        manufacturer: 'Xiaomi',
        model: '22101320I',
      }),
    ).toEqual({ name: 'POCO X5 Pro 5G pookie', model: '22101320I' });
  });
});
