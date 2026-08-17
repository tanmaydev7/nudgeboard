import { NativeModules } from 'react-native';
import {
  DEFAULT_PORT,
  isActivePairingPresence,
  lanCandidates,
  matchesPairedPresence,
  reconnectHosts,
} from './protocol';

const PROBE_MS = 280;
const WORKERS = 8;

type NudgeDeviceModule = {
  getLanHost?: () => string;
};

export function localLanHost(): string {
  const native = NativeModules.NudgeDevice as NudgeDeviceModule | undefined;
  return native?.getLanHost?.() ?? '';
}

export function pairingHosts(): string[] {
  return lanCandidates(localLanHost());
}

const probeBody = async (
  host: string,
  port: number,
): Promise<unknown | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_MS);
  try {
    const response = await fetch(`http://${host}:${port}/nudgeboard/pairing`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const scanHosts = async (
  hosts: string[],
  port: number,
  match: (body: unknown) => boolean,
): Promise<{ host: string; port: number } | null> => {
  let cursor = 0;
  let found: { host: string; port: number } | null = null;

  const worker = async () => {
    while (found == null && cursor < hosts.length) {
      const index = cursor;
      cursor += 1;
      const host = hosts[index];
      if (!host) {
        continue;
      }
      const body = await probeBody(host, port);
      if (body && match(body)) {
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

export async function findPairingHost(
  hosts = pairingHosts(),
  port = DEFAULT_PORT,
): Promise<{ host: string; port: number } | null> {
  return scanHosts(hosts, port, isActivePairingPresence);
}

export async function findPairedHost(
  fingerprint: string,
  port = DEFAULT_PORT,
  savedHost = '',
): Promise<{ host: string; port: number } | null> {
  return scanHosts(
    reconnectHosts(savedHost, localLanHost()),
    port,
    (body) => matchesPairedPresence(body, fingerprint),
  );
}
