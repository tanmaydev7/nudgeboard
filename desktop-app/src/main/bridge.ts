import { randomBytes, timingSafeEqual } from 'crypto';
import { execFile } from 'child_process';
import { createServer, type IncomingMessage, type ServerResponse, type Server as HttpServer } from 'http';
import { hostname, networkInterfaces } from 'os';
import { basename } from 'path';
import { readFile } from 'fs/promises';
import { promisify } from 'util';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  systemPreferences,
} from 'electron';
import QRCode from 'qrcode';
import { WebSocket, WebSocketServer } from 'ws';
import {
  GRID_COLUMNS,
  GRID_ROWS,
  GRID_SLOTS,
  MAX_PAGES,
  emptyTiles,
  normalizeTiles,
  type Appearance,
  type BridgeSnapshot,
  type BrowseFileResult,
  type DeckTile,
  type DeviceProfile,
  type MediaState,
  type PairingSession,
  type PendingDevice,
  type VerifyResult,
  type VolumeState,
  type WidgetActionType,
  type WidgetType,
} from '../shared/ipc-types';
import {
  APP_ID,
  DEFAULT_PORT,
  OTP_TTL_MS,
  PROTOCOL_VERSION,
  QR_TTL_MS,
  makePairingPin,
  nextLanBindHost,
  parseClientMessage,
  type ClientMessage,
  type DecryptedReconnect,
  type DeviceHello,
  type PairingPayload,
  type ServerMessage,
} from '../shared/protocol';
import { listDesktopApps, iconsForPaths, iconDataUrl } from './apps';
import { deriveKey, decryptEnvelope, encryptEnvelope } from './crypto';
import { executeCustomFlow, executeTile } from './executor';
import { getMediaState, executeMediaAction } from './media';
import { getVolumeState, setMasterVolume, toggleMasterMute } from './volume';
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
  hashToken,
  loadPersisted,
  savePersisted,
  type PersistedState,
  type StoredDevice,
} from './persist';
import { sanitizeCustomFlow, sanitizeDeckTile } from './validate';
import {
  startMacShortcutCapture,
  stopMacShortcutCapture,
} from './shortcut-capture-mac';

const execFileAsync = promisify(execFile);

const TOKEN_BYTES = 16;
const QR_SIZE = 280;
const MAX_WS_PAYLOAD = 64 * 1024;
const MAX_PAIRING_FAILURES = 8;
const MAX_IP_FAILURES = 5;
const IP_BACKOFF_MS = 60_000;
const MAX_CONNECTS_PER_MIN = 20;

type LiveSocket = {
  socket: WebSocket;
  deviceId: string;
  ip: string;
  sessionKey?: Buffer;
  inSeq: number;
  outSeq: number;
};

type PendingPair = {
  socket: WebSocket;
  device: DeviceHello;
  otp: string | null;
  ip: string;
  via: 'otp' | 'pin';
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
let httpServer: HttpServer | null = null;
let port = DEFAULT_PORT;
let hostName = 'NudgeBoard';
let hostOs = 'Windows';
let selectedHost = '';
export const WINDOW_CHROME = {
  dark: { backgroundColor: '#0b0b0c', symbolColor: '#d4d4d8' },
  light: { backgroundColor: '#f7f4ee', symbolColor: '#1c1917' },
} as const;

let persisted: PersistedState = {
  fingerprint: '00:00:00',
  devices: [],
  activeDeviceId: null,
  tilesByDevice: {},
  customFlows: [],
  appearance: 'dark',
};
let session: Session | null = null;
let lastPairedId: string | null = null;
const live = new Map<WebSocket, LiveSocket>();
let pairingFailures = 0;
const ipFailures = new Map<string, { count: number; until: number }>();
const connectHits = new Map<string, number[]>();

let lastMediaState: MediaState | null = null;
let lastPositionBroadcastAt = 0;
let lastVolumeState: VolumeState = { volume: 50, isMuted: false };
let statusTimer: NodeJS.Timeout | null = null;
let lanWatchTimer: NodeJS.Timeout | null = null;
let rebinding = false;

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
  via: pending.via,
});

