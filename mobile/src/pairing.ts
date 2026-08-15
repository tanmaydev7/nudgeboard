import { Platform } from 'react-native';
import {
  parsePairingPayload,
  type ClientMessage,
  type DeckTileView,
  type DeviceHello,
  type ServerMessage,
} from './protocol';
import { useAppStore } from './store';

export { parsePairingPayload };

export function getDeviceInfo(): DeviceHello {
  const { deviceId, fingerprint } = useAppStore.getState();
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
      fingerprint,
    };
  }

  return {
    id: deviceId,
    name: 'iPhone',
    platform: 'ios',
    model: 'iPhone',
    os: `iOS ${String(Platform.Version)}`,
    fingerprint,
  };
}

export function connectBridge(
  host: string,
  port: number,
  message: ClientMessage,
  handlers: {
    onConnected: (hostName: string, fingerprint: string) => void;
    onDeck: (tiles: Array<DeckTileView | null>) => void;
    onError: (reason: string) => void;
    onClose: () => void;
  },
): { close: () => void; send: (message: ClientMessage) => void } {
  const ws = new WebSocket(`ws://${host}:${port}`);
  let opened = false;

  ws.onopen = () => {
    opened = true;
    ws.send(JSON.stringify(message));
  };

  ws.onmessage = (event) => {
    let payload: ServerMessage;
    try {
      payload = JSON.parse(String(event.data)) as ServerMessage;
    } catch {
      handlers.onError('Invalid desktop message');
      return;
    }

    if (payload.type === 'hello_err') {
      handlers.onError(payload.reason);
      ws.close();
      return;
    }

    if (payload.type === 'hello_ok') {
      handlers.onConnected(payload.hostName, payload.fingerprint);
      return;
    }

    if (payload.type === 'deck') {
      handlers.onDeck(payload.tiles);
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
    send: (outgoing: ClientMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(outgoing));
      }
    },
  };
}
