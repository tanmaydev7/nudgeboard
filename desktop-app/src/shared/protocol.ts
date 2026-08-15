export const PROTOCOL_VERSION = 1;
export const APP_ID = 'nudgeboard';
export const DEFAULT_PORT = 47890;

export type DevicePlatform = 'ios' | 'android';

export type PairingPayload = {
  v: typeof PROTOCOL_VERSION;
  app: typeof APP_ID;
  name: string;
  host: string;
  port: number;
  token: string;
};

export type DeviceHello = {
  id: string;
  name: string;
  platform: DevicePlatform;
  model: string;
  os: string;
};

export type ConnectedDevice = DeviceHello;

export type ClientMessage = {
  type: 'hello';
  token: string;
  otp: string;
  device: DeviceHello;
};

export type ServerMessage =
  | { type: 'hello_ok'; hostName: string }
  | { type: 'hello_err'; reason: string };

export function isPairingPayload(value: unknown): value is PairingPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Partial<PairingPayload>;
  return (
    payload.v === PROTOCOL_VERSION &&
    payload.app === APP_ID &&
    typeof payload.name === 'string' &&
    typeof payload.host === 'string' &&
    typeof payload.port === 'number' &&
    Number.isInteger(payload.port) &&
    payload.port > 0 &&
    payload.port < 65536 &&
    typeof payload.token === 'string' &&
    payload.token.length >= 8
  );
}

export function parsePairingPayload(raw: string): PairingPayload {
  const parsed: unknown = JSON.parse(raw.trim());
  if (!isPairingPayload(parsed)) {
    throw new Error('Not a Nudgeboard pairing code');
  }
  return parsed;
}
