import { NativeModules, Platform } from 'react-native';
import {
  resolveDeviceIdentity,
  type DeviceNameHints,
} from './deviceIdentity';
import {
  parsePairingPayload,
  type ClientMessage,
  type DeckTileView,
  type DeviceHello,
  type HelloOk,
  type ServerMessage,
} from './protocol';
import { useAppStore } from './store';

export { parsePairingPayload };

type NudgeDeviceModule = DeviceNameHints & {
  getHints?: () => DeviceNameHints;
};

const readDeviceHints = (): DeviceNameHints => {
  const native = NativeModules.NudgeDevice as NudgeDeviceModule | undefined;
  const live = native?.getHints?.() ?? native;
  const constants = Platform.constants as {
    Brand?: string;
    Manufacturer?: string;
    Model?: string;
  };
  return {
    names: live?.names,
    userName: live?.userName,
    marketName: live?.marketName,
    manufacturer:
      live?.manufacturer || constants.Manufacturer || constants.Brand,
    model: live?.model || constants.Model,
  };
};

export function getDeviceInfo(): DeviceHello {
  const { deviceId, fingerprint } = useAppStore.getState();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const identity = resolveDeviceIdentity(platform, readDeviceHints());

  if (platform === 'android') {
    const release = (Platform.constants as { Release?: string }).Release;
    return {
      id: deviceId,
      name: identity.name,
      platform,
      model: identity.model,
      os: release ? `Android ${release}` : 'Android',
      fingerprint,
    };
  }

  return {
    id: deviceId,
    name: identity.name,
    platform,
    model: identity.model,
    os: `iOS ${String(Platform.Version)}`,
    fingerprint,
  };
}

export function connectBridge(
  host: string,
  port: number,
  message: ClientMessage,
  handlers: {
    onConnected: (ok: HelloOk) => void;
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
      handlers.onConnected(payload);
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
