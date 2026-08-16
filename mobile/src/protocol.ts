export const PROTOCOL_VERSION = 1;
export const APP_ID = 'nudgeboard';
export const DEFAULT_PORT = 47890;
export const QR_TTL_MS = 5 * 60 * 1000;

export type DevicePlatform = 'ios' | 'android';

export type PairingPayload = {
  v: typeof PROTOCOL_VERSION;
  app: typeof APP_ID;
  name: string;
  os: string;
  host: string;
  port: number;
  token: string;
  fingerprint: string;
};

export type DeviceHello = {
  id: string;
  name: string;
  platform: DevicePlatform;
  model: string;
  os: string;
  fingerprint: string;
};

export type ClientMessage =
  | {
      type: 'hello';
      token: string;
      otp: string;
      device: DeviceHello;
    }
  | {
      type: 'hello_pin';
      pin: string;
      device: DeviceHello;
    }
  | {
      type: 'reconnect';
      token: string;
      device: DeviceHello;
    }
  | {
      type: 'press';
      id: string;
    }
  | {
      type: 'logout';
    };

export type DeckTileView = {
  id: string;
  name: string;
  icon?: string;
};

export type HelloOk = {
  type: 'hello_ok';
  hostName: string;
  fingerprint: string;
  token: string;
  host: string;
  port: number;
  os: string;
};

export type ServerMessage =
  | HelloOk
  | { type: 'hello_err'; reason: string }
  | { type: 'logged_out' }
  | {
      type: 'deck';
      columns: number;
      rows: number;
      tiles: Array<DeckTileView | null>;
    };

export const GRID_COLUMNS = 4;
export const GRID_ROWS = 2;
export const GRID_SLOTS = GRID_COLUMNS * GRID_ROWS;
export const MAX_PAGES = 8;

export function emptyDeck(): Array<DeckTileView | null> {
  return Array.from({ length: GRID_SLOTS }, (): DeckTileView | null => null);
}

export function padDeck(
  tiles: Array<DeckTileView | null>,
): Array<DeckTileView | null> {
  const next = tiles.slice(0, GRID_SLOTS);
  while (next.length < GRID_SLOTS) {
    next.push(null);
  }
  return next;
}

export function deckPageCount(tiles: Array<unknown>): number {
  return Math.min(
    MAX_PAGES,
    Math.max(1, Math.ceil(tiles.length / GRID_SLOTS) || 1),
  );
}

export function normalizeDeck(
  tiles: Array<DeckTileView | null>,
): Array<DeckTileView | null> {
  const size = deckPageCount(tiles) * GRID_SLOTS;
  const next = tiles.slice(0, size);
  while (next.length < size) {
    next.push(null);
  }
  return next;
}

export function pageTiles(
  tiles: Array<DeckTileView | null>,
  page: number,
): Array<DeckTileView | null> {
  return padDeck(tiles.slice(page * GRID_SLOTS, page * GRID_SLOTS + GRID_SLOTS));
}

const FINGERPRINT_RE = /^[0-9A-F]{2}(?::[0-9A-F]{2}){2}$/;

export function formatFingerprint(bytes: ArrayLike<number>): string {
  return [bytes[0], bytes[1], bytes[2]]
    .map((value) => Number(value).toString(16).toUpperCase().padStart(2, '0'))
    .join(':');
}

export function isPairingPin(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export function lanCandidates(ip: string): string[] {
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    return [];
  }
  const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
  const hosts: string[] = [];
  for (let host = 1; host <= 254; host += 1) {
    const next = `${prefix}.${host}`;
    if (next !== ip) {
      hosts.push(next);
    }
  }
  return hosts;
}

export function fallbackLanCandidates(): string[] {
  return ['192.168.1', '192.168.0', '10.0.0'].flatMap((prefix) =>
    Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`),
  );
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function isPairingPayload(value: unknown): value is PairingPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Partial<PairingPayload>;
  return (
    payload.v === PROTOCOL_VERSION &&
    payload.app === APP_ID &&
    typeof payload.name === 'string' &&
    typeof payload.os === 'string' &&
    typeof payload.host === 'string' &&
    typeof payload.port === 'number' &&
    Number.isInteger(payload.port) &&
    payload.port > 0 &&
    payload.port < 65536 &&
    typeof payload.token === 'string' &&
    payload.token.length >= 8 &&
    typeof payload.fingerprint === 'string' &&
    FINGERPRINT_RE.test(payload.fingerprint)
  );
}

const parseCompact = (raw: string): PairingPayload | null => {
  if (!raw.startsWith('nb1|')) {
    return null;
  }
  const parts = raw.split('|');
  if (parts.length !== 7) {
    return null;
  }
  const port = Number(parts[4]);
  const payload: PairingPayload = {
    v: PROTOCOL_VERSION,
    app: APP_ID,
    name: parts[1],
    os: parts[2],
    host: parts[3],
    port,
    token: parts[5],
    fingerprint: parts[6],
  };
  return isPairingPayload(payload) ? payload : null;
};

export function parsePairingPayload(raw: string): PairingPayload {
  const trimmed = raw.trim();
  const compact = parseCompact(trimmed);
  if (compact) {
    return compact;
  }
  const parsed: unknown = JSON.parse(trimmed);
  if (!isPairingPayload(parsed)) {
    throw new Error('Not a Nudgeboard pairing code');
  }
  return parsed;
}
