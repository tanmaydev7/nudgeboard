import { create } from 'zustand';
import type { BridgeSnapshot, MediaState, VolumeState } from '../shared/ipc-types';

export type View = 'qr' | 'otp' | 'confirm' | 'home';
export {
  GRID_COLUMNS,
  GRID_ROWS,
  GRID_SLOTS,
  MAX_PAGES,
  deckPageCount,
} from '../shared/ipc-types';

type AppState = {
  view: View;
  snapshot: BridgeSnapshot | null;
  mediaState: MediaState | null;
  volumeState: VolumeState;
  setView: (view: View) => void;
  setSnapshot: (snapshot: BridgeSnapshot) => void;
  setMediaState: (state: MediaState | null) => void;
  setVolumeState: (state: VolumeState) => void;
};

export const useAppStore = create<AppState>((set) => ({
  view: 'qr',
  snapshot: null,
  mediaState: null,
  volumeState: { volume: 50, isMuted: false },
  setView: (view) => set({ view }),
  setSnapshot: (snapshot) =>
    set((prev) => ({
      snapshot,
      mediaState: snapshot.mediaState !== undefined ? snapshot.mediaState : prev.mediaState,
      volumeState: snapshot.volumeState !== undefined ? snapshot.volumeState : prev.volumeState,
    })),
  setMediaState: (mediaState) => set({ mediaState }),
  setVolumeState: (volumeState) => set({ volumeState }),
}));
