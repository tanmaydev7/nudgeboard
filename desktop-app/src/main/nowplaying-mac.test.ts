import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLivePlayback,
  toMacNowPlaying,
  withLivePlayback,
} from './nowplaying-mac.ts';

describe('toMacNowPlaying', () => {
  it('keeps snapshot elapsed and MediaRemote timestamp so widgets can tick while playing', () => {
    const snapshotAt = 1_786_988_530_812;
    const nowMs = snapshotAt + 5_000;

    const result = toMacNowPlaying(
      {
        title: 'Maharani',
        artist: 'Karun',
        album: 'Qabool Hai (Deluxe)',
        appName: 'Spotify',
        bundleId: 'com.spotify.client',
        playbackRate: 1,
        duration: 389.576,
        elapsed: 12.899,
        timestampMs: snapshotAt,
      },
      nowMs,
    );

    assert.ok(result);
    assert.equal(result.positionSec, 12.899);
    assert.equal(result.durationSec, 389.576);
    assert.equal(result.updatedAt, snapshotAt);
    assert.equal(result.isPlaying, true);
  });

  it('does not treat a paused snapshot as playing', () => {
    const result = toMacNowPlaying(
      {
        title: 'Maharani',
        artist: 'Karun',
        appName: 'Spotify',
        bundleId: 'com.spotify.client',
        playbackRate: 0,
        duration: 389.576,
        elapsed: 11.946,
        timestampMs: 1_786_988_530_812,
      },
      1_786_988_535_812,
    );

    assert.ok(result);
    assert.equal(result.isPlaying, false);
    assert.equal(result.positionSec, 11.946);
  });

  it('replaces a stale MediaRemote snapshot with live Spotify/Music position', () => {
    const snapshotAt = 1_786_988_530_812;
    const nowMs = snapshotAt + 35_000;
    const snapshot = toMacNowPlaying(
      {
        title: 'Maharani',
        artist: 'Karun',
        appName: 'Spotify',
        bundleId: 'com.spotify.client',
        playbackRate: 1,
        duration: 389.576,
        elapsed: 15.827,
        timestampMs: snapshotAt,
      },
      nowMs,
    );

    assert.ok(snapshot);
    const result = withLivePlayback(
      snapshot,
      {
        positionSec: 158.715,
        durationSec: 389.576,
        isPlaying: true,
      },
      nowMs,
    );

    assert.equal(result.positionSec, 158.715);
    assert.equal(result.durationSec, 389.576);
    assert.equal(result.isPlaying, true);
    assert.equal(result.updatedAt, nowMs);
  });

  it('parses live Spotify/Music position from AppleScript output', () => {
    const result = parseLivePlayback('playing:::158.715:::389.576');
    assert.deepEqual(result, {
      positionSec: 158.715,
      durationSec: 389.576,
      isPlaying: true,
    });
  });
});
