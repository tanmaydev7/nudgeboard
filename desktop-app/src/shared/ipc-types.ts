import type {
  DevicePlatform,
  PairingPayload,
  MediaState,
  VolumeState,
  WidgetActionType,
  WidgetType,
} from './protocol';

export type {
  MediaState,
  VolumeState,
  WidgetActionType,
  WidgetType,
};

export const GRID_COLUMNS = 4;
export const GRID_ROWS = 2;
export const GRID_SLOTS = GRID_COLUMNS * GRID_ROWS;
export const MAX_PAGES = 8;

export type Appearance = 'light' | 'dark';

export type PairingStep = 'qr' | 'otp' | 'confirm';

export type PendingDevice = {
  id: string;
  name: string;
  model: string;
  os: string;
  platform: DevicePlatform;
  fingerprint: string;
  ip: string;
  via: 'otp' | 'pin';
};

export type PairingSession = {
  step: PairingStep;
  qrDataUrl: string;
  payload: PairingPayload;
  hostName: string;
  fingerprint: string;
  pairingCode: string;
  expiresAt: number;
  pending: PendingDevice | null;
};

export type DeviceProfile = {
  id: string;
  name: string;
  model: string;
  os: string;
  platform: DevicePlatform;
  fingerprint: string;
  trusted: boolean;
  pairedAt: number;
  connected: boolean;
  ip?: string;
};

export type UtilityAction =
  | 'media_play_pause'
  | 'media_next'
  | 'media_prev'
  | 'media_stop'
  | 'volume_up'
  | 'volume_down'
  | 'volume_mute'
  | 'lock_workstation'
  | 'screenshot'
  | 'switch_desktop_left'
  | 'switch_desktop_right';

export type UtilityItem = {
  id: UtilityAction;
  name: string;
  category: 'media' | 'volume' | 'system';
  description: string;
};

export const UTILITY_ITEMS: UtilityItem[] = [
  {
    id: 'media_play_pause',
    name: 'Play / Pause',
    category: 'media',
    description: 'Toggle play or pause for music and video',
  },
  {
    id: 'media_next',
    name: 'Next Track',
    category: 'media',
    description: 'Skip to next song or video',
  },
  {
    id: 'media_prev',
    name: 'Previous Track',
    category: 'media',
    description: 'Go to previous song or video',
  },
  {
    id: 'media_stop',
    name: 'Stop Media',
    category: 'media',
    description: 'Stop current playback',
  },
  {
    id: 'volume_up',
    name: 'Volume Up',
    category: 'volume',
    description: 'Increase PC volume',
  },
  {
    id: 'volume_down',
    name: 'Volume Down',
    category: 'volume',
    description: 'Decrease PC volume',
  },
  {
    id: 'volume_mute',
    name: 'Mute Audio',
    category: 'volume',
    description: 'Toggle mute on master audio',
  },
  {
    id: 'lock_workstation',
    name: 'Lock Screen',
    category: 'system',
    description: 'Instantly lock your computer screen',
  },
  {
    id: 'screenshot',
    name: 'Screenshot',
    category: 'system',
    description: 'Trigger screen snip tool',
  },
  {
    id: 'switch_desktop_left',
    name: 'Switch Desktop ←',
    category: 'system',
    description: 'Move to the previous desktop space (Control + Left)',
  },
  {
    id: 'switch_desktop_right',
    name: 'Switch Desktop →',
    category: 'system',
    description: 'Move to the next desktop space (Control + Right)',
  },
];

export type WidgetItem = {
  id: WidgetType;
  name: string;
  description: string;
  defaultColSpan: number;
  defaultRowSpan: number;
  allowedVariants: Array<{ colSpan: number; rowSpan: number; label: string }>;
};

export const WIDGET_ITEMS: WidgetItem[] = [
  {
    id: 'media',
    name: 'Now Playing',
    description:
      'Live album art, track, artist & playback controls for Spotify, Apple Music, YouTube & more',
    defaultColSpan: 2,
    defaultRowSpan: 1,
    allowedVariants: [
      { colSpan: 1, rowSpan: 1, label: 'Small (1x1)' },
      { colSpan: 2, rowSpan: 1, label: 'Medium (2x1)' },
      { colSpan: 2, rowSpan: 2, label: 'Large (2x2)' },
      { colSpan: 4, rowSpan: 1, label: 'Banner (4x1)' },
    ],
  },
  {
    id: 'volume',
    name: 'Master Volume',
    description:
      'PC Master Volume slider with live level indicator & mute toggle',
    defaultColSpan: 2,
    defaultRowSpan: 1,
    allowedVariants: [
      { colSpan: 1, rowSpan: 1, label: 'Compact (1x1)' },
      { colSpan: 2, rowSpan: 1, label: 'Slider (2x1)' },
      { colSpan: 4, rowSpan: 1, label: 'Wide Slider (4x1)' },
    ],
  },
];

export type FlowStep =
  | { type: 'launch'; path: string; args?: string }
  | { type: 'shortcut'; keys: string[]; rawKey?: string }
  | { type: 'delay'; ms: number };

export type CustomFlow = {
  id: string;
  name: string;
  iconPath?: string;
  iconPreset?: string;
  iconDataUrl?: string;
  /** When false (default), .ps1/.bat/.cmd/.sh launch steps are skipped. */
  allowScripts?: boolean;
  steps: FlowStep[];
};

export type DeckTileType = 'app' | 'utility' | 'custom' | 'widget';

