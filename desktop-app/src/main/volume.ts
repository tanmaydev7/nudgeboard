import { execFile, spawn, type ChildProcess } from 'child_process';
import readline from 'readline';
import { promisify } from 'util';
import type { VolumeState } from '../shared/ipc-types';

const execFileAsync = promisify(execFile);

let cachedVolume: VolumeState = { volume: 50, isMuted: false };
let lastPolled = 0;
let lastSetTime = 0;
let setSeq = 0;
let isFetching = false;

// Windows C# COM CoreAudio definitions
const WIN_AUDIO_CS = `
using System;
using System.Runtime.InteropServices;

namespace AudioHelper {
    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolume {
        int RegisterControlChangeNotify(IntPtr pNotify);
        int UnregisterControlChangeNotify(IntPtr pNotify);
        int GetChannelCount(out uint pnChannelCount);
        int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
        int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
        int GetMasterVolumeLevel(out float pfLevelDB);
        int GetMasterVolumeLevelScalar(out float pfLevel);
        int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
        int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
        int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
        int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
        int VolumeStepUp(ref Guid pguidEventContext);
        int VolumeStepDown(ref Guid pguidEventContext);
        int QueryHardwareSupport(out uint pdwHardwareSupportMask);
        int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice {
        int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
        int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
        int GetState(out int pdwState);
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string pwstrId, out IMMDevice ppDevice);
        int RegisterEndpointNotificationCallback(IntPtr pClient);
        int UnregisterEndpointNotificationCallback(IntPtr pClient);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumeratorComObject { }

    public class CoreAudioController {
        public static string Action(string cmd, float val) {
            IMMDevice dev = null;
            IAudioEndpointVolume epv = null;
            try {
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                // Dynamically query the current default audio endpoint (eConsole = 0, eMultimedia = 1)
                // This ensures plugging in headphones or changing default audio output device in Windows
                // immediately controls the active listening device rather than a stale speaker endpoint.
                int hr = enumerator.GetDefaultAudioEndpoint(0, 0, out dev);
                if (hr != 0 || dev == null) {
                    hr = enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                }
                if (hr != 0 || dev == null) return "{\\"volume\\":50,\\"isMuted\\":false}";
                var iid = typeof(IAudioEndpointVolume).GUID;
                object epvObj;
                hr = dev.Activate(ref iid, 23, IntPtr.Zero, out epvObj);
                if (hr != 0 || epvObj == null) return "{\\"volume\\":50,\\"isMuted\\":false}";
                epv = (IAudioEndpointVolume)epvObj;

                Guid g = Guid.Empty;
                if (cmd == "set") {
                    epv.SetMasterVolumeLevelScalar(val, ref g);
                } else if (cmd == "mute") {
                    bool cur;
                    epv.GetMute(out cur);
                    epv.SetMute(!cur, ref g);
                }
                float vol = 0.5f;
                epv.GetMasterVolumeLevelScalar(out vol);
                bool mute = false;
                epv.GetMute(out mute);
                int v = (int)Math.Round(vol * 100);
                return string.Format("{{\\"volume\\":{0},\\"isMuted\\":{1}}}", v, mute ? "true" : "false");
            } catch (Exception ex) {
                return string.Format("{{\\"volume\\":50,\\"isMuted\\":false,\\"error\\":\\"{0}\\"}}", ex.Message.Replace("\\"", "'"));
            } finally {
                if (epv != null) { try { Marshal.ReleaseComObject(epv); } catch {} }
                if (dev != null) { try { Marshal.ReleaseComObject(dev); } catch {} }
            }
        }
    }
}
`;

const PS_WORKER_SCRIPT = `
Add-Type -TypeDefinition @"
${WIN_AUDIO_CS}
"@
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::WriteLine("READY")
while ($line = [Console]::ReadLine()) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line.Trim().Split(' ')
    $cmd = $parts[0]
    $val = if ($parts.Length -gt 1) { [float]$parts[1] } else { 0.5 }
    $res = [AudioHelper.CoreAudioController]::Action($cmd, $val)
    [Console]::WriteLine($res)
}
`;

class WindowsAudioWorker {
  private proc: ChildProcess | null = null;
  private isReady = false;
  private queue: Array<{
    cmd: string;
    val: number;
    resolve: (res: VolumeState | null) => void;
  }> = [];
  private activeRequest: ((res: VolumeState | null) => void) | null = null;
  private starting = false;

  public init() {
    if (process.platform !== 'win32' || this.proc || this.starting) return;
    this.starting = true;

    try {
      const encoded = Buffer.from(PS_WORKER_SCRIPT, 'utf16le').toString('base64');
      this.proc = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden',
          '-EncodedCommand',
          encoded,
        ],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
      );

      if (!this.proc.stdout || !this.proc.stdin) {
        this.proc = null;
        this.starting = false;
        return;
      }

      const rl = readline.createInterface({ input: this.proc.stdout });

      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (trimmed === 'READY') {
          this.isReady = true;
          this.starting = false;
          this.processQueue();
          return;
        }

        if (this.activeRequest) {
          const resolve = this.activeRequest;
          this.activeRequest = null;
          try {
            const parsed = JSON.parse(trimmed) as Partial<VolumeState>;
            if (typeof parsed.volume === 'number') {
              resolve({
                volume: Math.min(100, Math.max(0, Math.round(parsed.volume))),
                isMuted: Boolean(parsed.isMuted),
              });
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
          this.processQueue();
        }
      });

