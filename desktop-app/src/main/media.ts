import { execFile } from 'child_process';
import { unlink, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import type { MediaState } from '../shared/ipc-types';
import { executeUtility } from './executor';
import {
  clearMacNowPlayingArt,
  getMacNowPlaying,
  sendMacNowPlayingCommand,
  type MacNowPlaying,
} from './nowplaying-mac';

const execFileAsync = promisify(execFile);

let cachedMediaState: MediaState | null = null;
let lastPolledAt = 0;
let isFetching = false;
let lastActiveSessionId: string | null = null;
let artworkCache: { key: string; dataUrl: string } | null = null;

const ARTWORK_PX = 256;
const ARTWORK_MAX_BYTES = 45_000;

const uniqueTemp = (suffix: string): string =>
  join(
    tmpdir(),
    `nudgeboard-art-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${suffix}`,
  );

const jpegDataUrlFromFile = async (inputPath: string): Promise<string | undefined> => {
  const out = uniqueTemp('.jpg');
  try {
    await execFileAsync(
      'sips',
      [
        '-z',
        String(ARTWORK_PX),
        String(ARTWORK_PX),
        '-s',
        'format',
        'jpeg',
        '-s',
        'formatOptions',
        '70',
        inputPath,
        '--out',
        out,
      ],
      { timeout: 5000 },
    );
    const buf = await readFile(out);
    if (buf.length === 0 || buf.length > ARTWORK_MAX_BYTES) {
      return undefined;
    }
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return undefined;
  } finally {
    try {
      await unlink(out);
    } catch {
      // ignore
    }
  }
};

const artworkFromUrl = async (raw: string): Promise<string | undefined> => {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'missing value') {
    return undefined;
  }
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  const spotifyImage = /^spotify:image:(.+)$/i.exec(trimmed);
  const url = spotifyImage
    ? `https://i.scdn.co/image/${spotifyImage[1]}`
    : trimmed;
  if (!/^https?:\/\//i.test(url)) {
    return undefined;
  }
  if (artworkCache?.key === url) {
    return artworkCache.dataUrl;
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      return undefined;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      return undefined;
    }
    const tmp = uniqueTemp('.img');
    await writeFile(tmp, buf);
    const dataUrl = await jpegDataUrlFromFile(tmp);
    try {
      await unlink(tmp);
    } catch {
      // ignore
    }
    if (dataUrl) {
      artworkCache = { key: url, dataUrl };
    }
    return dataUrl;
  } catch {
    return undefined;
  }
};

const resolveMacArtwork = async (
  np: MacNowPlaying,
): Promise<string | undefined> => {
  const key = `${np.sessionId}|${np.title}|${np.artist}|${np.artworkPath || ''}|${np.artworkUrl || ''}`;
  if (artworkCache?.key === key) {
    return artworkCache.dataUrl;
  }
  if (np.artworkPath) {
    const fromFile = await jpegDataUrlFromFile(np.artworkPath);
    await clearMacNowPlayingArt();
    if (fromFile) {
      artworkCache = { key, dataUrl: fromFile };
      return fromFile;
    }
  }
  if (np.artworkUrl) {
    const fromUrl = await artworkFromUrl(np.artworkUrl);
    if (fromUrl) {
      artworkCache = { key, dataUrl: fromUrl };
      return fromUrl;
    }
  }
  return undefined;
};

