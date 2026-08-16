import { execFile, spawn } from 'child_process';
import { basename, extname } from 'path';
import { promisify } from 'util';
import { shell } from 'electron';
import type {
  CustomFlow,
  DeckTile,
  FlowStep,
  UtilityAction,
} from '../shared/ipc-types';
import { launchDesktopApp } from './apps';

const execFileAsync = promisify(execFile);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const executeUtility = async (action: UtilityAction): Promise<void> => {
  const platform = process.platform;

  if (platform === 'win32') {
    switch (action) {
      case 'media_play_pause':
        await execFileAsync('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '(New-Object -ComObject WScript.Shell).SendKeys([char]179)',
        ]);
        break;
      case 'media_next':
        await execFileAsync('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '(New-Object -ComObject WScript.Shell).SendKeys([char]176)',
        ]);
        break;
      case 'media_prev':
        await execFileAsync('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '(New-Object -ComObject WScript.Shell).SendKeys([char]177)',
        ]);
        break;
      case 'media_stop':
        await execFileAsync('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '(New-Object -ComObject WScript.Shell).SendKeys([char]178)',
        ]);
        break;
      case 'volume_up':
        await execFileAsync('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '(New-Object -ComObject WScript.Shell).SendKeys([char]175)',
        ]);
        break;
      case 'volume_down':
        await execFileAsync('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '(New-Object -ComObject WScript.Shell).SendKeys([char]174)',
        ]);
        break;
      case 'volume_mute':
        await execFileAsync('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '(New-Object -ComObject WScript.Shell).SendKeys([char]173)',
        ]);
        break;
      case 'lock_workstation':
        spawn('rundll32.exe', ['user32.dll,LockWorkStation'], {
          detached: true,
          stdio: 'ignore',
        }).unref();
        break;
      case 'screenshot':
        spawn('explorer.exe', ['ms-screenclip:'], {
          detached: true,
          stdio: 'ignore',
        }).unref();
        break;
    }
    return;
  }

  if (platform === 'darwin') {
    try {
      switch (action) {
        case 'media_play_pause':
          await execFileAsync('osascript', [
            '-e',
            'tell application "System Events" to key code 16',
          ]);
          break;
        case 'media_next':
          await execFileAsync('osascript', [
            '-e',
            'tell application "System Events" to key code 17',
          ]);
          break;
        case 'media_prev':
          await execFileAsync('osascript', [
            '-e',
            'tell application "System Events" to key code 18',
          ]);
          break;
        case 'media_stop':
          await execFileAsync('osascript', [
            '-e',
            'tell application "System Events" to key code 16',
          ]);
          break;
        case 'volume_up':
          await execFileAsync('osascript', [
            '-e',
            'set volume output volume ((output volume of (get volume settings)) + 6)',
          ]);
          break;
        case 'volume_down':
          await execFileAsync('osascript', [
            '-e',
            'set volume output volume ((output volume of (get volume settings)) - 6)',
          ]);
          break;
        case 'volume_mute':
          await execFileAsync('osascript', [
            '-e',
            'set volume output muted not (output muted of (get volume settings))',
          ]);
          break;
        case 'lock_workstation':
          spawn('pmset', ['displaysleepnow'], {
            detached: true,
            stdio: 'ignore',
          }).unref();
          break;
        case 'screenshot':
          spawn('screencapture', ['-i', '-c'], {
            detached: true,
            stdio: 'ignore',
          }).unref();
          break;
      }
    } catch {
      // ignore
    }
    return;
  }

  // Linux
  try {
    switch (action) {
      case 'media_play_pause':
        await execFileAsync('sh', [
          '-c',
          'playerctl play-pause || xdotool key XF86AudioPlay',
        ]);
        break;
      case 'media_next':
        await execFileAsync('sh', [
          '-c',
          'playerctl next || xdotool key XF86AudioNext',
        ]);
        break;
      case 'media_prev':
        await execFileAsync('sh', [
          '-c',
          'playerctl previous || xdotool key XF86AudioPrev',
        ]);
        break;
      case 'media_stop':
        await execFileAsync('sh', [
          '-c',
          'playerctl stop || xdotool key XF86AudioStop',
        ]);
        break;
      case 'volume_up':
        await execFileAsync('sh', [
          '-c',
          'pamixer -i 5 || amixer set Master 5%+ || xdotool key XF86AudioRaiseVolume',
        ]);
        break;
      case 'volume_down':
        await execFileAsync('sh', [
          '-c',
          'pamixer -d 5 || amixer set Master 5%- || xdotool key XF86AudioLowerVolume',
        ]);
        break;
      case 'volume_mute':
        await execFileAsync('sh', [
          '-c',
          'pamixer -t || amixer set Master toggle || xdotool key XF86AudioMute',
        ]);
        break;
      case 'lock_workstation':
        await execFileAsync('sh', [
          '-c',
          'loginctl lock-session || xdg-screensaver lock',
        ]);
        break;
      case 'screenshot':
        await execFileAsync('sh', [
          '-c',
          'gnome-screenshot -i || flameshot gui || spectacle || scrot -s',
        ]);
        break;
    }
  } catch {
    // ignore
  }
};