const pairingView = (): PairingSession | null => {
  if (!session) {
    return null;
  }
  return {
    step: session.step,
    qrDataUrl: session.qrDataUrl,
    payload: { ...session.payload, token: '' },
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

export const currentAppearance = (): Appearance =>
  persisted.appearance === 'light' ? 'light' : 'dark';

export const applyAppearanceChrome = (): void => {
  const mode = currentAppearance();
  try {
    if (nativeTheme.themeSource !== mode) {
      nativeTheme.themeSource = mode;
    }
  } catch {
    // Chromium can stall or throw on repeated themeSource writes.
  }
  const chrome = WINDOW_CHROME[mode];
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) {
      continue;
    }
    try {
      win.setBackgroundColor(chrome.backgroundColor);
    } catch {
      continue;
    }
    if (process.platform !== 'win32') {
      continue;
    }
    try {
      win.setTitleBarOverlay({
        color: chrome.backgroundColor,
        symbolColor: chrome.symbolColor,
        height: 36,
      });
    } catch {
      // Overlay updates fail after hide-to-tray, maximize, or DPI changes.
    }
  }
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
  appearance: currentAppearance(),
  mediaState: lastMediaState,
  volumeState: lastVolumeState,
});

export const broadcastMediaState = (state: MediaState | null): void => {
  lastMediaState = state;
  for (const [socket] of live) {
    send(socket, { type: 'media_state', state });
  }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('bridge:media-state', state);
  }
};

export const broadcastVolumeState = (state: VolumeState): void => {
  lastVolumeState = state;
  for (const [socket] of live) {
    send(socket, { type: 'volume_state', state });
  }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('bridge:volume-state', state);
  }
};

export const pollStatus = async (): Promise<void> => {
  try {
    const [media, volume] = await Promise.all([
      getMediaState(),
      getVolumeState(),
    ]);

    const metaChanged =
      media?.title !== lastMediaState?.title ||
      media?.artist !== lastMediaState?.artist ||
      media?.isPlaying !== lastMediaState?.isPlaying ||
      media?.artwork !== lastMediaState?.artwork ||
      media?.sourceApp !== lastMediaState?.sourceApp ||
      media?.sessionId !== lastMediaState?.sessionId;

    const now = Date.now();
    const positionDrifted =
      media?.isPlaying &&
      Math.abs((media.positionSec || 0) - (lastMediaState?.positionSec || 0)) > 2;

    const periodicSync =
      media?.isPlaying && now - lastPositionBroadcastAt >= 3000;

    if (metaChanged || positionDrifted || periodicSync) {
      lastPositionBroadcastAt = now;
      broadcastMediaState(media);
    }

    const volumeChanged =
      volume.volume !== lastVolumeState.volume ||
      volume.isMuted !== lastVolumeState.isMuted;

    if (volumeChanged) {
      broadcastVolumeState(volume);
    }
  } catch {
    // ignore
  }
};

export const handleWidgetAction = async (
  action: WidgetActionType,
  value?: number,
): Promise<void> => {
  if (action === 'set_volume' && typeof value === 'number') {
    const state = await setMasterVolume(value);
    broadcastVolumeState(state);
    return;
  }
  if (action === 'toggle_mute') {
    const state = await toggleMasterMute();
    broadcastVolumeState(state);
    return;
  }
  if (
    action === 'media_play_pause' ||
    action === 'media_next' ||
    action === 'media_prev' ||
    action === 'media_stop'
  ) {
    const act =
      action === 'media_play_pause'
        ? 'play_pause'
        : action === 'media_next'
          ? 'next'
          : action === 'media_prev'
            ? 'prev'
            : 'stop';
    await executeMediaAction(act, lastMediaState?.sessionId);
    setTimeout(() => {
      void pollStatus();
    }, 200);
  }
};

const sendToRenderer = (): void => {
  const next = snapshot();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('bridge:snapshot', next);
  }
};

