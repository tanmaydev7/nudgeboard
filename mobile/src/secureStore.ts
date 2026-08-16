import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

const STATE_KEY_TOKENS = 'nudgeboard-tokens';

type NudgeDeviceModule = {
  saveSecret?: (key: string, value: string) => boolean;
  loadSecret?: (key: string) => string;
  deleteSecret?: (key: string) => boolean;
};

const native = (): NudgeDeviceModule | undefined =>
  NativeModules.NudgeDevice as NudgeDeviceModule | undefined;

const writeSecret = async (value: string): Promise<void> => {
  const mod = native();
  if (typeof mod?.saveSecret === 'function') {
    mod.saveSecret(STATE_KEY_TOKENS, value);
    await AsyncStorage.removeItem(STATE_KEY_TOKENS);
    return;
  }
  await AsyncStorage.setItem(STATE_KEY_TOKENS, value);
};

const readSecret = async (): Promise<string | null> => {
  const mod = native();
  if (typeof mod?.loadSecret === 'function') {
    const value = mod.loadSecret(STATE_KEY_TOKENS);
    return value ? value : null;
  }
  return AsyncStorage.getItem(STATE_KEY_TOKENS);
};

type PersistedBlob = {
  state?: {
    profiles?: Array<{ fingerprint?: string; token?: string }>;
  };
};

const mergeTokens = async (json: string): Promise<string> => {
  let parsed: PersistedBlob;
  try {
    parsed = JSON.parse(json) as PersistedBlob;
  } catch {
    return json;
  }
  const secretRaw = await readSecret();
  let tokens: Record<string, string> = {};
  if (secretRaw) {
    try {
      tokens = JSON.parse(secretRaw) as Record<string, string>;
    } catch {
      tokens = {};
    }
  }
  const profiles = parsed.state?.profiles;
  if (Array.isArray(profiles)) {
    parsed.state = {
      ...parsed.state,
      profiles: profiles.map((profile) => ({
        ...profile,
        token:
          (profile.fingerprint && tokens[profile.fingerprint]) ||
          profile.token ||
          '',
      })),
    };
  }
  return JSON.stringify(parsed);
};

const splitTokens = async (json: string): Promise<string> => {
  let parsed: PersistedBlob;
  try {
    parsed = JSON.parse(json) as PersistedBlob;
  } catch {
    return json;
  }
  const tokens: Record<string, string> = {};
  const profiles = parsed.state?.profiles;
  if (Array.isArray(profiles)) {
    parsed.state = {
      ...parsed.state,
      profiles: profiles.map((profile) => {
        if (profile.fingerprint && profile.token) {
          tokens[profile.fingerprint] = profile.token;
        }
        return { ...profile, token: '' };
      }),
    };
  }
  await writeSecret(JSON.stringify(tokens));
  return JSON.stringify(parsed);
};

export const secureProfileStorage: StateStorage = {
  getItem: async (name) => {
    const json = await AsyncStorage.getItem(name);
    if (!json) {
      return null;
    }
    return mergeTokens(json);
  },
  setItem: async (name, value) => {
    const stripped = await splitTokens(value);
    await AsyncStorage.setItem(name, stripped);
  },
  removeItem: async (name) => {
    await AsyncStorage.removeItem(name);
    const mod = native();
    if (typeof mod?.deleteSecret === 'function') {
      mod.deleteSecret(STATE_KEY_TOKENS);
      return;
    }
    await AsyncStorage.removeItem(STATE_KEY_TOKENS);
  },
};
