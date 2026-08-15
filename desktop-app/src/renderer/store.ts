import { create } from 'zustand';
import type { BridgeSnapshot } from '../shared/ipc-types';

export type View = 'qr' | 'otp' | 'home';
export {
  GRID_COLUMNS,
  GRID_ROWS,
  GRID_SLOTS,
} from '../shared/ipc-types';

type AppState = {
  view: View;
  snapshot: BridgeSnapshot | null;
  setView: (view: View) => void;
  setSnapshot: (snapshot: BridgeSnapshot) => void;
};

export const useAppStore = create<AppState>((set) => ({
  view: 'qr',
  snapshot: null,
  setView: (view) => set({ view }),
  setSnapshot: (snapshot) => set({ snapshot }),
}));