const formatSendKeysForWindows = (keys: string[]): string | null => {
  let hasCtrl = false;
  let hasShift = false;
  let hasAlt = false;
  let hasWin = false;
  const standardKeys: string[] = [];

  for (const raw of keys) {
    const k = raw.trim().toLowerCase();
    if (k === 'ctrl' || k === 'control') {
      hasCtrl = true;
    } else if (k === 'shift') {
      hasShift = true;
    } else if (k === 'alt') {
      hasAlt = true;
    } else if (k === 'win' || k === 'meta' || k === 'windows' || k === 'cmd' || k === 'command') {
      hasWin = true;
    } else {
      standardKeys.push(k);
    }
  }

  // Handle Win combinations
  if (hasWin) {
    if (standardKeys.includes('d')) {
      return '__WIN_D__';
    }
    if (standardKeys.includes('e')) {
      return '__WIN_E__';
    }
    if (standardKeys.includes('r')) {
      return '__WIN_R__';
    }
    if (standardKeys.includes('m')) {
      return '__WIN_M__';
    }
    if (standardKeys.includes('l')) {
      return '__WIN_L__';
    }
  }

  let prefix = '';
  if (hasCtrl) prefix += '^';
  if (hasShift) prefix += '+';
  if (hasAlt) prefix += '%';

  const mapSpecial: Record<string, string> = {
    esc: '{ESC}',
    escape: '{ESC}',
    enter: '{ENTER}',
    return: '{ENTER}',
    tab: '{TAB}',
    backspace: '{BACKSPACE}',
    delete: '{DELETE}',
    del: '{DELETE}',
    space: ' ',
    up: '{UP}',
    arrowup: '{UP}',
    down: '{DOWN}',
    arrowdown: '{DOWN}',
    left: '{LEFT}',
    arrowleft: '{LEFT}',
    right: '{RIGHT}',
    arrowright: '{RIGHT}',
    home: '{HOME}',
    end: '{END}',
    pageup: '{PGUP}',
    pagedown: '{PGDN}',
    f1: '{F1}',
    f2: '{F2}',
    f3: '{F3}',
    f4: '{F4}',
    f5: '{F5}',
    f6: '{F6}',
    f7: '{F7}',
    f8: '{F8}',
    f9: '{F9}',
    f10: '{F10}',
    f11: '{F11}',
    f12: '{F12}',
    capslock: '{CAPSLOCK}',
    insert: '{INSERT}',
    prtsc: '{PRTSC}',
    printscreen: '{PRTSC}',
  };

  const keyTokens = standardKeys.map((k) => mapSpecial[k] ?? k.toLowerCase());
  if (keyTokens.length === 0 && (hasCtrl || hasShift || hasAlt)) {
    return null;
  }
  return prefix + (keyTokens.length === 1 ? keyTokens[0] : `(${keyTokens.join('')})`);
};

