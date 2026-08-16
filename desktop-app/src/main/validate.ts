import { isAbsolute } from 'path';
import {
  CUSTOM_ICON_PRESETS,
  UTILITY_ITEMS,
  type CustomFlow,
  type DeckTile,
  type FlowStep,
  type UtilityAction,
} from '../shared/ipc-types';

export const MAX_DELAY_MS = 30_000;
export const MIN_DELAY_MS = 10;

const UTILITY_IDS = new Set<string>(UTILITY_ITEMS.map((item) => item.id));
const PRESET_IDS = new Set<string>(CUSTOM_ICON_PRESETS.map((item) => item.id));
const KNOWN_LAUNCHERS = new Set([
  'powershell.exe',
  'powershell',
  'wt.exe',
  'wt',
  'cmd.exe',
  'cmd',
  'explorer.exe',
]);
const SCRIPT_EXT = /\.(ps1|bat|cmd|sh|vbs)$/i;
const BLOCKED_SCHEMES = /^(file|javascript|data|vbscript|about|blob):/i;
const SAFE_PROTOCOL = /^(https|mailto):/i;
const CUSTOM_PROTOCOL = /^[a-z][a-z0-9+.-]{1,31}:/i;
const DATA_IMAGE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;
const ALLOWED_KEYS = new Set([
  'ctrl',
  'control',
  'shift',
  'alt',
  'option',
  'win',
  'meta',
  'windows',
  'cmd',
  'command',
  'super',
  'esc',
  'escape',
  'enter',
  'return',
  'tab',
  'backspace',
  'delete',
  'del',
  'space',
  'up',
  'arrowup',
  'down',
  'arrowdown',
  'left',
  'arrowleft',
  'right',
  'arrowright',
  'home',
  'end',
  'pageup',
  'pagedown',
  'capslock',
  'insert',
  'prtsc',
  'printscreen',
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f10',
  'f11',
  'f12',
]);

export const isAllowedKeyName = (raw: string): boolean => {
  const key = raw.trim().toLowerCase();
  if (!key || key.length > 16) {
    return false;
  }
  if (ALLOWED_KEYS.has(key)) {
    return true;
  }
  if (/^f([1-9]|1[0-2])$/.test(key)) {
    return true;
  }
  return /^[a-z0-9]$/.test(key);
};

export const isScriptPath = (filePath: string): boolean =>
  SCRIPT_EXT.test(filePath);

export const isAllowedLaunchTarget = (target: string): boolean => {
  const value = target.trim();
  if (!value || value.length > 4096) {
    return false;
  }
  if (value.toLowerCase().startsWith('shell:')) {
    return true;
  }
  if (BLOCKED_SCHEMES.test(value)) {
    return false;
  }
  if (SAFE_PROTOCOL.test(value)) {
    return true;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const scheme = value.slice(0, value.indexOf(':')).toLowerCase();
    if (scheme === 'http' || scheme.startsWith('ms-')) {
      return false;
    }
    return CUSTOM_PROTOCOL.test(`${scheme}:`);
  }
  if (KNOWN_LAUNCHERS.has(value.toLowerCase())) {
    return true;
  }
  return isAbsolute(value);
};

const sanitizeLaunchPath = (path: string): string | null => {
  const trimmed = path.trim();
  if (!trimmed || !isAllowedLaunchTarget(trimmed)) {
    return null;
  }
  return trimmed;
};

const sanitizeStep = (
  step: unknown,
  allowScripts: boolean,
): FlowStep | null => {
  if (typeof step !== 'object' || step === null) {
    return null;
  }
  const value = step as Partial<FlowStep> & { type?: string };
  if (value.type === 'delay') {
    const ms = Number((value as { ms?: unknown }).ms);
    if (!Number.isFinite(ms)) {
      return null;
    }
    return {
      type: 'delay',
      ms: Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, Math.round(ms))),
    };
  }
  if (value.type === 'shortcut') {
    const keys = (value as { keys?: unknown }).keys;
    if (!Array.isArray(keys) || keys.length === 0 || keys.length > 8) {
      return null;
    }
    const next = keys
      .filter((key): key is string => typeof key === 'string')
      .map((key) => key.trim())
      .filter(isAllowedKeyName);
    if (next.length === 0) {
      return null;
    }
    return { type: 'shortcut', keys: next };
  }
  if (value.type === 'launch') {
    const path = sanitizeLaunchPath(String((value as { path?: unknown }).path ?? ''));
    if (!path) {
      return null;
    }
    if (isScriptPath(path) && !allowScripts) {
      return null;
    }
    const argsRaw = (value as { args?: unknown }).args;
    const args =
      typeof argsRaw === 'string' ? argsRaw.trim().slice(0, 512) : undefined;
    return args ? { type: 'launch', path, args } : { type: 'launch', path };
  }
  return null;
};

