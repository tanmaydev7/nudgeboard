import { randomBytes, randomInt } from 'crypto';
import { hostname, networkInterfaces } from 'os';
import { BrowserWindow, ipcMain } from 'electron';
import QRCode from 'qrcode';
import { WebSocket, WebSocketServer } from 'ws';
import type { BridgeSnapshot, PairingSession } from '../shared/ipc-types';
import {
  APP_ID,
  DEFAULT_PORT,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ConnectedDevice,
  type PairingPayload,
  type ServerMessage,
} from '../shared/protocol';

const TOKEN_BYTES = 16;
const QR_SIZE = 240;

type DeviceSocket = {
  socket: WebSocket;
  device: ConnectedDevice;
};

let wss: WebSocketServer | null = null;
let port = DEFAULT_PORT;
let token = '';
let otp = '';
let qrDataUrl = '';
let hostName = 'Nudgeboard';
let selectedHost = '';
const devices = new Map<WebSocket, DeviceSocket>();

const listLanHosts = (): string[] => {
  const scored: { ip: string; score: number }[] = [];

  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.internal || addr.address.includes(':')) {
        continue;
      }
      const ip = addr.address;
      if (ip.startsWith('169.254.')) {
        continue;
      }
      let score = 0;
      if (ip.startsWith('192.168.')) {
        score = 3;
      } else if (ip.startsWith('10.')) {
        score = 2;
      } else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) {
        score = 1;
      }
      if (score > 0) {
        scored.push({ ip, score });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return [...new Set(scored.map((item) => item.ip))];
};

const pairingPayload = (): PairingPayload => ({
  v: PROTOCOL_VERSION,
  app: APP_ID,
  name: hostName,
  host: selectedHost,
  port,
  token,
});

const pairingSession = (): PairingSession | null => {
  if (!qrDataUrl || !otp || !token) {
    return null;
  }
  return {
    qrDataUrl,
    otp,
    payload: pairingPayload(),
    hostName,
  };
};

const snapshot = (): BridgeSnapshot => ({
  pairing: pairingSession(),
  connected: [...devices.values()].map((item) => item.device),
});

const sendToRenderer = (): void => {
  const next = snapshot();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('bridge:snapshot', next);
  }
};

const send = (socket: WebSocket, message: ServerMessage): void => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
};

const dropDevice = (socket: WebSocket): void => {
  devices.delete(socket);
  sendToRenderer();
};

const handleMessage = (socket: WebSocket, raw: string): void => {
  let message: ClientMessage;
  try {
    message = JSON.parse(raw) as ClientMessage;
  } catch {
    send(socket, { type: 'hello_err', reason: 'Invalid message' });
    return;
  }

  if (message.type !== 'hello') {
    send(socket, { type: 'hello_err', reason: 'Unknown message' });
    return;
  }

  if (!token || !otp) {
    send(socket, { type: 'hello_err', reason: 'Generate a QR code on desktop first' });
    socket.close();
    return;
  }

  if (message.token !== token) {
    send(socket, { type: 'hello_err', reason: 'Invalid pairing code' });
    socket.close();
    return;
  }

  if (message.otp !== otp) {
    send(socket, { type: 'hello_err', reason: 'Incorrect OTP' });
    socket.close();
    return;
  }

  devices.set(socket, { socket, device: message.device });
  send(socket, { type: 'hello_ok', hostName });
  sendToRenderer();
};

const listen = async (startPort: number): Promise<number> => {
  for (let nextPort = startPort; nextPort < startPort + 20; nextPort += 1) {
    const bound = await new Promise<number | null>((resolve, reject) => {
      const server = new WebSocketServer({ host: '0.0.0.0', port: nextPort });
      server.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          server.close(() => resolve(null));
          return;
        }
        reject(error);
      });
      server.once('listening', () => {
        wss = server;
        resolve(nextPort);
      });
    });
    if (bound !== null) {
      return bound;
    }
  }
  throw new Error('No free port for the Nudgeboard bridge');
};

export const startBridge = async (): Promise<void> => {
  hostName = hostname() || 'Nudgeboard';
  selectedHost = listLanHosts()[0] ?? '127.0.0.1';
  port = await listen(DEFAULT_PORT);

  wss?.on('connection', (socket) => {
    socket.on('message', (data) => {
      handleMessage(socket, data.toString());
    });
    socket.on('close', () => dropDevice(socket));
    socket.on('error', () => dropDevice(socket));
  });

  ipcMain.handle('bridge:get-snapshot', () => snapshot());
  ipcMain.handle('bridge:generate-qr', async () => {
    selectedHost = listLanHosts()[0] ?? selectedHost;
    token = randomBytes(TOKEN_BYTES).toString('hex');
    otp = String(randomInt(100000, 1000000));
    qrDataUrl = await QRCode.toDataURL(JSON.stringify(pairingPayload()), {
      margin: 1,
      width: QR_SIZE,
      color: { dark: '#111111', light: '#ffffff' },
    });
    sendToRenderer();
    return snapshot();
  });
};

export const stopBridge = (): Promise<void> => {
  for (const { socket } of devices.values()) {
    socket.close();
  }
  devices.clear();
  return new Promise((resolve) => {
    if (!wss) {
      resolve();
      return;
    }
    wss.close(() => {
      wss = null;
      resolve();
    });
  });
};