const send = (socket: WebSocket, message: ServerMessage): void => {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }
  const connection = live.get(socket);
  if (
    connection?.sessionKey &&
    message.type !== 'hello_ok' &&
    message.type !== 'hello_err' &&
    message.type !== 'encrypted'
  ) {
    const envelope = encryptEnvelope(
      connection.sessionKey,
      message,
      connection.outSeq,
    );
    connection.outSeq += 1;
    socket.send(JSON.stringify(envelope));
    return;
  }
  socket.send(JSON.stringify(message));
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

        // 1. Widget tile
        if (
          tile.tileType === 'widget' ||
          tile.widgetType ||
          tile.path.startsWith('widget:')
        ) {
          const widget =
            tile.widgetType ??
            (tile.path.replace(/^widget:/, '') as WidgetType);
          const icon = await ensurePngDataUrl(
            getIconForPresetOrUtility(
              widget === 'volume' ? 'volume_up' : 'media_play_pause',
            ),
          );
          return {
            id: tile.id,
            name: tile.name,
            icon,
            tileType: 'widget' as const,
            widgetType: widget,
            colSpan: tile.colSpan ?? 2,
            rowSpan: tile.rowSpan ?? 1,
          };
        }

        // 2. Utility tile
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
            tileType: 'utility' as const,
            colSpan: tile.colSpan ?? 1,
            rowSpan: tile.rowSpan ?? 1,
          };
        }

        // 3. Custom Flow tile
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
            tileType: 'custom' as const,
            colSpan: tile.colSpan ?? 1,
            rowSpan: tile.rowSpan ?? 1,
          };
        }

        // 4. Standard App
        return {
          id: tile.id,
          name: tile.name,
          icon: appIcons[tile.iconPath ?? tile.path],
          tileType: 'app' as const,
          colSpan: tile.colSpan ?? 1,
          rowSpan: tile.rowSpan ?? 1,
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
    send(connection.socket, {
      type: 'media_state',
      state: lastMediaState,
    });
    send(connection.socket, {
      type: 'volume_state',
      state: lastVolumeState,
    });
  });
};

const otpMatch = (expected: string, received: string): boolean => {
  if (expected.length !== 6 || received.length !== 6) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
};

