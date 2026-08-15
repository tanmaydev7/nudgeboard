import { Platform } from 'react-native';
import {
  parsePairingPayload,
  type ClientMessage,
  type DeviceHello,
  type PairingPayload,
  type ServerMessage,
} from './protocol';

export { parsePairingPayload };

const deviceId = `${Platform.OS}-${Math.random().toString(36).slice(2, 10)}`;

export function getDeviceInfo(): DeviceHello {
  if (Platform.OS === 'android') {
    const constants = Platform.constants as {
      Model?: string;
      Release?: string;
    };
    const model = constants.Model ?? 'Android';
    return {
      id: deviceId,
      name: model,
      platform: 'android',
      model,
      os: constants.Release ? `Android ${constants.Release}` : 'Android',
    };
  }

  return {
    id: deviceId,
    name: 'iPhone',
    platform: 'ios',
    model: 'iPhone',
    os: `iOS ${String(Platform.Version)}`,
  };
}

export async function scanPairingQr(): Promise<PairingPayload> {
  const { DataScanner } = await import('react-native-data-scanner');
  const barcode = await DataScanner.scanBarcode({
    targetFormats: ['qr'],
  });
  return parsePairingPayload(barcode.value);
}

export function connectBridge(
  payload: PairingPayload,
  otp: string,
  handlers: {
    onConnected: (hostName: string) => void;
    onError: (reason: string) => void;
    onClose: () => void;
  },
): { close: () => void } {
  const ws = new WebSocket(`ws://${payload.host}:${payload.port}`);
  let opened = false;

  ws.onopen = () => {
    opened = true;
    const hello: ClientMessage = {
      type: 'hello',
      token: payload.token,
      otp,
      device: getDeviceInfo(),
    };
    ws.send(JSON.stringify(hello));
  };

  ws.onmessage = (event) => {
    let message: ServerMessage;
    try {
      message = JSON.parse(String(event.data)) as ServerMessage;
    } catch {
      handlers.onError('Invalid desktop message');
      return;
    }

    if (message.type === 'hello_err') {
      handlers.onError(message.reason);
      ws.close();
      return;
    }

    if (message.type === 'hello_ok') {
      handlers.onConnected(message.hostName);
    }
  };

  ws.onerror = () => {
    handlers.onError('Could not reach the desktop app');
  };

  ws.onclose = () => {
    if (opened) {
      handlers.onClose();
    }
  };

  return {
    close: () => {
      ws.close();
    },
  };
}