const sanitizeId = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim().slice(0, 128);
  return trimmed.length > 0 ? trimmed : fallback;
};

const sanitizeName = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const name = value.trim().slice(0, 64);
  return name.length > 0 ? name : null;
};

const sanitizeIconDataUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  if (!DATA_IMAGE.test(value) || value.length > 400_000) {
    return undefined;
  }
  return value;
};

export const sanitizeCustomFlow = (input: unknown): CustomFlow | null => {
  if (typeof input !== 'object' || input === null) {
    return null;
  }
  const raw = input as Partial<CustomFlow>;
  const name = sanitizeName(raw.name);
  if (!name || !Array.isArray(raw.steps) || raw.steps.length === 0) {
    return null;
  }
  const allowScripts = raw.allowScripts === true;
  const steps = raw.steps
    .slice(0, 20)
    .map((step) => sanitizeStep(step, allowScripts))
    .filter((step): step is FlowStep => step !== null);
  if (steps.length === 0) {
    return null;
  }
  const iconPreset =
    typeof raw.iconPreset === 'string' && PRESET_IDS.has(raw.iconPreset)
      ? raw.iconPreset
      : undefined;
  const iconPath =
    typeof raw.iconPath === 'string' &&
    raw.iconPath.length > 0 &&
    raw.iconPath.length < 4096 &&
    (isAbsolute(raw.iconPath) || PRESET_IDS.has(raw.iconPath))
      ? raw.iconPath
      : undefined;
  return {
    id: sanitizeId(raw.id, `flow_${Date.now()}`),
    name,
    iconPreset,
    iconPath,
    iconDataUrl: sanitizeIconDataUrl(raw.iconDataUrl),
    allowScripts,
    steps,
  };
};

export const sanitizeDeckTile = (
  input: unknown,
  flows: CustomFlow[],
): DeckTile | null => {
  if (input === null) {
    return null;
  }
  if (typeof input !== 'object') {
    return null;
  }
  const raw = input as Partial<DeckTile>;
  const name = sanitizeName(raw.name);
  const path = typeof raw.path === 'string' ? raw.path.trim() : '';
  if (!name || !path) {
    return null;
  }
  const id = sanitizeId(raw.id, path);

  const colSpan =
    typeof raw.colSpan === 'number' && Number.isInteger(raw.colSpan)
      ? Math.min(4, Math.max(1, raw.colSpan))
      : undefined;
  const rowSpan =
    typeof raw.rowSpan === 'number' && Number.isInteger(raw.rowSpan)
      ? Math.min(2, Math.max(1, raw.rowSpan))
      : undefined;

  if (
    raw.tileType === 'widget' ||
    raw.widgetType ||
    path.startsWith('widget:')
  ) {
    const widget = (raw.widgetType ??
      path.replace(/^widget:/, '')) as 'media' | 'volume';
    if (widget !== 'media' && widget !== 'volume') {
      return null;
    }
    return {
      id,
      name,
      path: `widget:${widget}`,
      tileType: 'widget',
      widgetType: widget,
      colSpan: colSpan ?? (widget === 'media' || widget === 'volume' ? 2 : 1),
      rowSpan: rowSpan ?? 1,
    };
  }

  if (
    raw.tileType === 'utility' ||
    raw.utilityAction ||
    path.startsWith('utility:')
  ) {
    const action = (raw.utilityAction ??
      path.replace(/^utility:/, '')) as UtilityAction;
    if (!UTILITY_IDS.has(action)) {
      return null;
    }
    return {
      id,
      name,
      path: `utility:${action}`,
      tileType: 'utility',
      utilityAction: action,
      colSpan,
      rowSpan,
    };
  }

  if (
    raw.tileType === 'custom' ||
    raw.customFlow ||
    path.startsWith('custom:')
  ) {
    const flowId = path.startsWith('custom:') ? path.slice(7) : id;
    const flow = flows.find((item) => item.id === flowId);
    if (!flow) {
      return null;
    }
    return {
      id: flow.id,
      name: flow.name,
      path: `custom:${flow.id}`,
      iconPath: flow.iconPath,
      tileType: 'custom',
      customFlow: flow,
      colSpan,
      rowSpan,
    };
  }

  if (!isAllowedLaunchTarget(path) || isScriptPath(path)) {
    return null;
  }
  const iconPath =
    typeof raw.iconPath === 'string' && raw.iconPath.length < 4096
      ? raw.iconPath
      : undefined;
  return {
    id,
    name,
    path,
    iconPath,
    tileType: 'app',
    colSpan,
    rowSpan,
  };
};