const secretMatch = (expected: string, received: string): boolean => {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  if (left.length === 0 || left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
};

const tokenHashMatch = (token: string, tokenHash: string): boolean =>
  secretMatch(hashToken(token), tokenHash);

const ipThrottled = (ip: string): boolean => {
  const entry = ipFailures.get(ip);
  return Boolean(entry && entry.until > Date.now());
};

const recordAuthFailure = (ip: string): boolean => {
  pairingFailures += 1;
  const current = ipFailures.get(ip);
  const count = (current?.count ?? 0) + 1;
  const until = count >= MAX_IP_FAILURES ? Date.now() + IP_BACKOFF_MS : 0;
  ipFailures.set(ip, { count, until });
  if (pairingFailures >= MAX_PAIRING_FAILURES) {
    clearSession('Too many pairing attempts. Generate a new code.');
    pairingFailures = 0;
    return true;
  }
  return false;
};

const allowConnection = (ip: string): boolean => {
  const now = Date.now();
  const recent = (connectHits.get(ip) ?? []).filter((at) => now - at < 60_000);
  recent.push(now);
  connectHits.set(ip, recent);
  return recent.length <= MAX_CONNECTS_PER_MIN;
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
  trusted: boolean,
  ip: string,
): string => {
  dropDeviceId(device.id);
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const sessionKey = deriveKey(token);
  const stored: StoredDevice = {
    id: device.id,
    name: device.name,
    model: device.model,
    os: device.os,
    platform: device.platform,
    fingerprint: device.fingerprint,
    tokenHash: hashToken(token),
    tokenKey: sessionKey.toString('hex'),
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
  live.set(socket, {
    socket,
    deviceId: device.id,
    ip,
    sessionKey,
    inSeq: 1,
    outSeq: 1,
  });
  send(socket, helloOk(token));
  pushDeck(device.id);
  return token;
};

const helloOk = (
  token?: string,
): Extract<ServerMessage, { type: 'hello_ok' }> => ({
  type: 'hello_ok',
  hostName,
  fingerprint: persisted.fingerprint,
  ...(token ? { token } : {}),
  host: selectedHost,
  port,
  os: hostOs,
});

const handleHello = (socket: WebSocket, message: Extract<ClientMessage, { type: 'hello' }>, ip: string): void => {
  if (ipThrottled(ip)) {
    send(socket, { type: 'hello_err', reason: 'Too many attempts. Wait and try again.' });
    socket.close();
    return;
  }
  if (!session || sessionExpired()) {
    send(socket, { type: 'hello_err', reason: 'Pairing code expired. Generate a new QR.' });
    socket.close();
    return;
  }
  if (!secretMatch(session.token, message.token)) {
    if (recordAuthFailure(ip)) {
      return;
    }
    send(socket, { type: 'hello_err', reason: 'Invalid pairing code' });
    socket.close();
    return;
  }
  if (session.pending && session.pending.socket !== socket) {
    send(socket, { type: 'hello_err', reason: 'Another device is already pairing' });
    socket.close();
    return;
  }

  session.pending = {
    socket,
    device: message.device,
    otp: message.otp,
    ip,
    via: 'otp',
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
  if (ipThrottled(ip)) {
    send(socket, { type: 'hello_err', reason: 'Too many attempts. Wait and try again.' });
    socket.close();
    return;
  }
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
    if (recordAuthFailure(ip)) {
      return;
    }
    send(socket, { type: 'hello_err', reason: 'Invalid pairing code' });
    socket.close();
    return;
  }

  session.pending = {
    socket,
    device: message.device,
    otp: null,
    ip,
    via: 'pin',
  };
  session.step = 'confirm';
  session.expiresAt = Date.now() + OTP_TTL_MS;
  sendToRenderer();
};

const finishPending = (): VerifyResult => {
  if (!session?.pending) {
    return { ok: false, reason: 'No device is pairing right now' };
  }
  if (sessionExpired()) {
    clearSession('Code expired');
    sendToRenderer();
    return { ok: false, reason: 'Code expired. Pair again.' };
  }
  const pending = session.pending;
  session.pending = null;
  session = null;
  pairingFailures = 0;
  acceptDevice(pending.socket, pending.device, true, pending.ip);
  lastPairedId = pending.device.id;
  persisted.activeDeviceId = pending.device.id;
  save();
  sendToRenderer();
  return { ok: true, snapshot: snapshot() };
};

const handleReconnectEnc = (
  socket: WebSocket,
  message: Extract<ClientMessage, { type: 'reconnect_enc' }>,
  ip: string,
): void => {
  if (ipThrottled(ip)) {
    send(socket, { type: 'hello_err', reason: 'Too many attempts. Wait and try again.' });
    socket.close();
    return;
  }
  const stored = persisted.devices.find((item) => item.id === message.id);
  if (!stored || !stored.trusted || !stored.tokenKey) {
    recordAuthFailure(ip);
    send(socket, {
      type: 'hello_err',
      reason: 'This computer does not recognize the phone. Pair again.',
    });
    socket.close();
    return;
  }
  const sessionKey = Buffer.from(stored.tokenKey, 'hex');
  const decrypted = decryptEnvelope<DecryptedReconnect>(
    sessionKey,
    {
      iv: message.iv,
      data: message.data,
      tag: message.tag,
      seq: message.seq,
    },
    1,
  );
  if (!decrypted || !tokenHashMatch(decrypted.token, stored.tokenHash)) {
    if (recordAuthFailure(ip)) {
      return;
    }
    send(socket, {
      type: 'hello_err',
      reason: 'This computer does not recognize the phone. Pair again.',
    });
    socket.close();
    return;
  }

  stored.name = decrypted.device.name;
  stored.model = decrypted.device.model;
  stored.os = decrypted.device.os;
  stored.fingerprint = decrypted.device.fingerprint;
  save();
  dropDeviceId(stored.id);
  live.set(socket, {
    socket,
    deviceId: stored.id,
    ip,
    sessionKey,
    inSeq: 2,
    outSeq: 1,
  });
  send(socket, helloOk());
  pushDeck(stored.id);
  sendToRenderer();
};

const handleReconnect = (
  socket: WebSocket,
  message: Extract<ClientMessage, { type: 'reconnect' }>,
  ip: string,
): void => {
  if (ipThrottled(ip)) {
    send(socket, { type: 'hello_err', reason: 'Too many attempts. Wait and try again.' });
    socket.close();
    return;
  }
  const stored = persisted.devices.find(
    (item) =>
      item.id === message.device.id && tokenHashMatch(message.token, item.tokenHash),
  );
  if (!stored || !stored.trusted) {
    recordAuthFailure(ip);
    send(socket, {
      type: 'hello_err',
      reason: 'This computer does not recognize the phone. Pair again.',
    });
    socket.close();
    return;
  }

  const sessionKey = deriveKey(message.token);
  stored.tokenKey = sessionKey.toString('hex');
  stored.name = message.device.name;
  stored.model = message.device.model;
  stored.os = message.device.os;
  stored.fingerprint = message.device.fingerprint;
  save();
  dropDeviceId(stored.id);
  live.set(socket, {
    socket,
    deviceId: stored.id,
    ip,
    sessionKey,
    inSeq: 1,
    outSeq: 1,
  });
  send(socket, helloOk());
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    send(socket, { type: 'hello_err', reason: 'Invalid message' });
    return;
  }
  const message = parseClientMessage(parsed);
  if (!message) {
    send(socket, { type: 'hello_err', reason: 'Unknown message' });
    return;
  }

  const ip = remoteIp(socket);
  if (message.type === 'encrypted') {
    const connection = live.get(socket);
    if (!connection || !connection.sessionKey) {
      return;
    }
    const inner = decryptEnvelope<{
      type: string;
      id?: string;
      action?: WidgetActionType;
      value?: number;
    }>(
      connection.sessionKey,
      message,
      connection.inSeq,
    );
    if (!inner) {
      return;
    }
    connection.inSeq += 1;
    if (inner.type === 'press' && typeof inner.id === 'string') {
      handlePress(socket, { type: 'press', id: inner.id });
      return;
    }
    if (inner.type === 'widget_action' && typeof inner.action === 'string') {
      void handleWidgetAction(inner.action, inner.value);
      return;
    }
    if (inner.type === 'logout') {
      handleLogout(socket);
      return;
    }
    return;
  }
  if (message.type === 'reconnect_enc') {
    handleReconnectEnc(socket, message, ip);
    return;
  }
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
  if (message.type === 'widget_action') {
    void handleWidgetAction(message.action, message.value);
    return;
  }
  if (message.type === 'logout') {
    handleLogout(socket);
  }
};

const pairingProbe = (req: IncomingMessage, res: ServerResponse): void => {
  if (
    req.method === 'GET' &&
    (req.url === '/nudgeboard/pairing' || req.url === '/nudgeboard/pairing/')
  ) {
    res.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    });
    res.end(
      JSON.stringify({
        app: APP_ID,
        name: hostName,
        fingerprint: persisted.fingerprint,
        pairing: Boolean(session && !sessionExpired()),
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end();
};

const listen = async (startPort: number, bindHost: string): Promise<number> => {
  for (let nextPort = startPort; nextPort < startPort + 20; nextPort += 1) {
    const bound = await new Promise<number | null>((resolve, reject) => {
      const nextHttp = createServer(pairingProbe);
      const server = new WebSocketServer({
        server: nextHttp,
        maxPayload: MAX_WS_PAYLOAD,
      });
      nextHttp.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' || error.code === 'EADDRNOTAVAIL') {
          nextHttp.close(() => resolve(null));
          return;
        }
        reject(error);
      });
      nextHttp.once('listening', () => {
        httpServer = nextHttp;
        wss = server;
        resolve(nextPort);
      });
      nextHttp.listen(nextPort, bindHost);
    });
    if (bound !== null) {
      return bound;
    }
  }
  throw new Error('No free port for the Nudgeboard bridge');
};

