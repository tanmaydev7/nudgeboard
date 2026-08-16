import type { DevicePlatform, PairingPayload } from './protocol';

export const GRID_COLUMNS = 4;
export const GRID_ROWS = 2;
export const GRID_SLOTS = GRID_COLUMNS * GRID_ROWS;
export const MAX_PAGES = 8;

export type PairingStep = 'qr' | 'otp';

export type PendingDevice = {
  id: string;
  name: string;
  model: string;
  os: string;
  platform: DevicePlatform;
  fingerprint: string;
  ip: string;
};

export type PairingSession = {
  step: PairingStep;
  qrDataUrl: string;
  payload: PairingPayload;
  hostName: string;
  fingerprint: string;
  pairingCode: string;
  expiresAt: number;
  pending: PendingDevice | null;
};

export type DeviceProfile = {
  id: string;
  name: string;
  model: string;
  os: string;
  platform: DevicePlatform;
  fingerprint: string;
  trusted: boolean;
  pairedAt: number;
  connected: boolean;
  ip?: string;
};

export type DesktopApp = {
  id: string;
  name: string;
  path: string;
  iconPath?: string;
};

export type DeckTile = {
  id: string;
  name: string;
  path: string;
  iconPath?: string;
};

export const emptyTiles = (): Array<DeckTile | null> =>
  Array.from({ length: GRID_SLOTS }, (): DeckTile | null => null);

export const deckPageCount = (tiles: Array<unknown>): number =>
  Math.min(
    MAX_PAGES,
    Math.max(1, Math.ceil(tiles.length / GRID_SLOTS) || 1),
  );

export const normalizeTiles = (
  tiles: Array<DeckTile | null>,
): Array<DeckTile | null> => {
  const size = deckPageCount(tiles) * GRID_SLOTS;
  const next = tiles.slice(0, size);
  while (next.length < size) {
    next.push(null);
  }
  return next;
};

export type BridgeSnapshot = {
  hostName: string;
  fingerprint: string;
  pairing: PairingSession | null;
  devices: DeviceProfile[];
  activeDeviceId: string | null;
  lastPairedId: string | null;
  tiles: Array<DeckTile | null>;
};

export type VerifyResult =
  | { ok: true; snapshot: BridgeSnapshot }
  | { ok: false; reason: string };

export interface ElectronAPI {
  platform: NodeJS.Platform;
  getSnapshot: () => Promise<BridgeSnapshot>;
  generateQr: () => Promise<BridgeSnapshot>;
  cancelPairing: () => Promise<BridgeSnapshot>;
  verifyOtp: (otp: string) => Promise<VerifyResult>;
  setActiveDevice: (id: string) => Promise<BridgeSnapshot>;
  listApps: () => Promise<DesktopApp[]>;
  getAppIcons: (paths: string[]) => Promise<Record<string, string>>;
  setTile: (index: number, tile: DeckTile | null) => Promise<BridgeSnapshot>;
  addPage: () => Promise<BridgeSnapshot>;
  removePage: (page: number) => Promise<BridgeSnapshot>;
  removeDevice: (id: string) => Promise<BridgeSnapshot>;
  onSnapshot: (callback: (snapshot: BridgeSnapshot) => void) => () => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
