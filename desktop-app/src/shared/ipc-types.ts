export interface ElectronAPI {
  platform: NodeJS.Platform;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