const closeListen = (): Promise<void> =>
  new Promise((resolve) => {
    const server = wss;
    const http = httpServer;
    wss = null;
    httpServer = null;
    if (!server) {
      resolve();
      return;
    }
    server.close(() => {
      if (!http) {
        resolve();
        return;
      }
      http.close(() => resolve());
    });
  });

const attachConnectionHandler = (): void => {
  wss?.on('connection', (socket, req) => {
    const ip =
      (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '') || 'unknown';
    if (ipThrottled(ip) || !allowConnection(ip)) {
      socket.close();
      return;
    }
    socket.on('message', (data) => {
      handleMessage(socket, data.toString());
    });
    socket.on('close', () => dropSocket(socket));
    socket.on('error', () => dropSocket(socket));
  });
};

const ensureLanBind = async (): Promise<void> => {
  if (rebinding) {
    return;
  }
  const next = nextLanBindHost(listLanHosts(), selectedHost);
  if (!next || next === selectedHost) {
    return;
  }
  rebinding = true;
  try {
    for (const { socket } of live.values()) {
      socket.close();
    }
    live.clear();
    await closeListen();
    selectedHost = next;
    port = await listen(DEFAULT_PORT, selectedHost);
    attachConnectionHandler();
    sendToRenderer();
  } finally {
    rebinding = false;
  }
};

