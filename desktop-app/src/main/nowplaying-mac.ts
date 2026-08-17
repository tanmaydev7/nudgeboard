import { execFile } from 'child_process';
import { unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type MacNowPlaying = {
  title: string;
  artist: string;
  album: string;
  sourceApp: string;
  sessionId: string;
  isPlaying: boolean;
  positionSec: number;
  durationSec: number;
  artworkPath?: string;
  artworkUrl?: string;
};

export type MacNowPlayingCommand = 'playpause' | 'next' | 'previous' | 'stop';

const ART_PATH = join(tmpdir(), 'nudgeboard-nowplaying-art');

const COMMAND_IDS: Record<MacNowPlayingCommand, number> = {
  playpause: 2,
  next: 4,
  previous: 5,
  stop: 3,
};

/**
 * Control Center Now Playing via MediaRemote.
 * Electron cannot read this on macOS 15.4+/26; osascript can.
 */
const JXA = `
function str(v) {
  if (v === undefined || v === null) return '';
  try {
    var u = ObjC.unwrap(v);
    if (u === undefined || u === null) return '';
    return String(u);
  } catch (e) {
    return '';
  }
}

function num(v) {
  var n = Number(str(v));
  return isFinite(n) ? n : 0;
}

function run() {
  try {
    var MediaRemote = $.NSBundle.bundleWithPath('/System/Library/PrivateFrameworks/MediaRemote.framework/');
    MediaRemote.load;
    var MRNowPlayingRequest = $.NSClassFromString('MRNowPlayingRequest');
    if (!MRNowPlayingRequest) return JSON.stringify({ player: 'none' });

    var playerPath = MRNowPlayingRequest.localNowPlayingPlayerPath;
    var item = MRNowPlayingRequest.localNowPlayingItem;
    if (!playerPath || !item) return JSON.stringify({ player: 'none' });

    var client = playerPath.client;
    var info = item.nowPlayingInfo;
    if (!info) return JSON.stringify({ player: 'none' });

    var artPath = '';
    try {
      var artData = info.valueForKey('kMRMediaRemoteNowPlayingInfoArtworkData');
      if (artData && artData.length && artData.length > 0) {
        artData.writeToFileAtomically(${JSON.stringify(ART_PATH)}, true);
        artPath = ${JSON.stringify(ART_PATH)};
      }
    } catch (e) {}

    var rate = num(info.valueForKey('kMRMediaRemoteNowPlayingInfoPlaybackRate'));
    if (!rate) {
      try { rate = num(item.metadata.playbackRate); } catch (e) {}
    }

    return JSON.stringify({
      title: str(info.valueForKey('kMRMediaRemoteNowPlayingInfoTitle')),
      artist: str(info.valueForKey('kMRMediaRemoteNowPlayingInfoArtist')),
      album: str(info.valueForKey('kMRMediaRemoteNowPlayingInfoAlbum')),
      appName: str(client.displayName),
      bundleId: str(client.bundleIdentifier),
      playbackRate: rate,
      duration: num(info.valueForKey('kMRMediaRemoteNowPlayingInfoDuration')),
      elapsed: num(info.valueForKey('kMRMediaRemoteNowPlayingInfoElapsedTime')),
      artworkUrl: str(info.valueForKey('kMRMediaRemoteNowPlayingInfoArtworkURL')),
      artworkPath: artPath
    });
  } catch (e) {
    return JSON.stringify({ player: 'none' });
  }
}
`;

/**
 * osascript can read Now Playing on macOS 15.4+/26, but SendCommand is a no-op.
 * /usr/bin/ruby is Apple-signed and still allowed to talk to mediaremoted.
 */
const RUBY_SEND = `
require "fiddle"
require "fiddle/import"
module MR
  extend Fiddle::Importer
  dlload "/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote"
  extern "int MRMediaRemoteSendCommand(unsigned int, void *)"
end
code = Integer(ARGV[0])
ok = MR.MRMediaRemoteSendCommand(code, nil)
sleep 0.4
exit(ok == 0 ? 1 : 0)
`;

type RawNowPlaying = {
  player?: string;
  title?: string;
  artist?: string;
  album?: string;
  appName?: string;
  bundleId?: string;
  playbackRate?: number;
  duration?: number;
  elapsed?: number;
  artworkUrl?: string;
  artworkPath?: string;
};

const runJxa = async (): Promise<RawNowPlaying | null> => {
  try {
    const { stdout } = await execFileAsync(
      'osascript',
      ['-l', 'JavaScript', '-e', JXA],
      { timeout: 4000, maxBuffer: 2 * 1024 * 1024 },
    );
    const raw = stdout.trim();
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as RawNowPlaying;
  } catch {
    return null;
  }
};

export const getMacNowPlaying = async (): Promise<MacNowPlaying | null> => {
  const raw = await runJxa();
  if (!raw || raw.player === 'none') {
    return null;
  }
  const bundleId = raw.bundleId || '';
  const appName = raw.appName || '';
  if (!(raw.title || raw.artist || bundleId || appName)) {
    return null;
  }
  return {
    title: raw.title || 'Unknown Track',
    artist: raw.artist || '',
    album: raw.album || '',
    sourceApp: appName || 'Now Playing',
    sessionId: bundleId || appName || 'nowplaying',
    isPlaying: (raw.playbackRate ?? 0) > 0.01,
    positionSec: raw.elapsed ?? 0,
    durationSec: raw.duration ?? 0,
    artworkPath: raw.artworkPath || undefined,
    artworkUrl: raw.artworkUrl || undefined,
  };
};

export const sendMacNowPlayingCommand = async (
  action: MacNowPlayingCommand,
): Promise<boolean> => {
  try {
    await execFileAsync(
      '/usr/bin/ruby',
      ['-e', RUBY_SEND, String(COMMAND_IDS[action])],
      { timeout: 3000 },
    );
    return true;
  } catch {
    return false;
  }
};

export const clearMacNowPlayingArt = async (): Promise<void> => {
  try {
    await unlink(ART_PATH);
  } catch {
    // ignore
  }
};
