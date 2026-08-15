import { randomBytes, timingSafeEqual } from 'crypto';
import { hostname, networkInterfaces } from 'os';
import { BrowserWindow, ipcMain } from 'electron';
import QRCode from 'qrcode';
import { WebSocket, WebSocketServer } from 'ws';
import {
  GRID_COLUMNS,
  GRID_ROWS,
  GRID_SLOTS,
  type BridgeSnapshot,
  type DeckTile,
  type DeviceProfile,
  type PairingSession,
  type PendingDevice,
  type VerifyResult,
} from '../shared/ipc-types';
import {
  APP_ID,
  DEFAULT_PORT,
  OTP_TTL_MS,
  PROTOCOL_VERSION,
  QR_TTL_MS,
  encodePairingCode,
  type ClientMessage,
  type DeviceHello,
  type PairingPayload,
  type ServerMessage,
} from '../shared/protocol';
import { listDesktopApps, iconsForPaths } from './apps';
import {
  emptyTiles,
  loadPersisted,
  savePersisted,
  type PersistedState,
  type StoredDevice,
} from './persist';

const TOKEN_BYTES = 16;
const QR_SIZE = 280;

type LiveSocket = {
  socket: WebSocket;
  deviceId: string;
  ip: string;
};

type PendingPair = {
  socket: WebSocket;
  device: DeviceHello;
  otp: string;
  ip: string;
};

type Session = {
  step: PairingSession['step'];
  token: string;
  qrDataUrl: string;
  payload: PairingPayload;
  expiresAt: number;
  pending: PendingPair | null;
};

let wss: WebSocketServer | null = null;
let port = DEFAULT_PORT;
let hostName = 'NudgeBoard';
let hostOs = 'Windows';
let selectedHost = '';
let persisted: PersistedState = {
  fingerprint: '00:00:00',
  devices: [],
  activeDeviceId: null,
  tilesByDevice: {},
};
let session: Session | null = null;
let lastPairedId: string | null = null;
const live = new Map<WebSocket, LiveSocket>();

const desktopOs = (): string => {
  if (process.platform === 'darwin') {
    return 'macOS';
  }
  if (process.platform !== 'win32') {
    return 'Linux';
  }
  const version = process.getSystemVersion?.() ?? '';
  const build = Number(version.split('.')[2] ?? 0);
  if (build >= 22000) {
    return 'Windows 11';
  }
  if (version.startsWith('10.')) {
    return 'Windows 10';
  }
  return 'Windows';
};

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

const remoteIp = (socket: WebSocket): string => {
  const raw = (
    socket as WebSocket & { _socket?: { remoteAddress?: string } }
  )._socket?.remoteAddress;
  return (raw ?? '').replace(/^::ffff:/, '') || 'unknown';
};

const save = (): void => {
  savePersisted(persisted);
};

const pairingPayload = (token: string): PairingPayload => ({
  v: PROTOCOL_VERSION,
  app: APP_ID,
  name: hostName,
  os: hostOs,
  host: selectedHost,
  port,
  token,
  fingerprint: persisted.fingerprint,
});

const pendingView = (pending: PendingPair): PendingDevice => ({
  id: pending.device.id,
  name: pending.device.name,
  model: pending.device.model,
  os: pending.device.os,
  platform: pending.device.platform,
  fingerprint: pending.device.fingerprint,
  ip: pending.ip,
});

const pairingView = (): PairingSession | null => {
  if (!session) {
    return null;
  }
  return {
    step: session.step,
    qrDataUrl: session.qrDataUrl,
    payload: session.payload,
    hostName,
    fingerprint: persisted.fingerprint,
    pairingCode: encodePairingCode(session.payload),
    expiresAt: session.expiresAt,
    pending: session.pending ? pendingView(session.pending) : null,
  };
};

const toProfile = (device: StoredDevice): DeviceProfile => {
  const connection = [...live.values()].find((item) => item.deviceId === device.id);
  return {
    id: device.id,
    name: device.name,
    model: device.model,
    os: device.os,
    platform: device.platform,
    fingerprint: device.fingerprint,
    trusted: device.trusted,
    pairedAt: device.pairedAt,
    connected: Boolean(connection),
    ip: connection?.ip,
  };
};

const tilesFor = (deviceId: string | null): Array<DeckTile | null> => {
  if (!deviceId) {
    return emptyTiles();
  }
  const existing = persisted.tilesByDevice[deviceId];
  if (existing && existing.length === GRID_SLOTS) {
    return existing;
  }
  const tiles = emptyTiles();
  persisted.tilesByDevice[deviceId] = tiles;
  return tiles;
};