export type DesktopApp = {
  id: string;
  name: string;
  path: string;
  iconPath?: string;
};

export type DeckTile = {
  id: string;
  name: string;
  path: string;
  iconPath?: string;
  tileType?: DeckTileType;
  widgetType?: WidgetType;
  colSpan?: number;
  rowSpan?: number;
  utilityAction?: UtilityAction;
  customFlow?: CustomFlow;
};

export const emptyTiles = (): Array<DeckTile | null> =>
  Array.from({ length: GRID_SLOTS }, (): DeckTile | null => null);

export const deckPageCount = (tiles: Array<unknown>): number =>
  Math.min(
    MAX_PAGES,
    Math.max(1, Math.ceil(tiles.length / GRID_SLOTS) || 1),
  );

export const normalizeTiles = (
  tiles: Array<DeckTile | null>,
): Array<DeckTile | null> => {
  const size = deckPageCount(tiles) * GRID_SLOTS;
  const next = tiles.slice(0, size);
  while (next.length < size) {
    next.push(null);
  }
  return next;
};

export type PresetIcon = {
  id: string;
  name: string;
  glyph: string;
};

export const CUSTOM_ICON_PRESETS = [
  { id: 'terminal', name: 'Terminal', glyph: '>_' },
  { id: 'code', name: 'Code', glyph: '</>' },
  { id: 'rocket', name: 'Rocket', glyph: '🚀' },
  { id: 'zap', name: 'Zap', glyph: '⚡' },
  { id: 'folder', name: 'Folder', glyph: '📁' },
  { id: 'star', name: 'Star', glyph: '★' },
  { id: 'gamepad', name: 'Gaming', glyph: '🎮' },
  { id: 'globe', name: 'Web', glyph: '🌐' },
  { id: 'settings', name: 'Settings', glyph: '⚙' },
  { id: 'music', name: 'Music', glyph: '♪' },
  { id: 'camera', name: 'Camera', glyph: '📷' },
  { id: 'file', name: 'Document', glyph: '📄' },
] as const satisfies readonly PresetIcon[];

export type PresetIconId = (typeof CUSTOM_ICON_PRESETS)[number]['id'];

export type BridgeSnapshot = {
  hostName: string;
  fingerprint: string;
  pairing: PairingSession | null;
  devices: DeviceProfile[];
  activeDeviceId: string | null;
  lastPairedId: string | null;
  tiles: Array<DeckTile | null>;
  customFlows: CustomFlow[];
  appearance: Appearance;
  mediaState?: MediaState | null;
  volumeState?: VolumeState | null;
};

export type VerifyResult =
  | { ok: true; snapshot: BridgeSnapshot }
  | { ok: false; reason: string };

export type BrowseFileResult = {
  path: string;
  name: string;
  iconDataUrl?: string;
};

export type MacPermissions = {
  accessibility: boolean;
  packaged: boolean;
};

export interface ElectronAPI {
  platform: NodeJS.Platform;
  getSnapshot: () => Promise<BridgeSnapshot>;
  generateQr: () => Promise<BridgeSnapshot>;
  cancelPairing: () => Promise<BridgeSnapshot>;
  verifyOtp: (otp: string) => Promise<VerifyResult>;
  acceptPending: () => Promise<VerifyResult>;
  setActiveDevice: (id: string) => Promise<BridgeSnapshot>;
  listApps: () => Promise<DesktopApp[]>;
  getAppIcons: (paths: string[]) => Promise<Record<string, string>>;
  getUtilityIcons: () => Promise<Record<string, string>>;
  getPresetIcons: () => Promise<Record<string, string>>;
  setTile: (index: number, tile: DeckTile | null) => Promise<BridgeSnapshot>;
  moveTile: (fromIndex: number, toIndex: number) => Promise<BridgeSnapshot>;
  resizeTile: (
    index: number,
    colSpan: number,
    rowSpan: number,
  ) => Promise<BridgeSnapshot>;
  addPage: () => Promise<BridgeSnapshot>;
  removePage: (page: number) => Promise<BridgeSnapshot>;
  removeDevice: (id: string) => Promise<BridgeSnapshot>;
  saveCustomFlow: (flow: CustomFlow) => Promise<BridgeSnapshot>;
  deleteCustomFlow: (id: string) => Promise<BridgeSnapshot>;
  browseFile: (
    filter?: 'executable' | 'image' | 'all',
  ) => Promise<BrowseFileResult | null>;
  setAppearance: (mode: Appearance) => Promise<BridgeSnapshot>;
  triggerWidgetAction: (
    action: WidgetActionType,
    value?: number,
  ) => Promise<void>;
  executeTile?: (tile: DeckTile) => Promise<void>;
  getMacPermissions?: () => Promise<MacPermissions>;
  requestMacAccessibility?: () => Promise<boolean>;
  requestMacAutomation?: () => Promise<boolean>;
  openMacPrivacySettings?: (
    pane?: 'accessibility' | 'automation',
  ) => Promise<void>;
  startShortcutCapture?: () => Promise<boolean>;
  stopShortcutCapture?: () => Promise<void>;
  onShortcutCapture?: (
    callback: (chord: { keys: string[]; done: boolean }) => void,
  ) => () => void;
  onSnapshot: (callback: (snapshot: BridgeSnapshot) => void) => () => void;
  onMediaState?: (
    callback: (state: MediaState | null) => void,
  ) => () => void;
  onVolumeState?: (callback: (state: VolumeState) => void) => () => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