const MODIFIER_VK: Record<string, number> = {
  ctrl: 0x11,
  control: 0x11,
  shift: 0x10,
  alt: 0x12,
  win: 0x5b,
  meta: 0x5b,
  windows: 0x5b,
  cmd: 0x5b,
  command: 0x5b,
};

const SPECIAL_VK: Record<string, number> = {
  esc: 0x1b,
  escape: 0x1b,
  enter: 0x0d,
  return: 0x0d,
  tab: 0x09,
  backspace: 0x08,
  delete: 0x2e,
  del: 0x2e,
  space: 0x20,
  up: 0x26,
  arrowup: 0x26,
  down: 0x28,
  arrowdown: 0x28,
  left: 0x25,
  arrowleft: 0x25,
  right: 0x27,
  arrowright: 0x27,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
  capslock: 0x14,
  insert: 0x2d,
  prtsc: 0x2c,
  printscreen: 0x2c,
};

const keyToVirtualKey = (raw: string): number | null => {
  const k = raw.trim().toLowerCase();
  if (MODIFIER_VK[k] != null) {
    return MODIFIER_VK[k];
  }
  if (SPECIAL_VK[k] != null) {
    return SPECIAL_VK[k];
  }
  const fn = /^f([1-9]|1[0-2])$/.exec(k);
  if (fn) {
    return 0x6f + Number(fn[1]);
  }
  if (k.length === 1) {
    const code = k.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      return code - 32;
    }
    if (code >= 48 && code <= 57) {
      return code;
    }
  }
  return null;
};

const keysToVirtualKeys = (keys: string[]): number[] | null => {
  const vks: number[] = [];
  for (const key of keys) {
    const vk = keyToVirtualKey(key);
    if (vk == null) {
      return null;
    }
    vks.push(vk);
  }
  return vks.length > 0 ? vks : null;
};

const psSingleQuote = (value: string): string =>
  `'${value.replace(/'/g, "''")}'`;

const processNameFromLaunchPath = (filePath: string): string | undefined => {
  let candidate = basename(filePath, extname(filePath)).trim();
  if (process.platform === 'win32' && extname(filePath).toLowerCase() === '.lnk') {
    try {
      const target = shell.readShortcutLink(filePath).target?.trim();
      if (target) {
        candidate = basename(target, extname(target)).trim();
      }
    } catch {
      // keep the .lnk stem
    }
  }
  if (!candidate || !/^[\w. -]+$/.test(candidate)) {
    return undefined;
  }
  return candidate;
};

const runHiddenPowerShell = async (script: string): Promise<void> => {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 30000 },
    );
  } catch (err) {
    const detail = err as { stderr?: string | Buffer; message?: string };
    const stderr = Buffer.isBuffer(detail.stderr)
      ? detail.stderr.toString('utf8')
      : detail.stderr;
    throw new Error(stderr?.trim() || detail.message || 'PowerShell key send failed');
  }
};