const snapshot = (): BridgeSnapshot => ({
  hostName,
  fingerprint: persisted.fingerprint,
  pairing: pairingView(),
  devices: persisted.devices.map(toProfile),
  activeDeviceId: persisted.activeDeviceId,
  lastPairedId,
  tiles: tilesFor(persisted.activeDeviceId),
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

const pushDeck = (deviceId: string): void => {
  const connection = [...live.values()].find((item) => item.deviceId === deviceId);
  if (!connection) {
    return;
  }
  const tiles = tilesFor(deviceId);
  const paths = tiles.flatMap((tile) =>
    tile ? [tile.iconPath ?? tile.path] : [],
  );
  void iconsForPaths(paths, 256).then((icons) => {
    if (connection.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    send(connection.socket, {
      type: 'deck',
      columns: GRID_COLUMNS,
      rows: GRID_ROWS,
      tiles: tiles.map((tile) =>
        tile
          ? {
              id: tile.id,
              name: tile.name,
              icon: icons[tile.iconPath ?? tile.path],
            }
          : null,
      ),
    });
  });
};

const otpMatch = (expected: string, received: string): boolean => {
  if (expected.length !== 6 || received.length !== 6) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
};

const sessionExpired = (): boolean =>
  Boolean(session && session.expiresAt <= Date.now());

const rejectPending = (reason: string): void => {
  if (!session?.pending) {
    return;
  }
  send(session.pending.socket, { type: 'hello_err', reason });
  session.pending.socket.close();
  session.pending = null;
};

const clearSession = (reason?: string): void => {
  if (reason) {
    rejectPending(reason);
  } else if (session?.pending) {
    session.pending.socket.close();
    session.pending = null;
  }
  session = null;
};

const dropSocket = (socket: WebSocket): void => {
  if (session?.pending?.socket === socket) {
    session.pending = null;
    session.step = 'qr';
  }
  live.delete(socket);
  sendToRenderer();
};

const dropDeviceId = (id: string): void => {
  for (const [socket, item] of live) {
    if (item.deviceId === id) {
      socket.close();
      live.delete(socket);
    }
  }
};

const acceptDevice = (
  socket: WebSocket,
  device: DeviceHello,
  token: string,
  trusted: boolean,
  ip: string,
): void => {
  dropDeviceId(device.id);
  const stored: StoredDevice = {
    id: device.id,
    name: device.name,
    model: device.model,
    os: device.os,
    platform: device.platform,
    fingerprint: device.fingerprint,
    token,
    trusted,
    pairedAt: Date.now(),
  };
  const index = persisted.devices.findIndex((item) => item.id === device.id);
  if (index >= 0) {
    persisted.devices[index] = stored;
  } else {
    persisted.devices.push(stored);
  }
  if (!persisted.activeDeviceId) {
    persisted.activeDeviceId = device.id;
  }
  if (!persisted.tilesByDevice[device.id]) {
    persisted.tilesByDevice[device.id] = emptyTiles();
  }
  save();
  live.set(socket, { socket, deviceId: device.id, ip });
  send(socket, {
    type: 'hello_ok',
    hostName,
    fingerprint: persisted.fingerprint,
  });
  pushDeck(device.id);
};

const handleHello = (socket: WebSocket, message: Extract<ClientMessage, { type: 'hello' }>, ip: string): void => {
  if (!session || sessionExpired()) {
    send(socket, { type: 'hello_err', reason: 'Pairing code expired. Generate a new QR.' });
    socket.close();
    return;
  }
  if (message.token !== session.token) {
    send(socket, { type: 'hello_err', reason: 'Invalid pairing code' });
    socket.close();
    return;
  }
  if (session.pending && session.pending.socket !== socket) {
    send(socket, { type: 'hello_err', reason: 'Another device is already pairing' });
    socket.close();
    return;
  }
  if (!/^\d{6}$/.test(message.otp)) {
    send(socket, { type: 'hello_err', reason: 'Invalid code' });
    socket.close();
    return;
  }

  session.pending = {
    socket,
    device: message.device,
    otp: message.otp,
    ip,
  };
  session.step = 'otp';
  session.expiresAt = Date.now() + OTP_TTL_MS;
  sendToRenderer();
};

const handleReconnect = (
  socket: WebSocket,
  message: Extract<ClientMessage, { type: 'reconnect' }>,
  ip: string,
): void => {
  const stored = persisted.devices.find(
    (item) => item.id === message.device.id && item.token === message.token,
  );
  if (!stored || !stored.trusted) {
    send(socket, {
      type: 'hello_err',
      reason: 'This computer does not recognize the phone. Pair again.',
    });
    socket.close();
    return;
  }

  stored.name = message.device.name;
  stored.model = message.device.model;
  stored.os = message.device.os;
  stored.fingerprint = message.device.fingerprint;
  save();
  dropDeviceId(stored.id);
  live.set(socket, { socket, deviceId: stored.id, ip });
  send(socket, {
    type: 'hello_ok',
    hostName,
    fingerprint: persisted.fingerprint,
  });
  pushDeck(stored.id);
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

  const ip = remoteIp(socket);
  if (message.type === 'reconnect') {
    handleReconnect(socket, message, ip);
    return;
  }
  if (message.type === 'hello') {
    handleHello(socket, message, ip);
    return;
  }
  send(socket, { type: 'hello_err', reason: 'Unknown message' });
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

const startPairing = async (): Promise<BridgeSnapshot> => {
  selectedHost = listLanHosts()[0] ?? selectedHost;
  clearSession('Pairing restarted');
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const payload = pairingPayload(token);
  const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
    margin: 1,
    width: QR_SIZE,
    color: { dark: '#111111', light: '#ffffff' },
  });
  session = {
    step: 'qr',
    token,
    qrDataUrl,
    payload,
    expiresAt: Date.now() + QR_TTL_MS,
    pending: null,
  };
  lastPairedId = null;
  sendToRenderer();
  return snapshot();
};

export const startBridge = async (): Promise<void> => {
  hostName = hostname() || 'NudgeBoard';
  hostOs = desktopOs();
  persisted = loadPersisted();
  save();
  selectedHost = listLanHosts()[0] ?? '127.0.0.1';
  port = await listen(DEFAULT_PORT);

  wss?.on('connection', (socket) => {
    socket.on('message', (data) => {
      handleMessage(socket, data.toString());
    });
    socket.on('close', () => dropSocket(socket));
    socket.on('error', () => dropSocket(socket));
  });

  ipcMain.handle('bridge:get-snapshot', () => snapshot());
  ipcMain.handle('bridge:generate-qr', () => startPairing());
  ipcMain.handle('bridge:cancel-pairing', () => {
    clearSession('Pairing cancelled');
    sendToRenderer();
    return snapshot();
  });
  ipcMain.handle('bridge:verify-otp', (_event, otp: string): VerifyResult => {
    if (!session?.pending) {
      return { ok: false, reason: 'No device is pairing right now' };
    }
    if (session.step !== 'otp') {
      return { ok: false, reason: 'Scan the QR code first' };
    }
    if (sessionExpired()) {
      clearSession('Code expired');
      sendToRenderer();
      return { ok: false, reason: 'Code expired. Pair again.' };
    }
    if (!otpMatch(session.pending.otp, otp.trim())) {
      return { ok: false, reason: 'That code does not match' };
    }

    const pending = session.pending;
    const token = session.token;
    session.pending = null;
    session = null;
    acceptDevice(pending.socket, pending.device, token, true, pending.ip);
    lastPairedId = pending.device.id;
    persisted.activeDeviceId = pending.device.id;
    save();
    sendToRenderer();
    return { ok: true, snapshot: snapshot() };
  });
  ipcMain.handle('bridge:set-active-device', (_event, id: string) => {
    if (persisted.devices.some((device) => device.id === id)) {
      persisted.activeDeviceId = id;
      save();
      sendToRenderer();
    }
    return snapshot();
  });
  ipcMain.handle('bridge:list-apps', () => listDesktopApps());
  ipcMain.handle('bridge:get-app-icons', (_event, paths: string[]) =>
    iconsForPaths(paths),
  );
  ipcMain.handle(
    'bridge:set-tile',
    (_event, index: number, tile: DeckTile | null) => {
      const deviceId = persisted.activeDeviceId;
      if (
        !deviceId ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= GRID_SLOTS
      ) {
        return snapshot();
      }
      const tiles = tilesFor(deviceId).slice();
      tiles[index] = tile;
      persisted.tilesByDevice[deviceId] = tiles;
      save();
      sendToRenderer();
      pushDeck(deviceId);
      return snapshot();
    },
  );
  ipcMain.handle('bridge:remove-device', (_event, id: string) => {
    dropDeviceId(id);
    persisted.devices = persisted.devices.filter((device) => device.id !== id);
    delete persisted.tilesByDevice[id];
    if (persisted.activeDeviceId === id) {
      persisted.activeDeviceId = persisted.devices[0]?.id ?? null;
    }
    save();
    sendToRenderer();
    return snapshot();
  });
};

export const stopBridge = (): Promise<void> => {
  clearSession();
  for (const { socket } of live.values()) {
    socket.close();
  }
  live.clear();
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