const buildWindowsMediaScript = (preferredAppId: string | null): string => `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
Function AwaitOp($WinRtTask, $ResultType) {
    if (-not $WinRtTask) { return $null }
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    if ($netTask.Wait(2000)) {
        return $netTask.Result
    }
    return $null
}

try {
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime] | Out-Null
    $mgr = AwaitOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    if (-not $mgr) { Write-Output "null"; exit }

    $sessions = $mgr.GetSessions()
    if (-not $sessions -or $sessions.Count -eq 0) { Write-Output "null"; exit }

    $validSessions = @()
    foreach ($s in $sessions) {
        $media = AwaitOp ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        if ($media -and ($media.Title -or $media.Artist)) {
            $info = $s.GetPlaybackInfo()
            $tl = $s.GetTimelineProperties()
            $validSessions += [PSCustomObject]@{
                Session = $s
                Media = $media
                Info = $info
                TL = $tl
                AppId = $s.SourceAppUserModelId
                IsPlaying = ($info -and $info.PlaybackStatus -eq 4)
                LastUpdated = if ($tl -and $tl.LastUpdatedTime) { $tl.LastUpdatedTime.ToUnixTimeMilliseconds() } else { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
            }
        }
    }

    if ($validSessions.Count -eq 0) {
        Write-Output "null"
        exit
    }

    # 1. Look for actively playing session
    $chosen = $null
    foreach ($vs in $validSessions) {
        if ($vs.IsPlaying) {
            $chosen = $vs
            break
        }
    }

    # 2. If no session is actively playing, maintain the last active/paused session
    $preferred = '${preferredAppId ? preferredAppId.replace(/'/g, "''") : ''}'
    if (-not $chosen -and $preferred) {
        foreach ($vs in $validSessions) {
            if ($vs.AppId -eq $preferred) {
                $chosen = $vs
                break
            }
        }
    }

    # 3. Check Windows OS current session
    if (-not $chosen) {
        $curr = $mgr.GetCurrentSession()
        if ($curr) {
            foreach ($vs in $validSessions) {
                if ($vs.AppId -eq $curr.SourceAppUserModelId) {
                    $chosen = $vs
                    break
                }
            }
        }
    }

    # 4. Fallback: session with most recent update timestamp
    if (-not $chosen) {
        $sorted = $validSessions | Sort-Object -Property LastUpdated -Descending
        $chosen = $sorted[0]
    }

    $session = $chosen.Session
    $media = $chosen.Media
    $info = $chosen.Info
    $tl = $chosen.TL
    $appId = $chosen.AppId

    $thumbBase64 = $null
    try {
        if ($media.Thumbnail) {
            $stream = AwaitOp ($media.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
            if ($stream -and $stream.Size -gt 0 -and $stream.Size -lt 2000000) {
                $bytes = New-Object byte[] $stream.Size
                $reader = New-Object Windows.Storage.Streams.DataReader $stream
                AwaitOp ($reader.LoadAsync($stream.Size)) ([uint32]) | Out-Null
                $reader.ReadBytes($bytes)
                $reader.Dispose()
                $contentType = $stream.ContentType
                if (-not $contentType) { $contentType = "image/jpeg" }
                $thumbBase64 = "data:" + $contentType + ";base64," + [Convert]::ToBase64String($bytes)
            }
        }
    } catch {}

    $appName = "Now Playing"
    if ($appId) {
        $left = ($appId.Split('!'))[0]
        if ($left -match '\\|/') {
            $left = [System.IO.Path]::GetFileNameWithoutExtension($left)
        }
        $left = $left -replace '_[a-z0-9]{8,}$', ''
        $leaf = ($left.Split('.') | Select-Object -Last 1)
        if ($leaf) { $appName = $leaf }
        elseif ($left) { $appName = $left.Replace('_', ' ') }
    }

    $title = $media.Title
    $artist = $media.Artist
    $album = $media.AlbumTitle

    $pos = 0
    $dur = 0
    $upd = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    try {
        if ($tl) {
            if ($tl.Position) { $pos = [math]::Round($tl.Position.TotalSeconds, 2) }
            if ($tl.EndTime) { $dur = [math]::Round($tl.EndTime.TotalSeconds, 2) }
            if ($tl.LastUpdatedTime) {
                $ms = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
                if ($ms -gt 0) { $upd = $ms }
            }
        }
    } catch {}

    $isPlaying = $chosen.IsPlaying

    [PSCustomObject]@{
        sessionId = $appId
        title = if ($title) { $title } else { "Unknown Track" }
        artist = if ($artist) { $artist } else { "Unknown Artist" }
        album = if ($album) { $album } else { "" }
        sourceApp = $appName
        isPlaying = $isPlaying
        canPlay = if ($info -and $info.Controls) { [bool]$info.Controls.IsPlayEnabled } else { $true }
        canPause = if ($info -and $info.Controls) { [bool]$info.Controls.IsPauseEnabled } else { $true }
        canNext = if ($info -and $info.Controls) { [bool]$info.Controls.IsNextEnabled } else { $true }
        canPrev = if ($info -and $info.Controls) { [bool]$info.Controls.IsPreviousEnabled } else { $true }
        artwork = $thumbBase64
        positionSec = $pos
        durationSec = $dur
        updatedAt = $upd
    } | ConvertTo-Json -Compress
} catch {
    Write-Output "null"
}
`;

