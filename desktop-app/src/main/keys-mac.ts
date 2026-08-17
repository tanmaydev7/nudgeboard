import { execFile } from 'child_process';
import { promisify } from 'util';
import { app, BrowserWindow } from 'electron';
import { macHelperPath } from './mac-helper';

const execFileAsync = promisify(execFile);

const SKIP_BUNDLES = new Set([
  'com.nudgeboard.desktop',
  'com.github.electron',
  'electron',
]);

const MAC_FLAG_CONTROL = 0x00040000;
const MAC_FLAG_COMMAND = 0x00100000;
const MAC_FLAG_FN = 0x00800000;

let lastTargetPid = 0;
let tracker: ReturnType<typeof setInterval> | null = null;
let sendQueue: Promise<void> = Promise.resolve();

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isSelfApp = (pid: number, bundle: string): boolean => {
  if (!pid || pid === process.pid) {
    return true;
  }
  return SKIP_BUNDLES.has(bundle.trim().toLowerCase());
};

const readFrontmost = async (): Promise<number> => {
  try {
    const { stdout: asn } = await execFileAsync('/usr/bin/lsappinfo', ['front'], {
      timeout: 1500,
    });
    const { stdout } = await execFileAsync(
      '/usr/bin/lsappinfo',
      ['info', '-only', 'bundleID,pid', asn.trim()],
      { timeout: 1500 },
    );
    const pidMatch = /"pid"\s*=\s*(\d+)/.exec(stdout);
    const bundleMatch = /"CFBundleIdentifier"\s*=\s*"([^"]*)"/.exec(stdout);
    const pid = pidMatch ? parseInt(pidMatch[1], 10) : 0;
    const bundle = bundleMatch ? bundleMatch[1] : '';
    if (!Number.isFinite(pid) || isSelfApp(pid, bundle)) {
      return 0;
    }
    return pid;
  } catch {
    return 0;
  }
};

const refreshTarget = async (): Promise<number> => {
  const pid = await readFrontmost();
  if (pid > 0) {
    lastTargetPid = pid;
    return pid;
  }
  return lastTargetPid;
};

const activatePid = (pid: number): void => {
  execFile(
    '/usr/bin/osascript',
    [
      '-l',
      'JavaScript',
      '-e',
      `ObjC.import('AppKit');
function run(argv) {
  var app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(parseInt(argv[0], 10));
  if (app) app.activateWithOptions(2);
}`,
      String(pid),
    ],
    { timeout: 1500 },
    () => undefined,
  );
};

const eventFlags = (keyCode: number, flags: number): number => {
  let value = flags;
  // Match a real Control+Arrow: Control + Fn. Device bits (0x1 etc.) make
  // Mission Control miss the hotkey depending on leftover HID state.
  if (keyCode >= 123 && keyCode <= 126) {
    value |= MAC_FLAG_FN;
  }
  return value;
};

const isSpaceSwitch = (keyCode: number, flags: number): boolean =>
  (flags & MAC_FLAG_CONTROL) !== 0 &&
  (flags & MAC_FLAG_COMMAND) === 0 &&
  keyCode >= 123 &&
  keyCode <= 126;

const hideBeforeFiring = async (): Promise<void> => {
  const focused = BrowserWindow.getAllWindows().some((win) => win.isFocused());
  if (!focused) {
    return;
  }
  if (lastTargetPid > 0) {
    activatePid(lastTargetPid);
  }
  app.hide();
  await sleep(50);
};

const postHid = async (keyCode: number, flags: number): Promise<void> => {
  try {
    await execFileAsync(
      macHelperPath(),
      ['key-post', String(keyCode), String(flags)],
      { timeout: 4000 },
    );
  } catch (error) {
    const detail = error as { stderr?: string | Buffer; message?: string };
    const stderr = Buffer.isBuffer(detail.stderr)
      ? detail.stderr.toString('utf8')
      : detail.stderr;
    console.warn('[nudgeboard] shortcut helper', stderr?.trim() || detail.message);
    throw error;
  }
};

export const startMacKeyTargetTracking = (): void => {
  if (process.platform !== 'darwin' || tracker) {
    return;
  }
  void refreshTarget();
  tracker = setInterval(() => {
    void refreshTarget();
  }, 600);
  app.on('browser-window-blur', () => {
    setTimeout(() => {
      void refreshTarget();
    }, 50);
  });
};

export const stopMacKeyTargetTracking = (): void => {
  if (tracker) {
    clearInterval(tracker);
    tracker = null;
  }
};

export const sendMacKeyChord = async (
  keyCode: number,
  flags: number,
): Promise<void> => {
  const run = async (): Promise<void> => {
    void refreshTarget();
    const full = eventFlags(keyCode, flags);
    if (!isSpaceSwitch(keyCode, flags)) {
      await hideBeforeFiring();
    }
    console.log('[nudgeboard] shortcut send', { keyCode, flags: full });
    await postHid(keyCode, full);
  };
  const job = sendQueue.then(run, run);
  sendQueue = job.then(
    (): void => undefined,
    (): void => undefined,
  );
  await job;
};
