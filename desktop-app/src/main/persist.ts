import { createHash, randomBytes } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { type CustomFlow, type DeckTile } from '../shared/ipc-types';
import { formatFingerprint, type DevicePlatform } from '../shared/protocol';
import { sanitizeCustomFlow } from './validate';

export type StoredDevice = {
  id: string;
  name: string;
  model: string;
  os: string;
  platform: DevicePlatform;
  fingerprint: string;
  tokenHash: string;
  trusted: boolean;
  pairedAt: number;
};

export type PersistedState = {
  fingerprint: string;
  devices: StoredDevice[];
  activeDeviceId: string | null;
  tilesByDevice: Record<string, Array<DeckTile | null>>;
  customFlows: CustomFlow[];
};

type LegacyDevice = StoredDevice & { token?: string };

export const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const emptyState = (): PersistedState => ({
  fingerprint: formatFingerprint(randomBytes(3)),
  devices: [],
  activeDeviceId: null,
  tilesByDevice: {},
  customFlows: [],
});

export const persistPath = (): string =>
  join(app.getPath('userData'), 'nudgeboard.json');

const migrateDevice = (raw: LegacyDevice): StoredDevice | null => {
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') {
    return null;
  }
  const tokenHash =
    typeof raw.tokenHash === 'string' && raw.tokenHash.length === 64
      ? raw.tokenHash
      : typeof raw.token === 'string' && raw.token.length >= 8
        ? hashToken(raw.token)
        : '';
  if (!tokenHash) {
    return null;
  }
  return {
    id: raw.id,
    name: raw.name,
    model: raw.model,
    os: raw.os,
    platform: raw.platform,
    fingerprint: raw.fingerprint,
    tokenHash,
    trusted: raw.trusted === true,
    pairedAt: Number(raw.pairedAt) || Date.now(),
  };
};

export const loadPersisted = (): PersistedState => {
  try {
    const raw = JSON.parse(readFileSync(persistPath(), 'utf8')) as Partial<PersistedState> & {
      devices?: LegacyDevice[];
    };
    if (typeof raw.fingerprint !== 'string' || !Array.isArray(raw.devices)) {
      return emptyState();
    }
    const devices = raw.devices
      .map(migrateDevice)
      .filter((device): device is StoredDevice => device !== null);
    const customFlows = Array.isArray(raw.customFlows)
      ? raw.customFlows
          .map((flow) => sanitizeCustomFlow(flow))
          .filter((flow): flow is CustomFlow => flow !== null)
      : [];
    return {
      fingerprint: raw.fingerprint,
      devices,
      activeDeviceId:
        devices.some((device) => device.id === raw.activeDeviceId)
          ? raw.activeDeviceId ?? null
          : (devices[0]?.id ?? null),
      tilesByDevice:
        raw.tilesByDevice && typeof raw.tilesByDevice === 'object'
          ? raw.tilesByDevice
          : {},
      customFlows,
    };
  } catch {
    return emptyState();
  }
};

export const savePersisted = (state: PersistedState): void => {
  const sanitized: PersistedState = {
    ...state,
    devices: state.devices.map((device) => ({
      id: device.id,
      name: device.name,
      model: device.model,
      os: device.os,
      platform: device.platform,
      fingerprint: device.fingerprint,
      tokenHash: device.tokenHash,
      trusted: device.trusted,
      pairedAt: device.pairedAt,
    })),
  };
  writeFileSync(persistPath(), JSON.stringify(sanitized, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
};

export const forgetDevice = (
  state: PersistedState,
  deviceId: string,
): PersistedState => {
  const devices = state.devices.filter((device) => device.id !== deviceId);
  const tilesByDevice = { ...state.tilesByDevice };
  delete tilesByDevice[deviceId];
  return {
    ...state,
    devices,
    tilesByDevice,
    customFlows: devices.length === 0 ? [] : (state.customFlows ?? []),
    activeDeviceId:
      state.activeDeviceId === deviceId
        ? (devices[0]?.id ?? null)
        : state.activeDeviceId,
  };
};
