import { contextBridge, ipcRenderer } from 'electron';
import type { BridgeSnapshot, ElectronAPI } from '../shared/ipc-types';

const api: ElectronAPI = {
  platform: process.platform,
  getSnapshot: () => ipcRenderer.invoke('bridge:get-snapshot'),
  generateQr: () => ipcRenderer.invoke('bridge:generate-qr'),
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
