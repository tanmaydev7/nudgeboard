import { NativeModules } from 'react-native';
import {
  APP_ID,
  DEFAULT_PORT,
  fallbackLanCandidates,
  lanCandidates,
} from './protocol';

const PROBE_MS = 280;
const WORKERS = 32;

type NudgeDeviceModule = {
  getLanHost?: () => string;
};

export function localLanHost(): string {
  const native = NativeModules.NudgeDevice as NudgeDeviceModule | undefined;
  return native?.getLanHost?.() ?? '';
}

export function pairingHosts(): string[] {
  const ip = localLanHost();
  const hosts = lanCandidates(ip);
  return hosts.length > 0 ? hosts : fallbackLanCandidates();
}

const probe = async (host: string, port: number): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_MS);
  try {
    const response = await fetch(`http://${host}:${port}/nudgeboard/pairing`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return false;
    }
    const body = (await response.json()) as { app?: string };
    return body.app === APP_ID;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

export async function findPairingHost(
  hosts = pairingHosts(),
  port = DEFAULT_PORT,
): Promise<{ host: string; port: number } | null> {
  let cursor = 0;
  let found: { host: string; port: number } | null = null;

  const worker = async () => {
    while (found == null && cursor < hosts.length) {
      const index = cursor;
      cursor += 1;
      const host = hosts[index];
      if (host && (await probe(host, port))) {
        found = { host, port };
        return;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(WORKERS, hosts.length) }, () => worker()),
  );
  return found;
};