const buildWindowsActionScript = (action: string, targetSessionId: string | null): string => `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
Function AwaitOp($WinRtTask, $ResultType) {
    if (-not $WinRtTask) { return $null }
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    if ($netTask.Wait(2000)) {
        return $netTask.Result
    }
    return $null
}

try {
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime] | Out-Null
    $mgr = AwaitOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    if ($mgr) {
        $sessions = $mgr.GetSessions()
        $target = $null
        $targetId = '${targetSessionId ? targetSessionId.replace(/'/g, "''") : ''}'
        if ($targetId) {
            foreach ($s in $sessions) {
                if ($s.SourceAppUserModelId -eq $targetId) {
                    $target = $s
                    break
                }
            }
        }
        if (-not $target) {
            foreach ($s in $sessions) {
                $info = $s.GetPlaybackInfo()
                if ($info -and $info.PlaybackStatus -eq 4) {
                    $target = $s
                    break
                }
            }
        }
        if (-not $target) {
            $target = $mgr.GetCurrentSession()
        }
        if (-not $target -and $sessions.Count -gt 0) {
            $target = $sessions[0]
        }

        if ($target) {
            switch ('${action}') {
                'play_pause' {
                    $info = $target.GetPlaybackInfo()
                    if ($info -and $info.PlaybackStatus -eq 4) {
                        AwaitOp ($target.TryPauseAsync()) ([bool]) | Out-Null
                    } else {
                        AwaitOp ($target.TryPlayAsync()) ([bool]) | Out-Null
                    }
                }
                'next' { AwaitOp ($target.TrySkipNextAsync()) ([bool]) | Out-Null }
                'prev' { AwaitOp ($target.TrySkipPreviousAsync()) ([bool]) | Out-Null }
                'stop' { AwaitOp ($target.TryStopAsync()) ([bool]) | Out-Null }
            }
            Write-Output "ok"
            exit
        }
    }
} catch {}
Write-Output "fallback"
`;

