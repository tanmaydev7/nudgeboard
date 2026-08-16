import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { type CustomFlow, type DeckTile } from '../shared/ipc-types';
import { formatFingerprint, type DevicePlatform } from '../shared/protocol';

export type StoredDevice = {
  id: string;
  name: string;
  model: string;
  os: string;
  platform: DevicePlatform;
  fingerprint: string;
  token: string;
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

export const emptyState = (): PersistedState => ({
  fingerprint: formatFingerprint(randomBytes(3)),
  devices: [],
  activeDeviceId: null,
  tilesByDevice: {},
  customFlows: [],
});

export const persistPath = (): string =>
  join(app.getPath('userData'), 'nudgeboard.json');

export const loadPersisted = (): PersistedState => {
  try {
    const raw = JSON.parse(readFileSync(persistPath(), 'utf8')) as Partial<PersistedState>;
    if (typeof raw.fingerprint !== 'string' || !Array.isArray(raw.devices)) {
      return emptyState();
    }
    return {
      fingerprint: raw.fingerprint,
      devices: raw.devices,
      activeDeviceId: raw.activeDeviceId ?? raw.devices[0]?.id ?? null,
      tilesByDevice:
        raw.tilesByDevice && typeof raw.tilesByDevice === 'object'
          ? raw.tilesByDevice
          : {},
      customFlows: Array.isArray(raw.customFlows) ? raw.customFlows : [],
    };
  } catch {
    return emptyState();
  }
};

export const savePersisted = (state: PersistedState): void => {
  writeFileSync(persistPath(), JSON.stringify(state, null, 2), 'utf8');
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
