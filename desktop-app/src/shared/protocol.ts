export const PROTOCOL_VERSION = 1;
export const APP_ID = 'nudgeboard';
export const DEFAULT_PORT = 47890;
export const QR_TTL_MS = 5 * 60 * 1000;
export const OTP_TTL_MS = 2 * 60 * 1000;

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

export type EncryptedEnvelope = {
  type: 'encrypted';
  iv: string;
  data: string;
  tag: string;
  seq: number;
};

export type DecryptedReconnect = {
  token: string;
  device: DeviceHello;
  ts: number;
};

export type WidgetType = 'media' | 'volume';

export type DeckTileType = 'app' | 'utility' | 'custom' | 'widget';

export type DeckTileView = {
  id: string;
  name: string;
  icon?: string;
  tileType?: DeckTileType;
  widgetType?: WidgetType;
  colSpan?: number;
  rowSpan?: number;
};

export type MediaState = {
  title: string;
  artist: string;
  album?: string;
  sourceApp?: string;
  artwork?: string;
  isPlaying: boolean;
  canPlay?: boolean;
  canPause?: boolean;
  canNext?: boolean;
  canPrev?: boolean;
  positionSec?: number;
  durationSec?: number;
  updatedAt?: number;
  sessionId?: string;
};

export type VolumeState = {
  volume: number;
  isMuted: boolean;
};

export type WidgetActionType =
  | 'media_play_pause'
  | 'media_next'
  | 'media_prev'
  | 'media_stop'
  | 'set_volume'
  | 'toggle_mute';

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
      type: 'reconnect_enc';
      id: string;
      iv: string;
      data: string;
      tag: string;
      seq: number;
    }
  | {
      type: 'press';
      id: string;
    }
  | {
      type: 'widget_action';
      action: WidgetActionType;
      value?: number;
      id?: string;
    }
  | {
      type: 'logout';
    }
  | EncryptedEnvelope;

export type HelloOk = {
  type: 'hello_ok';
  hostName: string;
  fingerprint: string;
  /** Issued once after a successful pair. Omitted on reconnect. */
  token?: string;
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
    }
  | {
      type: 'media_state';
      state: MediaState | null;
    }
  | {
      type: 'volume_state';
      state: VolumeState;
    }
  | EncryptedEnvelope;

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

export function isPrivateLanHost(host: string): boolean {
  const ip = host.trim().toLowerCase();
  if (ip === 'localhost' || ip === '127.0.0.1') {
    return true;
  }
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    return false;
  }
  const octets = parts.map(Number);
  if (octets.some((value) => value > 255)) {
    return false;
  }
  const [a, b] = octets;
  if (a === 10) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  return false;
}

export function nextLanBindHost(
  available: string[],
  current: string,
): string | null {
  if (available[0]) {
    return available[0];
  }
  return current || null;
}

