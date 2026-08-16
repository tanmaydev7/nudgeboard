import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  emptyDeck,
  formatFingerprint,
  normalizeDeck,
  type DeckTileView,
  type PairingPayload,
} from './protocol';

export type ScreenName =
  | 'scan'
  | 'manual'
  | 'pair_code'
  | 'profiles'
  | 'deck';

export type DesktopProfile = {
  name: string;
  os: string;
  fingerprint: string;
  host: string;
  port: number;
  token: string;
  pairedAt: number;
};

export type PairingDraft = {
  payload: PairingPayload;
  otp: string;
  expiresAt: number;
};

type AppState = {
  deviceId: string;
  fingerprint: string;
  profiles: DesktopProfile[];
  activeFingerprint: string | null;
  screen: ScreenName;
  pairing: PairingDraft | null;
  pin: string | null;
  connectedName: string | null;
  error: string | null;
  status: 'idle' | 'connecting' | 'connected';
  deck: Array<DeckTileView | null>;
  hasDeck: boolean;
  setScreen: (screen: ScreenName) => void;
  setError: (error: string | null) => void;
  setStatus: (status: AppState['status']) => void;
  setDeck: (tiles: Array<DeckTileView | null>) => void;
  startPairing: (payload: PairingPayload, otp: string) => void;
  startPinPairing: (pin: string) => void;
  finishPairing: (
    hostName: string,
    offer?: {
      fingerprint: string;
      token: string;
      host: string;
      port: number;
      os: string;
    },
  ) => void;
  markDisconnected: () => void;
  selectProfile: (fingerprint: string) => void;
  removeProfile: (fingerprint: string) => void;
  cancelPairing: () => void;
};

export function makeDeviceId(): string {
  return `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeFingerprint(): string {
  return formatFingerprint([
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
  ]);
}

export function makeOtp(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

export function upsertDesktop(
  profiles: DesktopProfile[],
  next: DesktopProfile,
): DesktopProfile[] {
  const index = profiles.findIndex(
    (item) => item.fingerprint === next.fingerprint,
  );
  if (index < 0) {
    return [...profiles, next];
  }
  const copy = profiles.slice();
  copy[index] = { ...copy[index], ...next };
  return copy;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      deviceId: makeDeviceId(),
      fingerprint: makeFingerprint(),
      profiles: [],
      activeFingerprint: null,
      screen: 'scan',
      pairing: null,
      pin: null,
      connectedName: null,
      error: null,
      status: 'idle',
      deck: emptyDeck(),
      hasDeck: false,
      setScreen: (screen) => set({ screen, error: null }),
      setError: (error) => set({ error }),
      setStatus: (status) => set({ status }),
      setDeck: (tiles) => set({ deck: normalizeDeck(tiles), hasDeck: true }),
      startPairing: (payload, otp) =>
        set({
          pairing: {
            payload,
            otp,
            expiresAt: Date.now() + 2 * 60 * 1000,
          },
          pin: null,
          screen: 'pair_code',
          error: null,
          status: 'connecting',
          connectedName: null,
          deck: emptyDeck(),
          hasDeck: false,
        }),
      startPinPairing: (pin) =>
        set({
          pin,
          pairing: null,
          screen: 'manual',
          error: null,
          status: 'connecting',
          connectedName: null,
          deck: emptyDeck(),
          hasDeck: false,
        }),
      finishPairing: (hostName, offer) => {
        const pairing = get().pairing;
        if (pairing) {
          const named: DesktopProfile = {
            name: hostName || pairing.payload.name,
            os: pairing.payload.os,
            fingerprint: pairing.payload.fingerprint,
            host: pairing.payload.host,
            port: pairing.payload.port,
            token: pairing.payload.token,
            pairedAt: Date.now(),
          };
          set({
            profiles: upsertDesktop(get().profiles, named),
            activeFingerprint: named.fingerprint,
            connectedName: hostName,
            status: 'connected',
            screen: 'deck',
            pairing: null,
            pin: null,
            error: null,
          });
          return;
        }
        if (offer) {
          const named: DesktopProfile = {
            name: hostName || 'Desktop',
            os: offer.os,
            fingerprint: offer.fingerprint,
            host: offer.host,
            port: offer.port,
            token: offer.token,
            pairedAt: Date.now(),
          };
          set({
            profiles: upsertDesktop(get().profiles, named),
            activeFingerprint: named.fingerprint,
            connectedName: hostName,
            status: 'connected',
            screen: 'deck',
            pairing: null,
            pin: null,
            error: null,
          });
          return;
        }
        const fingerprint = get().activeFingerprint;
        set({
          profiles: get().profiles.map((item) =>
            item.fingerprint === fingerprint
              ? { ...item, name: hostName || item.name }
              : item,
          ),
          connectedName: hostName,
          status: 'connected',
          screen: 'deck',
          error: null,
        });
      },
      markDisconnected: () =>
        set({
          status: 'idle',
          connectedName: null,
        }),
      selectProfile: (fingerprint) => {
        const same = get().activeFingerprint === fingerprint;
        set({
          activeFingerprint: fingerprint,
          error: null,
          pairing: null,
          pin: null,
          status: 'connecting',
          deck: same ? get().deck : emptyDeck(),
          hasDeck: same ? get().hasDeck : false,
        });
      },
      removeProfile: (fingerprint) => {
        const profiles = get().profiles.filter(
          (item) => item.fingerprint !== fingerprint,
        );
        const activeFingerprint =
          get().activeFingerprint === fingerprint
            ? (profiles[0]?.fingerprint ?? null)
            : get().activeFingerprint;
        set({
          profiles,
          activeFingerprint,
          screen: profiles.length > 0 ? 'profiles' : 'scan',
        });
      },
      cancelPairing: () =>
        set({
          pairing: null,
          pin: null,
          status: 'idle',
          error: null,
          connectedName: null,
          deck: emptyDeck(),
          hasDeck: false,
          screen: get().profiles.length > 0 ? 'profiles' : 'scan',
        }),
    }),
    {
      name: 'nudgeboard-mobile',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        deviceId: state.deviceId,
        fingerprint: state.fingerprint,
        profiles: state.profiles,
        activeFingerprint: state.activeFingerprint,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }
        state.screen = state.profiles.length > 0 ? 'profiles' : 'scan';
        state.status = 'idle';
        state.connectedName = null;
        state.pairing = null;
        state.pin = null;
        state.deck = emptyDeck();
        state.hasDeck = false;
      },
    },
  ),
);
