import type { ConnectedDevice, PairingPayload } from './protocol';

export type PairingSession = {
  qrDataUrl: string;
  otp: string;
  payload: PairingPayload;
  hostName: string;
};

export type BridgeSnapshot = {
  pairing: PairingSession | null;
  connected: ConnectedDevice[];
};

export interface ElectronAPI {
  platform: NodeJS.Platform;
  getSnapshot: () => Promise<BridgeSnapshot>;
  generateQr: () => Promise<BridgeSnapshot>;
  onSnapshot: (callback: (snapshot: BridgeSnapshot) => void) => () => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