const startPairing = async (): Promise<BridgeSnapshot> => {
  await ensureLanBind();
  clearSession('Pairing restarted');
  pairingFailures = 0;
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
  if (persisted.appearance !== 'light' && persisted.appearance !== 'dark') {
    persisted.appearance = 'dark';
  }
  save();
  applyAppearanceChrome();
  selectedHost = listLanHosts()[0] ?? '127.0.0.1';
  port = await listen(DEFAULT_PORT, selectedHost);
  attachConnectionHandler();

  ipcMain.handle('bridge:get-snapshot', () => snapshot());
  ipcMain.handle('bridge:generate-qr', () => startPairing());
  ipcMain.handle('bridge:cancel-pairing', () => {
    clearSession('Pairing cancelled');
    sendToRenderer();
    return snapshot();
  });
  ipcMain.handle('bridge:verify-otp', (_event, otp: unknown): VerifyResult => {
    if (!session?.pending || session.pending.via !== 'otp') {
      return { ok: false, reason: 'No device is pairing right now' };
    }
    if (session.step !== 'otp') {
      return { ok: false, reason: 'Scan the QR code first' };
    }
    if (typeof otp !== 'string' || !session.pending.otp) {
      return { ok: false, reason: 'That code does not match' };
    }
    if (!otpMatch(session.pending.otp, otp.trim())) {
      recordAuthFailure(session.pending.ip);
      return { ok: false, reason: 'That code does not match' };
    }
    return finishPending();
  });
  ipcMain.handle('bridge:accept-pending', (): VerifyResult => {
    if (!session?.pending || session.pending.via !== 'pin') {
      return { ok: false, reason: 'No device is waiting for confirmation' };
    }
    if (session.step !== 'confirm') {
      return { ok: false, reason: 'Enter the code on the phone first' };
    }
    return finishPending();
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
    (_event, flow: unknown): BridgeSnapshot => {
      const sanitized = sanitizeCustomFlow(flow);
      if (!sanitized) {
        return snapshot();
      }
      const list = persisted.customFlows ?? [];
      const idx = list.findIndex((item) => item.id === sanitized.id);
      if (idx >= 0) {
        list[idx] = sanitized;
      } else {
        list.push(sanitized);
      }
      persisted.customFlows = list;

      for (const deviceId of Object.keys(persisted.tilesByDevice)) {
        const tiles = persisted.tilesByDevice[deviceId];
        let modified = false;
        for (let i = 0; i < tiles.length; i++) {
          const t = tiles[i];
          if (t && (t.id === sanitized.id || t.path === `custom:${sanitized.id}`)) {
            tiles[i] = {
              ...t,
              name: sanitized.name,
              iconPath: sanitized.iconPath,
              customFlow: sanitized,
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
            iconDataUrlResult = (await iconDataUrl(filePath, 256)) ?? undefined;
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
    (_event, index: unknown, tile: unknown) => {
      const deviceId = persisted.activeDeviceId;
      if (
        !deviceId ||
        typeof index !== 'number' ||
        !Number.isInteger(index) ||
        index < 0
      ) {
        return snapshot();
      }
      const tiles = tilesFor(deviceId).slice();
      if (index >= tiles.length) {
        return snapshot();
      }
      const sanitized =
        tile === null ? null : sanitizeDeckTile(tile, persisted.customFlows);

      if (sanitized) {
        const slotInPage = index % GRID_SLOTS;
        const slotCol = slotInPage % GRID_COLUMNS;
        const slotRow = Math.floor(slotInPage / GRID_COLUMNS);
        const maxColSpan = GRID_COLUMNS - slotCol;
        const maxRowSpan = GRID_ROWS - slotRow;
        sanitized.colSpan = Math.max(1, Math.min(maxColSpan, sanitized.colSpan ?? 1));
        sanitized.rowSpan = Math.max(1, Math.min(maxRowSpan, sanitized.rowSpan ?? 1));

        // Clear any slots that are covered by this newly placed multi-cell tile
        const pageStart = Math.floor(index / GRID_SLOTS) * GRID_SLOTS;
        for (let r = 0; r < sanitized.rowSpan; r++) {
          for (let c = 0; c < sanitized.colSpan; c++) {
            if (r !== 0 || c !== 0) {
              const coveredSlotIndex =
                pageStart + (slotRow + r) * GRID_COLUMNS + (slotCol + c);
              if (coveredSlotIndex < tiles.length) {
                tiles[coveredSlotIndex] = null;
              }
            }
          }
        }
      }

      tiles[index] = sanitized;
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
  ipcMain.handle(
    'bridge:move-tile',
    (_event, fromIndex: unknown, toIndex: unknown): BridgeSnapshot => {
      const deviceId = persisted.activeDeviceId;
      if (
        !deviceId ||
        typeof fromIndex !== 'number' ||
        typeof toIndex !== 'number' ||
        !Number.isInteger(fromIndex) ||
        !Number.isInteger(toIndex) ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex === toIndex
      ) {
        return snapshot();
      }
      const tiles = tilesFor(deviceId).slice();
      if (fromIndex >= tiles.length || toIndex >= tiles.length) {
        return snapshot();
      }
      const source = tiles[fromIndex];
      const target = tiles[toIndex];

      if (source) {
        const destSlot = toIndex % GRID_SLOTS;
        const destCol = destSlot % GRID_COLUMNS;
        const destRow = Math.floor(destSlot / GRID_COLUMNS);
        const maxCol = GRID_COLUMNS - destCol;
        const maxRow = GRID_ROWS - destRow;
        source.colSpan = Math.max(1, Math.min(maxCol, source.colSpan ?? 1));
        source.rowSpan = Math.max(1, Math.min(maxRow, source.rowSpan ?? 1));

        // Clear any slots covered by the source at its new destination
        const destPageStart = Math.floor(toIndex / GRID_SLOTS) * GRID_SLOTS;
        for (let r = 0; r < source.rowSpan; r++) {
          for (let c = 0; c < source.colSpan; c++) {
            if (r !== 0 || c !== 0) {
              const cov =
                destPageStart + (destRow + r) * GRID_COLUMNS + (destCol + c);
              if (cov < tiles.length && cov !== fromIndex) {
                tiles[cov] = null;
              }
            }
          }
        }
      }

      tiles[fromIndex] = target;
      tiles[toIndex] = source;
      persisted.tilesByDevice[deviceId] = tiles;
      save();
      sendToRenderer();
      pushDeck(deviceId);
      return snapshot();
    },
  );
  ipcMain.handle(
    'bridge:resize-tile',
    (_event, index: unknown, colSpan: unknown, rowSpan: unknown): BridgeSnapshot => {
      const deviceId = persisted.activeDeviceId;
      if (
        !deviceId ||
        typeof index !== 'number' ||
        !Number.isInteger(index) ||
        index < 0
      ) {
        return snapshot();
      }
      const tiles = tilesFor(deviceId).slice();
      if (index >= tiles.length || !tiles[index]) {
        return snapshot();
      }
      const target = tiles[index];
      if (target) {
        const slotInPage = index % GRID_SLOTS;
        const slotCol = slotInPage % GRID_COLUMNS;
        const slotRow = Math.floor(slotInPage / GRID_COLUMNS);
        const maxColSpan = GRID_COLUMNS - slotCol;
        const maxRowSpan = GRID_ROWS - slotRow;
        const reqCol =
          typeof colSpan === 'number'
            ? Math.round(colSpan)
            : (target.colSpan ?? 1);
        const reqRow =
          typeof rowSpan === 'number'
            ? Math.round(rowSpan)
            : (target.rowSpan ?? 1);
        const finalCol = Math.max(1, Math.min(maxColSpan, reqCol));
        const finalRow = Math.max(1, Math.min(maxRowSpan, reqRow));

        // Clear any slots covered by this expanded size
        const pageStart = Math.floor(index / GRID_SLOTS) * GRID_SLOTS;
        for (let r = 0; r < finalRow; r++) {
          for (let c = 0; c < finalCol; c++) {
            if (r !== 0 || c !== 0) {
              const coveredSlotIndex =
                pageStart + (slotRow + r) * GRID_COLUMNS + (slotCol + c);
              if (coveredSlotIndex < tiles.length) {
                tiles[coveredSlotIndex] = null;
              }
            }
          }
        }

        tiles[index] = {
          ...target,
          colSpan: finalCol,
          rowSpan: finalRow,
        };
        persisted.tilesByDevice[deviceId] = tiles;
        save();
        sendToRenderer();
        pushDeck(deviceId);
      }
      return snapshot();
    },
  );
  ipcMain.handle(
    'bridge:trigger-widget-action',
    async (_event, action: unknown, value?: unknown): Promise<void> => {
      if (typeof action === 'string') {
        const val = typeof value === 'number' ? value : undefined;
        await handleWidgetAction(action as WidgetActionType, val);
      }
    },
  );
  ipcMain.handle('bridge:execute-tile', async (_event, raw: unknown) => {
    const candidate = raw as { widgetType?: string; tileType?: string; customFlow?: unknown };
    if (!raw || typeof raw !== 'object') {
      return;
    }
    if (candidate.widgetType || candidate.tileType === 'widget') {
      return;
    }
    if (candidate.customFlow) {
      const flow = sanitizeCustomFlow(candidate.customFlow);
      if (flow) {
        await executeCustomFlow(flow);
        return;
      }
    }
    const tile = sanitizeDeckTile(raw, persisted.customFlows);
    if (!tile) {
      return;
    }
    await executeTile(tile, persisted.customFlows);
  });
  ipcMain.handle('bridge:set-appearance', (_event, mode: unknown) => {
    persisted.appearance = mode === 'light' ? 'light' : 'dark';
    try {
      save();
    } catch {
      // Keep the in-memory theme even if the persist file is locked.
    }
    const next = snapshot();
    sendToRenderer();
    setImmediate(() => {
      applyAppearanceChrome();
    });
    return next;
  });
  ipcMain.handle('bridge:get-mac-permissions', () => {
    if (process.platform !== 'darwin') {
      return { accessibility: true, packaged: true };
    }
    const accessibility = systemPreferences.isTrustedAccessibilityClient(false);
    return { accessibility, packaged: app.isPackaged };
  });
  ipcMain.handle('bridge:start-shortcut-capture', async (event) => {
    const sender = event.sender;
    return startMacShortcutCapture((chord) => {
      if (!sender.isDestroyed()) {
        sender.send('bridge:shortcut-capture', chord);
      }
    });
  });
  ipcMain.handle('bridge:stop-shortcut-capture', () => {
    stopMacShortcutCapture();
  });
  ipcMain.handle('bridge:request-mac-accessibility', () => {
    if (process.platform !== 'darwin') {
      return true;
    }
    return systemPreferences.isTrustedAccessibilityClient(true);
  });
  ipcMain.handle('bridge:request-mac-automation', async () => {
    if (process.platform !== 'darwin') {
      return true;
    }
    try {
      await execFileAsync('/usr/bin/osascript', [
        '-e',
        'tell application "System Events" to get name',
      ]);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle(
    'bridge:open-mac-privacy-settings',
    async (_event, pane?: 'accessibility' | 'automation') => {
      if (process.platform !== 'darwin') {
        return;
      }
      const urls =
        pane === 'automation'
          ? [
              'x-apple.systempreferences:com.apple.Settings.PrivacySecurity.extension?Privacy_Automation',
              'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
            ]
          : [
              'x-apple.systempreferences:com.apple.Settings.PrivacySecurity.extension?Privacy_Accessibility',
              'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
            ];
      for (const url of urls) {
        try {
          await shell.openExternal(url);
          return;
        } catch {
          // try the next URL scheme
        }
      }
    },
  );

  if (statusTimer) {
    clearInterval(statusTimer);
  }
  statusTimer = setInterval(() => {
    void pollStatus();
  }, 1500);
  void pollStatus();

  if (lanWatchTimer) {
    clearInterval(lanWatchTimer);
  }
  lanWatchTimer = setInterval(() => {
    void ensureLanBind();
  }, 5000);
};

export const stopBridge = (): Promise<void> => {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  if (lanWatchTimer) {
    clearInterval(lanWatchTimer);
    lanWatchTimer = null;
  }
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
      if (!httpServer) {
        resolve();
        return;
      }
      httpServer.close(() => {
        httpServer = null;
        resolve();
      });
    });
  });
};
