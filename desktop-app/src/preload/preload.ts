import { contextBridge, ipcRenderer } from 'electron';
import type {
  BridgeSnapshot,
  DesktopApp,
  ElectronAPI,
  VerifyResult,
} from '../shared/ipc-types';

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
  onSnapshot: (callback) => {
    const listener = (_event: unknown, snapshot: BridgeSnapshot) => {
      callback(snapshot);
    };
    ipcRenderer.on('bridge:snapshot', listener);
    return () => {
      ipcRenderer.removeListener('bridge:snapshot', listener);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
