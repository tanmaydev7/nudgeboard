import { contextBridge, ipcRenderer } from 'electron';
import type {
  BridgeSnapshot,
  DesktopApp,
  ElectronAPI,
  MacPermissions,
  VerifyResult,
} from '../shared/ipc-types';
import type { MediaState, VolumeState } from '../shared/protocol';

const api: ElectronAPI = {
  platform: process.platform,
  getSnapshot: () => ipcRenderer.invoke('bridge:get-snapshot'),
  generateQr: () => ipcRenderer.invoke('bridge:generate-qr'),
  cancelPairing: () => ipcRenderer.invoke('bridge:cancel-pairing'),
  verifyOtp: (otp) =>
    ipcRenderer.invoke('bridge:verify-otp', otp) as Promise<VerifyResult>,
  acceptPending: () =>
    ipcRenderer.invoke('bridge:accept-pending') as Promise<VerifyResult>,
  setActiveDevice: (id) => ipcRenderer.invoke('bridge:set-active-device', id),
  listApps: () => ipcRenderer.invoke('bridge:list-apps') as Promise<DesktopApp[]>,
  getAppIcons: (paths) =>
    ipcRenderer.invoke('bridge:get-app-icons', paths) as Promise<
      Record<string, string>
    >,
  getUtilityIcons: () =>
    ipcRenderer.invoke('bridge:get-utility-icons') as Promise<
      Record<string, string>
    >,
  getPresetIcons: () =>
    ipcRenderer.invoke('bridge:get-preset-icons') as Promise<
      Record<string, string>
    >,
  setTile: (index, tile) =>
    ipcRenderer.invoke('bridge:set-tile', index, tile) as Promise<BridgeSnapshot>,
  moveTile: (fromIndex, toIndex) =>
    ipcRenderer.invoke('bridge:move-tile', fromIndex, toIndex) as Promise<BridgeSnapshot>,
  resizeTile: (index, colSpan, rowSpan) =>
    ipcRenderer.invoke('bridge:resize-tile', index, colSpan, rowSpan) as Promise<BridgeSnapshot>,
  addPage: () => ipcRenderer.invoke('bridge:add-page') as Promise<BridgeSnapshot>,
  removePage: (page) =>
    ipcRenderer.invoke('bridge:remove-page', page) as Promise<BridgeSnapshot>,
  removeDevice: (id) => ipcRenderer.invoke('bridge:remove-device', id),
  saveCustomFlow: (flow) =>
    ipcRenderer.invoke('bridge:save-custom-flow', flow) as Promise<BridgeSnapshot>,
  deleteCustomFlow: (id) =>
    ipcRenderer.invoke('bridge:delete-custom-flow', id) as Promise<BridgeSnapshot>,
  browseFile: (filter) =>
    ipcRenderer.invoke('bridge:browse-file', filter),
  setAppearance: (mode) =>
    ipcRenderer.invoke('bridge:set-appearance', mode) as Promise<BridgeSnapshot>,
  triggerWidgetAction: (action, value) =>
    ipcRenderer.invoke('bridge:trigger-widget-action', action, value) as Promise<void>,
  getMacPermissions: () =>
    ipcRenderer.invoke('bridge:get-mac-permissions') as Promise<MacPermissions>,
  requestMacAccessibility: () =>
    ipcRenderer.invoke('bridge:request-mac-accessibility') as Promise<boolean>,
  openMacPrivacySettings: (pane) =>
    ipcRenderer.invoke('bridge:open-mac-privacy-settings', pane) as Promise<void>,
  onSnapshot: (callback) => {
    const listener = (_event: unknown, snapshot: BridgeSnapshot) => {
      callback(snapshot);
    };
    ipcRenderer.on('bridge:snapshot', listener);
    return () => {
      ipcRenderer.removeListener('bridge:snapshot', listener);
    };
  },
  onMediaState: (callback) => {
    const listener = (_event: unknown, state: MediaState | null) => {
      callback(state);
    };
    ipcRenderer.on('bridge:media-state', listener);
    return () => {
      ipcRenderer.removeListener('bridge:media-state', listener);
    };
  },
  onVolumeState: (callback) => {
    const listener = (_event: unknown, state: VolumeState) => {
      callback(state);
    };
    ipcRenderer.on('bridge:volume-state', listener);
    return () => {
      ipcRenderer.removeListener('bridge:volume-state', listener);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