const sendWindowsChord = async (
  keys: string[],
  activateProcess?: string,
): Promise<void> => {
  const vks = keysToVirtualKeys(keys);
  if (!vks) {
    return;
  }

  const nameExpr = activateProcess ? psSingleQuote(activateProcess) : "''";

  await runHiddenPowerShell(`
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NbWin {
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr ins, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint map);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public struct RECT { public int L, T, R, B; }
  public struct POINT { public int X, Y; }
  public static void Focus(IntPtr hWnd) {
    SetProcessDPIAware();
    if (IsIconic(hWnd)) ShowWindow(hWnd, 9);
    IntPtr fg = GetForegroundWindow();
    uint fgPid, tgtPid;
    uint fgT = GetWindowThreadProcessId(fg, out fgPid);
    uint tgtT = GetWindowThreadProcessId(hWnd, out tgtPid);
    uint cur = GetCurrentThreadId();
    AttachThreadInput(cur, fgT, true);
    AttachThreadInput(cur, tgtT, true);
    SetWindowPos(hWnd, new IntPtr(-1), 0,0,0,0, 0x0001|0x0002|0x0040);
    SetWindowPos(hWnd, new IntPtr(-2), 0,0,0,0, 0x0001|0x0002|0x0040);
    BringWindowToTop(hWnd);
    SwitchToThisWindow(hWnd, true);
    SetForegroundWindow(hWnd);
    AttachThreadInput(cur, tgtT, false);
    AttachThreadInput(cur, fgT, false);
    POINT old;
    GetCursorPos(out old);
    RECT r;
    GetWindowRect(hWnd, out r);
    SetCursorPos(r.L + (r.R - r.L) / 2, r.T + 16);
    mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
    mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
    System.Threading.Thread.Sleep(80);
    SetCursorPos(old.X, old.Y);
  }
  public static void Chord(byte[] keys) {
    byte[] scans = new byte[keys.Length];
    for (int i = 0; i < keys.Length; i++) scans[i] = (byte)MapVirtualKey(keys[i], 0);
    for (int i = 0; i < keys.Length; i++) {
      keybd_event(keys[i], scans[i], 0, UIntPtr.Zero);
      System.Threading.Thread.Sleep(20);
    }
    System.Threading.Thread.Sleep(40);
    for (int i = keys.Length - 1; i >= 0; i--) {
      keybd_event(keys[i], scans[i], 2, UIntPtr.Zero);
      System.Threading.Thread.Sleep(20);
    }
  }
}
"@
$name = ${nameExpr}
$hwnd = [IntPtr]::Zero
if ($name) {
  for ($i = 0; $i -lt 48; $i++) {
    $proc = Get-Process -Name $name -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowHandle -ne 0 } |
      Select-Object -First 1
    if ($proc) { $hwnd = [IntPtr]$proc.MainWindowHandle; break }
    Start-Sleep -Milliseconds 250
  }
}
if ($hwnd -ne [IntPtr]::Zero) {
  [NbWin]::Focus($hwnd)
  Start-Sleep -Milliseconds 200
}
[NbWin]::Chord([byte[]]@(${vks.join(',')}))
`);
};

type FlowExecContext = {
  lastLaunchProcess?: string;
};

export const executeShortcut = async (
  keys: string[],
  activateProcess?: string,
): Promise<void> => {
  if (!keys || keys.length === 0) {
    return;
  }

  const platform = process.platform;

  if (platform === 'win32') {
    const formatted = formatSendKeysForWindows(keys);
    if (!formatted) {
      return;
    }

    if (formatted === '__WIN_D__') {
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '(New-Object -ComObject Shell.Application).ToggleDesktop()',
      ], { windowsHide: true });
      return;
    }
    if (formatted === '__WIN_E__') {
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '(New-Object -ComObject Shell.Application).Explore([Environment]::GetFolderPath("MyComputer"))',
      ], { windowsHide: true });
      return;
    }
    if (formatted === '__WIN_R__') {
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '(New-Object -ComObject Shell.Application).FileRun()',
      ], { windowsHide: true });
      return;
    }
    if (formatted === '__WIN_M__') {
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '(New-Object -ComObject Shell.Application).MinimizeAll()',
      ], { windowsHide: true });
      return;
    }
    if (formatted === '__WIN_L__') {
      spawn('rundll32.exe', ['user32.dll,LockWorkStation'], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return;
    }

    await sendWindowsChord(keys, activateProcess);
    return;
  }

  if (platform === 'darwin') {
    const modifiers: string[] = [];
    const plain: string[] = [];
    for (const key of keys) {
      const lower = key.toLowerCase();
      if (lower === 'cmd' || lower === 'command' || lower === 'meta') {
        modifiers.push('command down');
      } else if (lower === 'ctrl' || lower === 'control') {
        modifiers.push('control down');
      } else if (lower === 'shift') {
        modifiers.push('shift down');
      } else if (lower === 'alt' || lower === 'option') {
        modifiers.push('option down');
      } else {
        plain.push(key);
      }
    }
    const targetKey = plain[0] ?? '';
    const usingClause =
      modifiers.length > 0 ? ` using {${modifiers.join(', ')}}` : '';
    try {
      await execFileAsync('osascript', [
        '-e',
        `tell application "System Events" to keystroke "${targetKey}"${usingClause}`,
      ]);
    } catch {
      // ignore
    }
    return;
  }

  // Linux
  const linuxCombo = keys
    .map((k) => {
      const l = k.toLowerCase();
      if (l === 'ctrl' || l === 'control') return 'ctrl';
      if (l === 'shift') return 'shift';
      if (l === 'alt') return 'alt';
      if (l === 'win' || l === 'meta' || l === 'super') return 'super';
      return k;
    })
    .join('+');
  try {
    await execFileAsync('sh', ['-c', `xdotool key ${linuxCombo}`]);
  } catch {
    // ignore
  }
};