export const getMediaState = async (): Promise<MediaState | null> => {
  const now = Date.now();
  if (cachedMediaState && now - lastPolledAt < 1000 && !isFetching) {
    return cachedMediaState;
  }
  if (isFetching) {
    return cachedMediaState;
  }

  isFetching = true;
  try {
    if (process.platform === 'win32') {
      const script = buildWindowsMediaScript(lastActiveSessionId);
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden',
          '-EncodedCommand',
          encoded,
        ],
        { timeout: 4000, windowsHide: true },
      );
      const raw = stdout.trim();
      if (raw && raw !== 'null') {
        try {
          const parsed = JSON.parse(raw) as Partial<MediaState>;
          if (parsed.title || parsed.artist) {
            const returnedSessionId =
              typeof parsed.sessionId === 'string' && parsed.sessionId.length > 0
                ? parsed.sessionId
                : undefined;

            if (returnedSessionId) {
              lastActiveSessionId = returnedSessionId;
            }

            cachedMediaState = {
              sessionId: returnedSessionId,
              title: parsed.title || 'Unknown Track',
              artist: parsed.artist || '',
              album: parsed.album || '',
              sourceApp: parsed.sourceApp || 'Media Player',
              isPlaying: Boolean(parsed.isPlaying),
              canPlay: parsed.canPlay ?? true,
              canPause: parsed.canPause ?? true,
              canNext: parsed.canNext ?? true,
              canPrev: parsed.canPrev ?? true,
              artwork: parsed.artwork,
              positionSec:
                typeof parsed.positionSec === 'number' ? parsed.positionSec : 0,
              durationSec:
                typeof parsed.durationSec === 'number' ? parsed.durationSec : 0,
              updatedAt:
                typeof parsed.updatedAt === 'number' && parsed.updatedAt > 0
                  ? parsed.updatedAt
                  : Date.now(),
            };
            lastPolledAt = Date.now();
            return cachedMediaState;
          }
        } catch {
          // ignore json parse error
        }
      }
      cachedMediaState = null;
      lastPolledAt = Date.now();
      return null;
    }

    if (process.platform === 'darwin') {
      const nowPlaying = await getMacNowPlaying();
      if (nowPlaying) {
        const artwork = await resolveMacArtwork(nowPlaying);
        cachedMediaState = {
          sessionId: nowPlaying.sessionId,
          title: nowPlaying.title,
          artist: nowPlaying.artist,
          album: nowPlaying.album,
          sourceApp: nowPlaying.sourceApp,
          isPlaying: nowPlaying.isPlaying,
          canPlay: true,
          canPause: true,
          canNext: true,
          canPrev: true,
          artwork,
          positionSec: nowPlaying.positionSec,
          durationSec: nowPlaying.durationSec,
          updatedAt: Date.now(),
        };
        lastActiveSessionId = nowPlaying.sessionId;
        lastPolledAt = Date.now();
        return cachedMediaState;
      }
      cachedMediaState = null;
      lastPolledAt = Date.now();
      return null;
    }

    // Linux: playerctl
    try {
      const { stdout } = await execFileAsync('playerctl', [
        'metadata',
        '--format',
        '{{playerName}}|||{{title}}|||{{artist}}|||{{album}}|||{{status}}|||{{mpris:artUrl}}|||{{position}}|||{{mpris:length}}',
      ]);
      const res = stdout.trim();
      if (res && res.includes('|||')) {
        const [
          sourceApp,
          title,
          artist,
          album,
          status,
          artwork,
          posMicro,
          lenMicro,
        ] = res.split('|||');
        const pos = posMicro ? parseInt(posMicro, 10) / 1000000 : 0;
        const dur = lenMicro ? parseInt(lenMicro, 10) / 1000000 : 0;
        cachedMediaState = {
          sessionId: sourceApp,
          title: title || 'Unknown Track',
          artist: artist || '',
          album: album || '',
          sourceApp: sourceApp || 'Media Player',
          isPlaying: status?.toLowerCase() === 'playing',
          canPlay: true,
          canPause: true,
          canNext: true,
          canPrev: true,
          artwork: artwork || undefined,
          positionSec: isNaN(pos) ? 0 : pos,
          durationSec: isNaN(dur) ? 0 : dur,
          updatedAt: Date.now(),
        };
        lastActiveSessionId = sourceApp;
        lastPolledAt = Date.now();
        return cachedMediaState;
      }
    } catch {
      // ignore
    }

    cachedMediaState = null;
    lastPolledAt = Date.now();
    return null;
  } catch {
    return cachedMediaState;
  } finally {
    isFetching = false;
  }
};

export const executeMediaAction = async (
  action: 'play_pause' | 'next' | 'prev' | 'stop',
  targetSessionId?: string | null,
): Promise<void> => {
  const effectiveSessionId = targetSessionId || lastActiveSessionId;

  if (process.platform === 'darwin') {
    const command =
      action === 'play_pause'
        ? 'playpause'
        : action === 'next'
          ? 'next'
          : action === 'prev'
            ? 'previous'
            : 'stop';
    await sendMacNowPlayingCommand(command);
    lastPolledAt = 0;
    return;
  }

  if (process.platform === 'win32') {
    try {
      const script = buildWindowsActionScript(action, effectiveSessionId);
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden',
          '-EncodedCommand',
          encoded,
        ],
        { timeout: 3000, windowsHide: true },
      );
    } catch {
      // ignore
    }
    lastPolledAt = 0;
    return;
  }

  // Fallback to global utility actions
  switch (action) {
    case 'play_pause':
      await executeUtility('media_play_pause');
      break;
    case 'next':
      await executeUtility('media_next');
      break;
    case 'prev':
      await executeUtility('media_prev');
      break;
    case 'stop':
      await executeUtility('media_stop');
      break;
  }
  lastPolledAt = 0;
};