export function isPairingPin(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export function makePairingPin(seed: number): string {
  return String(100000 + (Math.abs(seed) % 900000));
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function encodePairingCode(payload: PairingPayload): string {
  return [
    'nb1',
    payload.name,
    payload.os,
    payload.host,
    String(payload.port),
    payload.token,
    payload.fingerprint,
  ].join('|');
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
    FINGERPRINT_RE.test(payload.fingerprint) &&
    isPrivateLanHost(payload.host)
  );
}

const isDeviceHello = (value: unknown): value is DeviceHello => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const device = value as Partial<DeviceHello>;
  return (
    typeof device.id === 'string' &&
    device.id.length > 0 &&
    device.id.length <= 128 &&
    typeof device.name === 'string' &&
    device.name.length > 0 &&
    device.name.length <= 128 &&
    (device.platform === 'ios' || device.platform === 'android') &&
    typeof device.model === 'string' &&
    device.model.length <= 128 &&
    typeof device.os === 'string' &&
    device.os.length <= 64 &&
    typeof device.fingerprint === 'string' &&
    FINGERPRINT_RE.test(device.fingerprint)
  );
};

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const message = raw as { type?: unknown };
  if (message.type === 'encrypted') {
    const enc = raw as Partial<EncryptedEnvelope>;
    if (
      typeof enc.iv === 'string' &&
      enc.iv.length > 0 &&
      enc.iv.length <= 64 &&
      typeof enc.data === 'string' &&
      enc.data.length > 0 &&
      enc.data.length <= 65536 &&
      typeof enc.tag === 'string' &&
      enc.tag.length > 0 &&
      enc.tag.length <= 64 &&
      typeof enc.seq === 'number' &&
      Number.isInteger(enc.seq) &&
      enc.seq > 0
    ) {
      return {
        type: 'encrypted',
        iv: enc.iv,
        data: enc.data,
        tag: enc.tag,
        seq: enc.seq,
      };
    }
    return null;
  }
  if (message.type === 'reconnect_enc') {
    const enc = raw as {
      id?: unknown;
      iv?: unknown;
      data?: unknown;
      tag?: unknown;
      seq?: unknown;
    };
    if (
      typeof enc.id === 'string' &&
      enc.id.length > 0 &&
      enc.id.length <= 128 &&
      typeof enc.iv === 'string' &&
      enc.iv.length > 0 &&
      enc.iv.length <= 64 &&
      typeof enc.data === 'string' &&
      enc.data.length > 0 &&
      enc.data.length <= 65536 &&
      typeof enc.tag === 'string' &&
      enc.tag.length > 0 &&
      enc.tag.length <= 64 &&
      typeof enc.seq === 'number' &&
      Number.isInteger(enc.seq) &&
      enc.seq > 0
    ) {
      return {
        type: 'reconnect_enc',
        id: enc.id,
        iv: enc.iv,
        data: enc.data,
        tag: enc.tag,
        seq: enc.seq,
      };
    }
    return null;
  }
  if (message.type === 'logout') {
    return { type: 'logout' };
  }
  if (message.type === 'press') {
    const id = (raw as { id?: unknown }).id;
    if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
      return null;
    }
    return { type: 'press', id };
  }
  if (message.type === 'widget_action') {
    const act = raw as { action?: unknown; value?: unknown; id?: unknown };
    if (
      typeof act.action === 'string' &&
      act.action.length > 0 &&
      act.action.length <= 64
    ) {
      const value =
        typeof act.value === 'number' && Number.isFinite(act.value)
          ? act.value
          : undefined;
      const id =
        typeof act.id === 'string' && act.id.length <= 128 ? act.id : undefined;
      return {
        type: 'widget_action',
        action: act.action as WidgetActionType,
        value,
        id,
      };
    }
    return null;
  }
  if (message.type === 'hello') {
    const body = raw as { token?: unknown; otp?: unknown; device?: unknown };
    if (
      typeof body.token !== 'string' ||
      body.token.length < 8 ||
      body.token.length > 128 ||
      typeof body.otp !== 'string' ||
      !/^\d{6}$/.test(body.otp) ||
      !isDeviceHello(body.device)
    ) {
      return null;
    }
    return {
      type: 'hello',
      token: body.token,
      otp: body.otp,
      device: body.device,
    };
  }
  if (message.type === 'hello_pin') {
    const body = raw as { pin?: unknown; device?: unknown };
    if (
      typeof body.pin !== 'string' ||
      !/^\d{6}$/.test(body.pin) ||
      !isDeviceHello(body.device)
    ) {
      return null;
    }
    return { type: 'hello_pin', pin: body.pin, device: body.device };
  }
  if (message.type === 'reconnect') {
    const body = raw as { token?: unknown; device?: unknown };
    if (
      typeof body.token !== 'string' ||
      body.token.length < 8 ||
      body.token.length > 128 ||
      !isDeviceHello(body.device)
    ) {
      return null;
    }
    return { type: 'reconnect', token: body.token, device: body.device };
  }
  return null;
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
