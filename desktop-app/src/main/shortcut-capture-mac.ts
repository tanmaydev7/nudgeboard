import { spawn, type ChildProcess } from 'child_process';
import { macHelperPath } from './mac-helper';

export type CapturedChord = {
  keys: string[];
  done: boolean;
};

let child: ChildProcess | null = null;

const killChild = (): void => {
  if (!child) {
    return;
  }
  child.kill('SIGTERM');
  child = null;
};

export const stopMacShortcutCapture = (): void => {
  killChild();
};

export const startMacShortcutCapture = (
  onChord: (chord: CapturedChord) => void,
): Promise<boolean> => {
  stopMacShortcutCapture();
  if (process.platform !== 'darwin') {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(ok);
    };

    const proc = spawn(macHelperPath(), ['shortcut-capture'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    child = proc;
    let buf = '';

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => {
      buf += chunk;
      let nl = buf.indexOf('\n');
      while (nl !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        nl = buf.indexOf('\n');
        if (!line) {
          continue;
        }
        try {
          const msg = JSON.parse(line) as {
            ok?: boolean;
            error?: string;
            keys?: string[];
            done?: boolean;
          };
          if (msg.error) {
            finish(false);
            return;
          }
          if (msg.ok) {
            finish(true);
            return;
          }
          if (Array.isArray(msg.keys)) {
            onChord({ keys: msg.keys, done: msg.done === true });
          }
        } catch {
          // ignore partial JSON
        }
      }
    });

    proc.on('exit', () => {
      if (child === proc) {
        child = null;
      }
      finish(false);
    });

    setTimeout(() => finish(false), 2500);
  });
};
