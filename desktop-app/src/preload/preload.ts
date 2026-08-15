import { contextBridge } from 'electron';
import type { ElectronAPI } from '../shared/ipc-types';

const api: ElectronAPI = {
  platform: process.platform,
};

contextBridge.exposeInMainWorld('api', api);