export const executeFlowStep = async (
  step: FlowStep,
  ctx: FlowExecContext = {},
): Promise<void> => {
  if (step.type === 'delay') {
    await sleep(Math.max(10, step.ms));
    return;
  }

  if (step.type === 'shortcut') {
    await executeShortcut(step.keys, ctx.lastLaunchProcess);
    return;
  }

  if (step.type === 'launch') {
    const rawPath = step.path?.trim();
    if (!rawPath) {
      return;
    }

    const args = step.args?.trim()
      ? step.args
          .split(' ')
          .map((a) => a.trim())
          .filter(Boolean)
      : [];

    const lower = rawPath.toLowerCase();
    ctx.lastLaunchProcess = processNameFromLaunchPath(rawPath);

    // PowerShell script
    if (lower.endsWith('.ps1')) {
      spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', rawPath, ...args], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return;
    }

    // Batch script
    if (lower.endsWith('.bat') || lower.endsWith('.cmd')) {
      spawn('cmd.exe', ['/c', rawPath, ...args], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return;
    }

    // Bash script
    if (lower.endsWith('.sh')) {
      spawn('/bin/bash', [rawPath, ...args], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return;
    }

    // Quick Terminal launch presets
    if (
      lower === 'wt' ||
      lower === 'wt.exe' ||
      lower === 'powershell' ||
      lower === 'powershell.exe' ||
      lower === 'cmd' ||
      lower === 'cmd.exe'
    ) {
      spawn(rawPath, args, {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return;
    }

    // Program with arguments
    if (args.length > 0) {
      spawn(rawPath, args, {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return;
    }

    // Standard app or document launch
    await launchDesktopApp(rawPath);
  }
};

export const executeCustomFlow = async (flow: CustomFlow): Promise<void> => {
  if (!flow || !Array.isArray(flow.steps) || flow.steps.length === 0) {
    return;
  }

  const ctx: FlowExecContext = {};
  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i];
    await executeFlowStep(step, ctx);
    // Give a 60ms pause between sequential actions if not explicitly a delay
    if (step.type !== 'delay' && i < flow.steps.length - 1) {
      await sleep(60);
    }
  }
};

export const executeTile = async (
  tile: DeckTile,
  allFlows: CustomFlow[] = [],
): Promise<void> => {
  if (!tile) {
    return;
  }

  // 1. Utility tile
  if (
    tile.tileType === 'utility' ||
    tile.utilityAction ||
    tile.path?.startsWith('utility:')
  ) {
    const action =
      tile.utilityAction ??
      (tile.path.replace(/^utility:/, '') as UtilityAction);
    await executeUtility(action);
    return;
  }

  // 2. Custom Flow tile
  if (
    tile.tileType === 'custom' ||
    tile.customFlow ||
    tile.path?.startsWith('custom:')
  ) {
    const flow =
      tile.customFlow ??
      allFlows.find(
        (f) => f.id === tile.id || f.id === tile.path.replace(/^custom:/, ''),
      );
    if (flow) {
      await executeCustomFlow(flow);
      return;
    }
  }

  // 3. Standard App launch
  await launchDesktopApp(tile.path);
};
