import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { NativeModules, Platform } from 'react-native';
import {
  emptyDeck,
  formatFingerprint,
  normalizeDeck,
  type DeckTileView,
  type MediaState,
  type PairingPayload,
  type VolumeState,
} from './protocol';
import { secureProfileStorage } from './secureStore';
import type { ThemeMode } from './theme/colors';

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
  mediaState: MediaState | null;
  volumeState: VolumeState;
  setScreen: (screen: ScreenName) => void;
  setError: (error: string | null) => void;
  setStatus: (status: AppState['status']) => void;
  setDeck: (tiles: Array<DeckTileView | null>) => void;
  setMediaState: (state: MediaState | null) => void;
  setVolumeState: (state: VolumeState) => void;
  startPairing: (payload: PairingPayload, otp: string) => void;
  startPinPairing: (pin: string) => void;
  finishPairing: (
    hostName: string,
    offer?: {
      fingerprint: string;
      token?: string;
      host: string;
      port: number;
      os: string;
    },
  ) => void;
  markDisconnected: () => void;
  selectProfile: (fingerprint: string) => void;
  removeProfile: (fingerprint: string) => void;
  cancelPairing: () => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};

type CryptoLike = { getRandomValues?: (array: Uint8Array) => Uint8Array };

const webCrypto = (): CryptoLike | undefined => {
  const fromGlobalThis = (globalThis as { crypto?: CryptoLike }).crypto;
  if (typeof fromGlobalThis?.getRandomValues === 'function') {
    return fromGlobalThis;
  }
  const fromGlobal = (globalThis as { global?: { crypto?: CryptoLike } }).global
    ?.crypto;
  if (typeof fromGlobal?.getRandomValues === 'function') {
    return fromGlobal;
  }
  return undefined;
};

const hexToBytes = (hex: string, size: number): Uint8Array | null => {
  if (hex.length !== size * 2 || /[^0-9a-fA-F]/.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const randomBytes = (size: number): Uint8Array => {
  const bytes = new Uint8Array(size);
  const cryptoApi = webCrypto();
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
    return bytes;
  }
  const hex = (
    NativeModules.NudgeDevice as { randomBytesHex?: (n: number) => string }
  )?.randomBytesHex?.(size);
  const fromNative = hex ? hexToBytes(hex, size) : null;
  if (fromNative) {
    return fromNative;
  }
  throw new Error('Secure random generator is unavailable');
};

export function makeDeviceId(): string {
  return `${Platform.OS}-${Array.from(randomBytes(16), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')}`;
}

export function makeFingerprint(): string {
  return formatFingerprint(randomBytes(3));
}

export function makeOtp(): string {
  const bytes = randomBytes(4);
  const value =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(100000 + (value % 900000));
}

export type { ThemeMode } from './theme/colors';

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
      mediaState: null,
      volumeState: { volume: 50, isMuted: false },
      setScreen: (screen) => set({ screen, error: null }),
      setError: (error) => set({ error }),
      setStatus: (status) => set({ status }),
      setDeck: (tiles) => set({ deck: normalizeDeck(tiles), hasDeck: true }),
      setMediaState: (mediaState) => set({ mediaState }),
      setVolumeState: (volumeState) => set({ volumeState }),
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
          const token = offer?.token;
          if (!token) {
            set({
              error: 'Desktop did not issue a device token. Pair again.',
              status: 'idle',
            });
            return;
          }
          const named: DesktopProfile = {
            name: hostName || pairing.payload.name,
            os: offer?.os || pairing.payload.os,
            fingerprint: offer?.fingerprint || pairing.payload.fingerprint,
            host: offer?.host || pairing.payload.host,
            port: offer?.port || pairing.payload.port,
            token,
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
          const existing = get().profiles.find(
            (item) => item.fingerprint === offer.fingerprint,
          );
          const token = offer.token || existing?.token;
          if (!token) {
            set({
              error: 'Missing device token. Pair again.',
              status: 'idle',
            });
            return;
          }
          const named: DesktopProfile = {
            name: hostName || existing?.name || 'Desktop',
            os: offer.os,
            fingerprint: offer.fingerprint,
            host: offer.host,
            port: offer.port,
            token,
            pairedAt: existing?.pairedAt ?? Date.now(),
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
        const wasActive = get().activeFingerprint === fingerprint;
        const activeFingerprint = wasActive
          ? (profiles[0]?.fingerprint ?? null)
          : get().activeFingerprint;
        set({
          profiles,
          activeFingerprint,
          screen: profiles.length > 0 ? 'profiles' : 'scan',
          ...(wasActive
            ? {
                status: 'idle' as const,
                connectedName: null,
                error: null,
                pairing: null,
                pin: null,
                deck: emptyDeck(),
                hasDeck: false,
              }
            : {}),
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
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'nudgeboard-mobile',
      storage: createJSONStorage(() => secureProfileStorage),
      partialize: (state) => ({
        deviceId: state.deviceId,
        fingerprint: state.fingerprint,
        profiles: state.profiles,
        activeFingerprint: state.activeFingerprint,
        theme: state.theme,
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
        if (state.theme !== 'light' && state.theme !== 'dark') {
          state.theme = 'dark';
        }
      },
    },
  ),
);
