import { NativeModules, Platform } from 'react-native';
import {
  decryptEnvelope,
  deriveKeyHex,
  encryptEnvelope,
} from './crypto';
import {
  resolveDeviceIdentity,
  type DeviceNameHints,
} from './deviceIdentity';
import {
  isPrivateLanHost,
  parsePairingPayload,
  type ClientMessage,
  type DecryptedReconnect,
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
  initialMessage: ClientMessage,
  handlers: {
    onConnected: (ok: HelloOk) => void;
    onDeck: (tiles: Array<DeckTileView | null>) => void;
    onError: (reason: string) => void;
    onClose: () => void;
    onLoggedOut?: () => void;
  },
  knownToken?: string,
): { close: () => void; send: (message: ClientMessage) => void } {
  if (!isPrivateLanHost(host)) {
    handlers.onError('That computer address is not on your local network.');
    return {
      close: () => undefined,
      send: () => undefined,
    };
  }

  let sessionKeyHex = knownToken ? deriveKeyHex(knownToken) : '';
  let inSeq = 1;
  let outSeq = 1;

  const ws = new WebSocket(`ws://${host}:${port}`);
  let opened = false;

  const sendOutgoing = (outgoing: ClientMessage) => {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (outgoing.type === 'reconnect' && sessionKeyHex) {
      const payload: DecryptedReconnect = {
        token: outgoing.token,
        device: outgoing.device,
        ts: Date.now(),
      };
      const enc = encryptEnvelope(sessionKeyHex, payload, 1);
      if (enc) {
        outSeq = 2;
        ws.send(
          JSON.stringify({
            type: 'reconnect_enc',
            id: outgoing.device.id,
            iv: enc.iv,
            data: enc.data,
            tag: enc.tag,
            seq: enc.seq,
          }),
        );
        return;
      }
    }
    if (
      sessionKeyHex &&
      outgoing.type !== 'hello' &&
      outgoing.type !== 'hello_pin' &&
      outgoing.type !== 'encrypted' &&
      outgoing.type !== 'reconnect_enc'
    ) {
      const enc = encryptEnvelope(sessionKeyHex, outgoing, outSeq);
      if (enc) {
        outSeq += 1;
        ws.send(JSON.stringify(enc));
        return;
      }
    }
    ws.send(JSON.stringify(outgoing));
  };

  ws.onopen = () => {
    opened = true;
    sendOutgoing(initialMessage);
  };

  ws.onmessage = (event) => {
    let payload: ServerMessage;
    try {
      payload = JSON.parse(String(event.data)) as ServerMessage;
    } catch {
      handlers.onError('Invalid desktop message');
      return;
    }

    if (payload.type === 'encrypted') {
      if (!sessionKeyHex) {
        return;
      }
      const decrypted = decryptEnvelope<ServerMessage>(
        sessionKeyHex,
        payload,
        inSeq,
      );
      if (!decrypted) {
        return;
      }
      inSeq += 1;
      if (decrypted.type === 'deck') {
        handlers.onDeck(decrypted.tiles);
        return;
      }
      if (decrypted.type === 'logged_out') {
        handlers.onLoggedOut?.();
        ws.close();
        return;
      }
      if (decrypted.type === 'hello_ok') {
        handlers.onConnected(decrypted);
        return;
      }
      return;
    }

    if (payload.type === 'hello_err') {
      handlers.onError(payload.reason);
      ws.close();
      return;
    }

    if (payload.type === 'hello_ok') {
      if (payload.token) {
        sessionKeyHex = deriveKeyHex(payload.token);
        inSeq = 1;
        outSeq = 1;
      }
      handlers.onConnected(payload);
      return;
    }

    if (payload.type === 'logged_out') {
      handlers.onLoggedOut?.();
      ws.close();
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
      sendOutgoing(outgoing);
    },
  };
}