      this.proc.on('exit', () => {
        this.cleanup();
      });

      this.proc.on('error', () => {
        this.cleanup();
      });
    } catch {
      this.cleanup();
    }
  }

  private cleanup() {
    this.proc = null;
    this.isReady = false;
    this.starting = false;
    if (this.activeRequest) {
      this.activeRequest(null);
      this.activeRequest = null;
    }
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item?.resolve(null);
    }
  }

  private processQueue() {
    if (!this.isReady || !this.proc?.stdin || this.activeRequest || this.queue.length === 0) {
      return;
    }

    const next = this.queue.shift();
    if (!next) return;

    this.activeRequest = next.resolve;
    this.proc.stdin.write(`${next.cmd} ${next.val.toFixed(3)}\n`);
  }

  public exec(cmd: 'get' | 'set' | 'mute', val = 0.5): Promise<VolumeState | null> {
    if (!this.proc && !this.starting) {
      this.init();
    }

    return new Promise((resolve) => {
      // Coalesce duplicate set commands in queue and discard stale gets when setting
      if (cmd === 'set') {
        this.queue = this.queue.filter((q) => {
          if (q.cmd === 'set' || q.cmd === 'get') {
            q.resolve(null);
            return false;
          }
          return true;
        });
      }

      this.queue.push({ cmd, val, resolve });
      this.processQueue();
    });
  }

  public shutdown() {
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {
        // ignore
      }
      this.cleanup();
    }
  }
}

const winWorker = new WindowsAudioWorker();
if (process.platform === 'win32') {
  winWorker.init();
}

export const getVolumeState = async (): Promise<VolumeState> => {
  const now = Date.now();
  // Don't poll hardware if user recently set volume (within 2.5s) or polled within 1500ms
  if ((now - lastSetTime < 2500 || now - lastPolled < 1500) && !isFetching) {
    return cachedVolume;
  }
  if (isFetching) {
    return cachedVolume;
  }

  isFetching = true;
  try {
    if (process.platform === 'win32') {
      const res = await winWorker.exec('get');
      if (res && Date.now() - lastSetTime >= 2000) {
        cachedVolume = res;
        lastPolled = Date.now();
        return cachedVolume;
      }
    } else if (process.platform === 'darwin') {
      try {
        const { stdout } = await execFileAsync('osascript', [
          '-e',
          'set o to get volume settings',
          '-e',
          'return (output volume of o as string) & "," & (output muted of o as string)',
        ]);
        const parts = stdout.trim().split(',');
        if (parts.length === 2 && Date.now() - lastSetTime >= 2000) {
          cachedVolume = {
            volume: Number(parts[0]) || 0,
            isMuted: parts[1].trim() === 'true',
          };
          lastPolled = Date.now();
          return cachedVolume;
        }
      } catch {
        // ignore
      }
    } else {
      // Linux pamixer
      try {
        const [{ stdout: volOut }, { stdout: muteOut }] = await Promise.all([
          execFileAsync('pamixer', ['--get-volume']),
          execFileAsync('pamixer', ['--get-mute']),
        ]);
        if (Date.now() - lastSetTime >= 2000) {
          cachedVolume = {
            volume: Number(volOut.trim()) || 0,
            isMuted: muteOut.trim() === 'true',
          };
          lastPolled = Date.now();
          return cachedVolume;
        }
      } catch {
        // ignore
      }
    }
  } finally {
    isFetching = false;
  }

  return cachedVolume;
};

export const setMasterVolume = async (volume: number): Promise<VolumeState> => {
  const clamped = Math.min(100, Math.max(0, Math.round(volume)));
  cachedVolume = { ...cachedVolume, volume: clamped, isMuted: false };
  lastPolled = Date.now();
  lastSetTime = Date.now();
  const currentSeq = ++setSeq;

  if (process.platform === 'win32') {
    void winWorker.exec('set', clamped / 100).then((res) => {
      if (res && currentSeq === setSeq) {
        cachedVolume = res;
      }
    });
    return cachedVolume;
  } else if (process.platform === 'darwin') {
    try {
      await execFileAsync('osascript', [
        '-e',
        `set volume output volume ${clamped}`,
      ]);
    } catch {
      // ignore
    }
  } else {
    try {
      await execFileAsync('pamixer', ['--set-volume', String(clamped)]);
    } catch {
      // ignore
    }
  }

  return cachedVolume;
};

export const toggleMasterMute = async (): Promise<VolumeState> => {
  cachedVolume = { ...cachedVolume, isMuted: !cachedVolume.isMuted };
  lastPolled = Date.now();
  lastSetTime = Date.now();
  const currentSeq = ++setSeq;

  if (process.platform === 'win32') {
    void winWorker.exec('mute').then((res) => {
      if (res && currentSeq === setSeq) {
        cachedVolume = res;
      }
    });
    return cachedVolume;
  } else if (process.platform === 'darwin') {
    try {
      await execFileAsync('osascript', [
        '-e',
        'set volume output muted not (output muted of (get volume settings))',
      ]);
    } catch {
      // ignore
    }
  } else {
    try {
      await execFileAsync('pamixer', ['-t']);
    } catch {
      // ignore
    }
  }

  return cachedVolume;
};
