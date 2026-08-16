import { randomBytes, timingSafeEqual } from 'crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { hostname, networkInterfaces } from 'os';
import { basename } from 'path';
import { readFile } from 'fs/promises';
import { BrowserWindow, dialog, ipcMain, nativeImage } from 'electron';
import QRCode from 'qrcode';
import { WebSocket, WebSocketServer } from 'ws';
import {
  GRID_COLUMNS,
  GRID_ROWS,
  GRID_SLOTS,
  MAX_PAGES,
  emptyTiles,
  normalizeTiles,
  type BridgeSnapshot,
  type BrowseFileResult,
  type CustomFlow,
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
  makePairingPin,
  type ClientMessage,
  type DeviceHello,
  type PairingPayload,
  type ServerMessage,
} from '../shared/protocol';
import { listDesktopApps, iconsForPaths, iconDataUrl } from './apps';
import { executeTile } from './executor';
import {
  closeIconRasterizer,
  ensurePngDataUrl,
  getIconForPresetOrUtility,
  getPresetIconDataUrls,
  getUtilityIconDataUrls,
  renderSvgToPngDataUrl,
} from './icons';
import {
  forgetDevice,
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
  pin: string;
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
  customFlows: [],
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
    pairingCode: session.pin,
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
  const tiles = existing ? normalizeTiles(existing) : emptyTiles();
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
  customFlows: persisted.customFlows ?? [],
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
  const appPaths: string[] = [];
  for (const tile of tiles) {
    if (!tile) {
      continue;
    }
    if (
      tile.tileType === 'utility' ||
      tile.utilityAction ||
      tile.path.startsWith('utility:')
    ) {
      continue;
    }
    if (
      tile.tileType === 'custom' ||
      tile.customFlow ||
      tile.path.startsWith('custom:')
    ) {
      if (tile.customFlow?.iconPath) {
        appPaths.push(tile.customFlow.iconPath);
      }
      continue;
    }
    appPaths.push(tile.iconPath ?? tile.path);
  }

  void iconsForPaths(appPaths, 256).then(async (appIcons) => {
    if (connection.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const payload = await Promise.all(
      tiles.map(async (tile) => {
        if (!tile) {
          return null;
        }

        // 1. Utility tile
        if (
          tile.tileType === 'utility' ||
          tile.utilityAction ||
          tile.path.startsWith('utility:')
        ) {
          const action =
            tile.utilityAction ??
            tile.path.replace(/^utility:/, '');
          return {
            id: tile.id,
            name: tile.name,
            icon: await ensurePngDataUrl(getIconForPresetOrUtility(action)),
          };
        }

        // 2. Custom Flow tile
        if (
          tile.tileType === 'custom' ||
          tile.customFlow ||
          tile.path.startsWith('custom:')
        ) {
          const flow =
            tile.customFlow ??
            persisted.customFlows.find((f) => f.id === tile.id);
          let icon = flow?.iconDataUrl;
          if (!icon && flow?.iconPreset) {
            icon = getIconForPresetOrUtility(flow.iconPreset);
          }
          if (!icon && flow?.iconPath) {
            icon = appIcons[flow.iconPath];
          }
          if (!icon && tile.iconPath) {
            icon =
              getIconForPresetOrUtility(tile.iconPath) ??
              appIcons[tile.iconPath];
          }
          if (!icon) {
            icon = getIconForPresetOrUtility('preset:terminal');
          }
          return {
            id: tile.id,
            name: tile.name,
            icon: await ensurePngDataUrl(icon),
          };
        }

        // 3. Standard App
        return {
          id: tile.id,
          name: tile.name,
          icon: appIcons[tile.iconPath ?? tile.path],
        };
      }),
    );
    if (connection.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    send(connection.socket, {
      type: 'deck',
      columns: GRID_COLUMNS,
      rows: GRID_ROWS,
      tiles: payload,
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

const unpairDevice = (id: string): void => {
  for (const [socket, item] of live) {
    if (item.deviceId === id) {
      send(socket, { type: 'logged_out' });
      socket.close();
      live.delete(socket);
    }
  }
  persisted = forgetDevice(persisted, id);
  if (lastPairedId === id) {
    lastPairedId = null;
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
  send(socket, helloOk(token));
  pushDeck(device.id);
};

const helloOk = (token: string): Extract<ServerMessage, { type: 'hello_ok' }> => ({
  type: 'hello_ok',
  hostName,
  fingerprint: persisted.fingerprint,
  token,
  host: selectedHost,
  port,
  os: hostOs,
});

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

const handleHelloPin = (
  socket: WebSocket,
  message: Extract<ClientMessage, { type: 'hello_pin' }>,
  ip: string,
): void => {
  if (!session || sessionExpired()) {
    send(socket, { type: 'hello_err', reason: 'Pairing code expired. Generate a new QR.' });
    socket.close();
    return;
  }
  if (session.pending) {
    send(socket, { type: 'hello_err', reason: 'Another device is already pairing' });
    socket.close();
    return;
  }
  if (!otpMatch(session.pin, message.pin.trim())) {
    send(socket, { type: 'hello_err', reason: 'Invalid pairing code' });
    socket.close();
    return;
  }

  const token = session.token;
  session = null;
  acceptDevice(socket, message.device, token, true, ip);
  lastPairedId = message.device.id;
  persisted.activeDeviceId = message.device.id;
  save();
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
  send(socket, helloOk(stored.token));
  pushDeck(stored.id);
  sendToRenderer();
};

const handlePress = (
  socket: WebSocket,
  message: Extract<ClientMessage, { type: 'press' }>,
): void => {
  const item = live.get(socket);
  if (!item || typeof message.id !== 'string' || message.id.length === 0) {
    return;
  }
  const tile = tilesFor(item.deviceId).find((entry) => entry?.id === message.id);
  if (!tile) {
    return;
  }
  void executeTile(tile, persisted.customFlows).catch((err: unknown): void => {
    console.error('[nudgeboard] executeTile failed', err);
  });
};

const handleLogout = (socket: WebSocket): void => {
  const item = live.get(socket);
  if (!item) {
    return;
  }
  unpairDevice(item.deviceId);
  save();
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
  if (message.type === 'hello_pin') {
    handleHelloPin(socket, message, ip);
    return;
  }
  if (message.type === 'press') {
    handlePress(socket, message);
    return;
  }
  if (message.type === 'logout') {
    handleLogout(socket);
    return;
  }
  send(socket, { type: 'hello_err', reason: 'Unknown message' });
};

const pairingProbe = (req: IncomingMessage, res: ServerResponse): void => {
  if (
    req.method === 'GET' &&
    (req.url === '/nudgeboard/pairing' || req.url === '/nudgeboard/pairing/')
  ) {
    if (session && !sessionExpired()) {
      res.writeHead(200, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      });
      res.end(
        JSON.stringify({
          app: APP_ID,
          name: hostName,
          fingerprint: persisted.fingerprint,
        }),
      );
      return;
    }
    res.writeHead(204, { 'access-control-allow-origin': '*' });
    res.end();
    return;
  }
  res.writeHead(404);
  res.end();
};

const listen = async (startPort: number): Promise<number> => {
  for (let nextPort = startPort; nextPort < startPort + 20; nextPort += 1) {
    const bound = await new Promise<number | null>((resolve, reject) => {
      const httpServer = createServer(pairingProbe);
      const server = new WebSocketServer({ server: httpServer });
      httpServer.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          httpServer.close(() => resolve(null));
          return;
        }
        reject(error);
      });
      httpServer.once('listening', () => {
        wss = server;
        resolve(nextPort);
      });
      httpServer.listen(nextPort, '0.0.0.0');
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
  const pin = makePairingPin(randomBytes(4).readUInt32BE(0));
  const payload = pairingPayload(token);
  const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
    margin: 1,
    width: QR_SIZE,
    color: { dark: '#111111', light: '#ffffff' },
  });
  session = {
    step: 'qr',
    token,
    pin,
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
    iconsForPaths(paths, 256),
  );
  ipcMain.handle('bridge:get-utility-icons', () => getUtilityIconDataUrls());
  ipcMain.handle('bridge:get-preset-icons', () => getPresetIconDataUrls());
  ipcMain.handle(
    'bridge:save-custom-flow',
    (_event, flow: CustomFlow): BridgeSnapshot => {
      const list = persisted.customFlows ?? [];
      const idx = list.findIndex((f) => f.id === flow.id);
      if (idx >= 0) {
        list[idx] = flow;
      } else {
        list.push(flow);
      }
      persisted.customFlows = list;

      // Update any active deck tiles referencing this custom flow
      for (const deviceId of Object.keys(persisted.tilesByDevice)) {
        const tiles = persisted.tilesByDevice[deviceId];
        let modified = false;
        for (let i = 0; i < tiles.length; i++) {
          const t = tiles[i];
          if (t && (t.id === flow.id || t.path === `custom:${flow.id}`)) {
            tiles[i] = {
              ...t,
              name: flow.name,
              iconPath: flow.iconPath,
              customFlow: flow,
            };
            modified = true;
          }
        }
        if (modified) {
          pushDeck(deviceId);
        }
      }

      save();
      sendToRenderer();
      return snapshot();
    },
  );
  ipcMain.handle(
    'bridge:delete-custom-flow',
    (_event, id: string): BridgeSnapshot => {
      persisted.customFlows = (persisted.customFlows ?? []).filter(
        (f) => f.id !== id,
      );
      save();
      sendToRenderer();
      return snapshot();
    },
  );
  ipcMain.handle(
    'bridge:browse-file',
    async (
      _event,
      filter?: 'executable' | 'image' | 'all',
    ): Promise<BrowseFileResult | null> => {
      const win =
        BrowserWindow.getFocusedWindow() ??
        BrowserWindow.getAllWindows()[0];
      let filters: Electron.FileFilter[] = [];
      if (filter === 'executable') {
        if (process.platform === 'win32') {
          filters = [
            {
              name: 'Programs & Scripts (*.exe, *.bat, *.cmd, *.ps1, *.lnk)',
              extensions: ['exe', 'bat', 'cmd', 'ps1', 'lnk', 'url', 'vbs', 'py', 'js'],
            },
            { name: 'All Files (*.*)', extensions: ['*'] },
          ];
        } else if (process.platform === 'darwin') {
          filters = [
            {
              name: 'Applications & Scripts (*.app, *.sh, *.command)',
              extensions: ['app', 'sh', 'command', 'py', 'js'],
            },
            { name: 'All Files (*.*)', extensions: ['*'] },
          ];
        } else {
          filters = [
            {
              name: 'Binaries & Scripts (*.sh, *.desktop, *.bin)',
              extensions: ['sh', 'desktop', 'bin', 'py', 'js'],
            },
            { name: 'All Files (*.*)', extensions: ['*'] },
          ];
        }
      } else if (filter === 'image') {
        filters = [
          {
            name: 'Image Files (*.png, *.jpg, *.jpeg, *.ico, *.webp, *.svg)',
            extensions: ['png', 'jpg', 'jpeg', 'ico', 'webp', 'svg', 'gif', 'bmp'],
          },
          { name: 'All Files (*.*)', extensions: ['*'] },
        ];
      } else {
        filters = [{ name: 'All Files (*.*)', extensions: ['*'] }];
      }

      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters,
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const filePath = result.filePaths[0];
      const name = basename(filePath);
      let iconDataUrlResult: string | undefined;

      if (
        filter === 'image' ||
        /\.(png|jpg|jpeg|ico|webp|svg|gif|bmp)$/i.test(filePath)
      ) {
        try {
          if (filePath.toLowerCase().endsWith('.svg')) {
            const svg = await readFile(filePath, 'utf8');
            iconDataUrlResult = renderSvgToPngDataUrl(svg);
          } else {
            const native = nativeImage.createFromPath(filePath);
            if (!native.isEmpty()) {
              iconDataUrlResult = `data:image/png;base64,${native
                .resize({ width: 256, height: 256, quality: 'best' })
                .toPNG()
                .toString('base64')}`;
            }
          }
        } catch {
          iconDataUrlResult = undefined;
        }
      } else {
        const url = await iconDataUrl(filePath, 256);
        if (url) {
          iconDataUrlResult = url;
        }
      }

      return {
        path: filePath,
        name,
        iconDataUrl: iconDataUrlResult,
      };
    },
  );
  ipcMain.handle(
    'bridge:set-tile',
    (_event, index: number, tile: DeckTile | null) => {
      const deviceId = persisted.activeDeviceId;
      if (!deviceId || !Number.isInteger(index) || index < 0) {
        return snapshot();
      }
      const tiles = tilesFor(deviceId).slice();
      if (index >= tiles.length) {
        return snapshot();
      }
      tiles[index] = tile;
      persisted.tilesByDevice[deviceId] = tiles;
      save();
      sendToRenderer();
      pushDeck(deviceId);
      return snapshot();
    },
  );
  ipcMain.handle('bridge:add-page', () => {
    const deviceId = persisted.activeDeviceId;
    if (!deviceId) {
      return snapshot();
    }
    const tiles = tilesFor(deviceId);
    if (tiles.length >= MAX_PAGES * GRID_SLOTS) {
      return snapshot();
    }
    persisted.tilesByDevice[deviceId] = tiles.concat(emptyTiles());
    save();
    sendToRenderer();
    pushDeck(deviceId);
    return snapshot();
  });
  ipcMain.handle('bridge:remove-page', (_event, page: number) => {
    const deviceId = persisted.activeDeviceId;
    if (!deviceId || !Number.isInteger(page) || page < 0) {
      return snapshot();
    }
    const tiles = tilesFor(deviceId);
    const pages = tiles.length / GRID_SLOTS;
    if (pages <= 1 || page >= pages) {
      return snapshot();
    }
    persisted.tilesByDevice[deviceId] = tiles
      .slice(0, page * GRID_SLOTS)
      .concat(tiles.slice((page + 1) * GRID_SLOTS));
    save();
    sendToRenderer();
    pushDeck(deviceId);
    return snapshot();
  });
  ipcMain.handle('bridge:remove-device', (_event, id: string) => {
    unpairDevice(id);
    save();
    sendToRenderer();
    return snapshot();
  });
};

export const stopBridge = (): Promise<void> => {
  clearSession();
  closeIconRasterizer();
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
