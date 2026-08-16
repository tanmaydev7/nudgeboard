import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ImageStyle } from 'react-native';
import type { DeckTileView, WidgetActionType } from '../../protocol';
import { useAppStore } from '../../store';
import { type Palette, usePalette, useThemedStyles } from '../../theme';
import {
  MusicNoteIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from './WidgetIcons';

type Props = {
  tile: DeckTileView;
  width: number;
  height: number;
  colSpan?: number;
  rowSpan?: number;
  onAction?: (action: WidgetActionType) => void;
};

function formatTime(sec: number): string {
  if (!sec || isNaN(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function MediaWidget({
  tile,
  width,
  height,
  colSpan: propColSpan,
  rowSpan: propRowSpan,
  onAction,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const palette = usePalette();
  const mediaState = useAppStore((s) => s.mediaState);
  const [imageFailed, setImageFailed] = useState(false);

  const cols = propColSpan ?? tile.colSpan ?? 2;
  const rows = propRowSpan ?? tile.rowSpan ?? 1;

  const isSmall = cols === 1 && rows === 1;
  const isVerticalSlim = cols === 1 && rows >= 2;
  const isWideStrip = rows === 1 && cols >= 2;
  const isPortraitTall =
    (rows >= 3 && cols >= 2) || (height >= 220 && height >= width * 0.95);
  const isLandscapeHero = cols >= 3 && rows >= 2 && width >= height * 1.15;
  const isSquareLarge =
    (cols === 2 && rows >= 2 && !isPortraitTall) ||
    (width >= 160 && height >= 160 && !isPortraitTall && !isLandscapeHero);

  const isPlaying = !!mediaState?.isPlaying;
  const trackTitle = mediaState?.title || 'No Media Playing';
  const trackArtist = mediaState?.artist || 'Spotify / Apple / YouTube';
  const sourceApp = mediaState?.sourceApp || 'SPOTIFY';
  const artwork = mediaState?.artwork;
  const showArtwork = !!artwork && !imageFailed;

  // Real-time ticking progress tracking with latency compensation
  const [currPos, setCurrPos] = useState(mediaState?.positionSec || 0);

  useEffect(() => {
    const rawBasePos = mediaState?.positionSec || 0;
    const updatedAt = mediaState?.updatedAt || Date.now();
    const duration = mediaState?.durationSec || 0;

    const initialElapsed = isPlaying ? Math.max(0, (Date.now() - updatedAt) / 1000) : 0;
    const initialPos = duration > 0 ? Math.min(duration, rawBasePos + initialElapsed) : rawBasePos + initialElapsed;

    setCurrPos(initialPos);

    if (!isPlaying) {
      return;
    }

    const startLocalTime = Date.now();
    const startCalculatedPos = initialPos;

    const interval = setInterval(() => {
      const elapsedSinceStart = (Date.now() - startLocalTime) / 1000;
      const next = duration > 0 ? Math.min(duration, startCalculatedPos + elapsedSinceStart) : startCalculatedPos + elapsedSinceStart;
      setCurrPos(next);
    }, 250);

    return () => clearInterval(interval);
  }, [
    mediaState?.title,
    mediaState?.artist,
    mediaState?.isPlaying,
    mediaState?.positionSec,
    mediaState?.durationSec,
    mediaState?.updatedAt,
    isPlaying,
  ]);

  const duration = mediaState?.durationSec || 0;
  const progressPercent =
    duration > 0
      ? Math.min(100, Math.max(0, (currPos / duration) * 100))
      : isPlaying
        ? 50
        : 0;

  const formattedPos = formatTime(currPos);
  const formattedDur = duration > 0 ? formatTime(duration) : '--:--';

  // 1. SMALL (1x1)
  if (isSmall) {
    return (
      <View style={[styles.card, styles.cardSmall, { width, height }]}>
        <View style={styles.smallArtWrap}>
          {showArtwork ? (
            <Image
              source={{ uri: artwork }}
              style={styles.smallArt as ImageStyle}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <MusicNoteIcon size={24} color={palette.purple} />
          )}
          <Pressable
            hitSlop={8}
            onPress={() => onAction?.('media_play_pause')}
            style={({ pressed }) => [
              styles.smallPlayPill,
              pressed ? styles.btnPressed : null,
            ]}
          >
            {isPlaying ? (
              <PauseIcon size={12} color={palette.onPurple} />
            ) : (
              <PlayIcon size={12} color={palette.onPurple} />
            )}
          </Pressable>
        </View>
        <Text style={styles.smallTitle} numberOfLines={1}>
          {trackTitle}
        </Text>
      </View>
    );
  }

  // 2. VERTICAL SLIM (1x2, 1x3, 1x4)
  if (isVerticalSlim) {
    const verticalArtSize = Math.max(48, Math.min(width - 20, 84));
    return (
      <View style={[styles.card, styles.cardVertical, { width, height }]}>
        <View style={[styles.artworkContainer, { width: verticalArtSize, height: verticalArtSize }]}>
          {showArtwork ? (
            <Image
              source={{ uri: artwork }}
              style={styles.artworkImage as ImageStyle}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <View style={styles.discPlaceholder}>
              <MusicNoteIcon size={Math.round(verticalArtSize * 0.45)} color={palette.purple} />
            </View>
          )}
        </View>

        <View style={styles.verticalMeta}>
          <Text style={styles.verticalTitle} numberOfLines={1}>
            {trackTitle}
          </Text>
          <Text style={styles.verticalArtist} numberOfLines={1}>
            {trackArtist}
          </Text>
        </View>

        <View style={styles.verticalProgressWrap}>
          <View style={styles.progressTrackSlim}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>

        <View style={styles.verticalControls}>
          <Pressable
            hitSlop={8}
            onPress={() => onAction?.('media_prev')}
            style={({ pressed }) => [
              styles.btnSecondarySmall,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <SkipBackIcon size={12} color={palette.text} />
          </Pressable>

          <Pressable
            hitSlop={8}
            onPress={() => onAction?.('media_play_pause')}
            style={({ pressed }) => [
              styles.btnPrimaryMed,
              pressed ? styles.btnPrimaryPressed : null,
            ]}
          >
            {isPlaying ? (
              <PauseIcon size={16} color={palette.onPurple} />
            ) : (
              <PlayIcon size={16} color={palette.onPurple} />
            )}
          </Pressable>

          <Pressable
            hitSlop={8}
            onPress={() => onAction?.('media_next')}
            style={({ pressed }) => [
              styles.btnSecondarySmall,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <SkipForwardIcon size={12} color={palette.text} />
          </Pressable>
        </View>
      </View>
    );
  }

  // 3. TALL PORTRAIT HERO (2x3, 2x4, 2x5, 3x3, 3x4, 3x5) — Solves portrait phone view!
  if (isPortraitTall) {
    const maxArtW = width - 28;
    const maxArtH = Math.max(90, height * 0.42);
    const artSize = Math.max(80, Math.min(maxArtW, maxArtH, 210));

    return (
      <View style={[styles.card, styles.cardTallPortrait, { width, height }]}>
        {/* Top Header: Source Tag & Now Playing Pill */}
        <View style={styles.tallHeaderRow}>
          <View style={styles.sourceTag}>
            <Text style={styles.sourceTagText}>{sourceApp.toUpperCase()}</Text>
          </View>
          <View style={[styles.statusTag, isPlaying ? styles.statusTagPlaying : null]}>
            <View style={[styles.statusDot, isPlaying ? styles.statusDotPlaying : null]} />
            <Text style={[styles.statusTagText, isPlaying ? styles.statusTagTextPlaying : null]}>
              {isPlaying ? 'NOW PLAYING' : 'PAUSED'}
            </Text>
          </View>
        </View>

        {/* Center: Large Prominent Artwork */}
        <View style={[styles.artworkContainerTall, { width: artSize, height: artSize }]}>
          {showArtwork ? (
            <Image
              source={{ uri: artwork }}
              style={styles.artworkImage as ImageStyle}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <View style={styles.discPlaceholderTall}>
              <View style={styles.discRingOuter} />
              <View style={styles.discRingInner} />
              <MusicNoteIcon size={Math.round(artSize * 0.38)} color={palette.purple} />
            </View>
          )}
        </View>

        {/* Track Title & Artist */}
        <View style={styles.tallMetaWrap}>
          <Text style={styles.tallTitle} numberOfLines={1}>
            {trackTitle}
          </Text>
          <Text style={styles.tallArtist} numberOfLines={1}>
            {trackArtist}
          </Text>
        </View>

        {/* Progress Bar with Full Width Flex Track (Fixed Overflow) */}
        <View style={styles.progressRow}>
          <Text style={styles.timeLabel}>{formattedPos}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.timeLabel}>{formattedDur}</Text>
        </View>

        {/* Tactile Playback Controls */}
        <View style={styles.tallControls}>
          <Pressable
            hitSlop={12}
            onPress={() => onAction?.('media_prev')}
            style={({ pressed }) => [
              styles.btnTallSecondary,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <SkipBackIcon size={18} color={palette.text} />
          </Pressable>

          <Pressable
            hitSlop={14}
            onPress={() => onAction?.('media_play_pause')}
            style={({ pressed }) => [
              styles.btnTallPrimary,
              pressed ? styles.btnPrimaryPressed : null,
            ]}
          >
            {isPlaying ? (
              <PauseIcon size={24} color={palette.onPurple} />
            ) : (
              <PlayIcon size={24} color={palette.onPurple} />
            )}
          </Pressable>

          <Pressable
            hitSlop={12}
            onPress={() => onAction?.('media_next')}
            style={({ pressed }) => [
              styles.btnTallSecondary,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <SkipForwardIcon size={18} color={palette.text} />
          </Pressable>
        </View>
      </View>
    );
  }

  // 4. LANDSCAPE HERO (4x2, 3x2, 5x2 in landscape)
  if (isLandscapeHero) {
    const heroArtSize = Math.max(68, Math.min(height - 24, 100));
    return (
      <View style={[styles.card, styles.cardHero, { width, height }]}>
        {/* Left: Large Artwork */}
        <View style={[styles.artworkContainerHero, { width: heroArtSize, height: heroArtSize }]}>
          {showArtwork ? (
            <Image
              source={{ uri: artwork }}
              style={styles.artworkImage as ImageStyle}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <View style={styles.discPlaceholder}>
              <MusicNoteIcon size={Math.round(heroArtSize * 0.42)} color={palette.purple} />
            </View>
          )}
        </View>

        {/* Center: Tags, Title, Artist, and Progress Bar */}
        <View style={styles.heroCenterCol}>
          <View style={styles.tagRow}>
            <View style={styles.sourceTag}>
              <Text style={styles.sourceTagText}>{sourceApp.toUpperCase()}</Text>
            </View>
            <View style={[styles.statusTag, isPlaying ? styles.statusTagPlaying : null]}>
              <View style={[styles.statusDot, isPlaying ? styles.statusDotPlaying : null]} />
              <Text style={[styles.statusTagText, isPlaying ? styles.statusTagTextPlaying : null]}>
                {isPlaying ? 'NOW PLAYING' : 'PAUSED'}
              </Text>
            </View>
          </View>

          <View style={styles.heroTitleWrap}>
            <Text style={styles.heroTitle} numberOfLines={1}>
              {trackTitle}
            </Text>
            <Text style={styles.heroArtist} numberOfLines={1}>
              {trackArtist}
            </Text>
          </View>

          {/* Progress Bar with Timestamps */}
          <View style={styles.progressRow}>
            <Text style={styles.timeLabel}>{formattedPos}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
            <Text style={styles.timeLabel}>{formattedDur}</Text>
          </View>
        </View>

        {/* Right: Big, Tactile Playback Controls */}
        <View style={styles.heroControlsWrap}>
          <Pressable
            hitSlop={10}
            onPress={() => onAction?.('media_prev')}
            style={({ pressed }) => [
              styles.btnHeroSecondary,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <SkipBackIcon size={18} color={palette.text} />
          </Pressable>

          <Pressable
            hitSlop={12}
            onPress={() => onAction?.('media_play_pause')}
            style={({ pressed }) => [
              styles.btnHeroPrimary,
              pressed ? styles.btnPrimaryPressed : null,
            ]}
          >
            {isPlaying ? (
              <PauseIcon size={24} color={palette.onPurple} />
            ) : (
              <PlayIcon size={24} color={palette.onPurple} />
            )}
          </Pressable>

          <Pressable
            hitSlop={10}
            onPress={() => onAction?.('media_next')}
            style={({ pressed }) => [
              styles.btnHeroSecondary,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <SkipForwardIcon size={18} color={palette.text} />
          </Pressable>
        </View>
      </View>
    );
  }

  // 5. SQUARE LARGE (2x2)
  if (isSquareLarge) {
    const largeArtSize = Math.max(50, Math.min(height * 0.36, 68));
    return (
      <View style={[styles.card, styles.cardLarge, { width, height }]}>
        <View style={styles.largeTopRow}>
          <View style={[styles.artworkContainer, { width: largeArtSize, height: largeArtSize }]}>
            {showArtwork ? (
              <Image
                source={{ uri: artwork }}
                style={styles.artworkImage as ImageStyle}
                resizeMode="cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <View style={styles.discPlaceholder}>
                <MusicNoteIcon size={Math.round(largeArtSize * 0.45)} color={palette.purple} />
              </View>
            )}
          </View>

          <View style={styles.largeMeta}>
            <View style={styles.sourceTagMini}>
              <Text style={styles.sourceTagMiniText}>{sourceApp.toUpperCase()}</Text>
            </View>
            <Text style={styles.largeTitle} numberOfLines={1}>
              {trackTitle}
            </Text>
            <Text style={styles.largeArtist} numberOfLines={1}>
              {trackArtist}
            </Text>
          </View>
        </View>

        {/* Dynamic Progress Bar (Fixed Flex 1 Track) */}
        <View style={styles.progressRow}>
          <Text style={styles.timeLabelSmall}>{formattedPos}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.timeLabelSmall}>{formattedDur}</Text>
        </View>

        {/* Prominent Playback Controls */}
        <View style={styles.largeControls}>
          <Pressable
            hitSlop={10}
            onPress={() => onAction?.('media_prev')}
            style={({ pressed }) => [
              styles.btnSecondaryMed,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <SkipBackIcon size={15} color={palette.text} />
          </Pressable>

          <Pressable
            hitSlop={10}
            onPress={() => onAction?.('media_play_pause')}
            style={({ pressed }) => [
              styles.btnPrimaryLarge,
              pressed ? styles.btnPrimaryPressed : null,
            ]}
          >
            {isPlaying ? (
              <PauseIcon size={20} color={palette.onPurple} />
            ) : (
              <PlayIcon size={20} color={palette.onPurple} />
            )}
          </Pressable>

          <Pressable
            hitSlop={10}
            onPress={() => onAction?.('media_next')}
            style={({ pressed }) => [
              styles.btnSecondaryMed,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <SkipForwardIcon size={15} color={palette.text} />
          </Pressable>
        </View>
      </View>
    );
  }

  // 6. WIDE STRIP (3x1, 4x1, 5x1)
  if (isWideStrip) {
    const wideArtSize = Math.max(42, Math.min(height - 16, 60));
    return (
      <View style={[styles.card, styles.cardWide, { width, height }]}>
        <View style={[styles.artworkContainer, { width: wideArtSize, height: wideArtSize }]}>
          {showArtwork ? (
            <Image
              source={{ uri: artwork }}
              style={styles.artworkImage as ImageStyle}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <View style={styles.discPlaceholder}>
              <MusicNoteIcon size={Math.round(wideArtSize * 0.45)} color={palette.purple} />
            </View>
          )}
        </View>

        <View style={styles.wideCenterCol}>
          <View style={styles.wideMeta}>
            <Text style={styles.wideTitle} numberOfLines={1}>
              {trackTitle}
            </Text>
            <Text style={styles.wideArtist} numberOfLines={1}>
              {trackArtist}
            </Text>
          </View>
          <View style={styles.progressTrackSlim}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>

        <View style={styles.wideControls}>
          <Pressable
            hitSlop={8}
            onPress={() => onAction?.('media_prev')}
            style={({ pressed }) => [
              styles.btnSecondarySmall,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <SkipBackIcon size={14} color={palette.text} />
          </Pressable>

          <Pressable
            hitSlop={8}
            onPress={() => onAction?.('media_play_pause')}
            style={({ pressed }) => [
              styles.btnPrimaryMed,
              pressed ? styles.btnPrimaryPressed : null,
            ]}
          >
            {isPlaying ? (
              <PauseIcon size={16} color={palette.onPurple} />
            ) : (
              <PlayIcon size={16} color={palette.onPurple} />
            )}
          </Pressable>

          <Pressable
            hitSlop={8}
            onPress={() => onAction?.('media_next')}
            style={({ pressed }) => [
              styles.btnSecondarySmall,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <SkipForwardIcon size={14} color={palette.text} />
          </Pressable>
        </View>
      </View>
    );
  }

  // 7. MEDIUM (2x1 Default)
  const medArtSize = Math.max(40, Math.min(height - 16, 54));
  return (
    <View style={[styles.card, styles.cardMed, { width, height }]}>
      <View style={[styles.artworkContainer, { width: medArtSize, height: medArtSize }]}>
        {showArtwork ? (
          <Image
            source={{ uri: artwork }}
            style={styles.artworkImage as ImageStyle}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={styles.discPlaceholder}>
            <MusicNoteIcon size={Math.round(medArtSize * 0.45)} color={palette.purple} />
          </View>
        )}
      </View>

      <View style={styles.medCenterCol}>
        <Text style={styles.title} numberOfLines={1}>
          {trackTitle}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {trackArtist}
        </Text>
        <View style={styles.progressTrackSlim}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
      </View>

      <View style={styles.medControls}>
        <Pressable
          hitSlop={8}
          onPress={() => onAction?.('media_prev')}
          style={({ pressed }) => [
            styles.btnSecondarySmall,
            pressed ? styles.btnPressed : null,
          ]}
        >
          <SkipBackIcon size={12} color={palette.text} />
        </Pressable>

        <Pressable
          hitSlop={8}
          onPress={() => onAction?.('media_play_pause')}
          style={({ pressed }) => [
            styles.btnPrimarySmall,
            pressed ? styles.btnPrimaryPressed : null,
          ]}
        >
          {isPlaying ? (
            <PauseIcon size={14} color={palette.onPurple} />
          ) : (
            <PlayIcon size={14} color={palette.onPurple} />
          )}
        </Pressable>

        <Pressable
          hitSlop={8}
          onPress={() => onAction?.('media_next')}
          style={({ pressed }) => [
            styles.btnSecondarySmall,
            pressed ? styles.btnPressed : null,
          ]}
        >
          <SkipForwardIcon size={12} color={palette.text} />
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      borderRadius: 18,
      backgroundColor: palette.slot,
      borderWidth: 1,
      borderColor: palette.line,
      padding: 10,
      overflow: 'hidden',
    },
    cardSmall: {
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 6,
      padding: 8,
    },
    cardVertical: {
      flexDirection: 'column',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      gap: 6,
    },
    cardTallPortrait: {
      flexDirection: 'column',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 14,
      gap: 10,
    },
    cardLarge: {
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: 12,
      gap: 6,
    },
    cardHero: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 14,
      gap: 14,
    },
    cardWide: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 10,
      gap: 10,
    },
    cardMed: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 8,
      gap: 8,
    },
    tallHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
    },
    artworkContainerTall: {
      borderRadius: 18,
      backgroundColor: palette.glyph,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.45,
      shadowRadius: 10,
      elevation: 6,
      borderWidth: 1,
      borderColor: palette.line,
    },
    discPlaceholderTall: {
      width: '100%',
      height: '100%',
      backgroundColor: palette.glyph,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    discRingOuter: {
      position: 'absolute',
      width: '80%',
      height: '80%',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    discRingInner: {
      position: 'absolute',
      width: '54%',
      height: '54%',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.06)',
    },
    tallMetaWrap: {
      width: '100%',
      alignItems: 'center',
      paddingHorizontal: 4,
      gap: 3,
    },
    tallTitle: {
      color: palette.text,
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.3,
      textAlign: 'center',
      width: '100%',
    },
    tallArtist: {
      color: palette.muted,
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
      width: '100%',
    },
    tallControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      width: '100%',
    },
    btnTallSecondary: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: palette.glyph,
      borderWidth: 1,
      borderColor: palette.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnTallPrimary: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: palette.purple,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: palette.purple,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.55,
      shadowRadius: 10,
      elevation: 6,
    },
    artworkContainerHero: {
      borderRadius: 16,
      backgroundColor: palette.glyph,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.45,
      shadowRadius: 10,
      elevation: 6,
    },
    artworkContainer: {
      borderRadius: 12,
      backgroundColor: palette.glyph,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 3,
    },
    artworkImage: {
      width: '100%',
      height: '100%',
    },
    discPlaceholder: {
      width: '100%',
      height: '100%',
      backgroundColor: palette.glyph,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroCenterCol: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
      gap: 8,
    },
    tagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sourceTag: {
      backgroundColor: 'rgba(124, 92, 255, 0.22)',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    sourceTagText: {
      color: palette.purple,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    statusTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    statusTagPlaying: {
      backgroundColor: 'rgba(16, 185, 129, 0.15)',
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: palette.muted,
    },
    statusDotPlaying: {
      backgroundColor: '#10B981',
      shadowColor: '#10B981',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 4,
      elevation: 2,
    },
    statusTagText: {
      color: palette.muted,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    statusTagTextPlaying: {
      color: '#10B981',
    },
    heroTitleWrap: {
      width: '100%',
    },
    heroTitle: {
      color: palette.text,
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    heroArtist: {
      color: palette.muted,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 2,
    },
    heroControlsWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flexShrink: 0,
    },
    btnHeroSecondary: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: palette.glyph,
      borderWidth: 1,
      borderColor: palette.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnHeroPrimary: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: palette.purple,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: palette.purple,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.55,
      shadowRadius: 10,
      elevation: 6,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      width: '100%',
    },
    timeLabel: {
      color: palette.muted,
      fontSize: 10,
      fontWeight: '700',
      minWidth: 26,
      flexShrink: 0,
    },
    timeLabelSmall: {
      color: palette.muted,
      fontSize: 9,
      fontWeight: '700',
      minWidth: 24,
      flexShrink: 0,
    },
    progressTrack: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: palette.glyph,
      overflow: 'hidden',
    },
    progressTrackSlim: {
      width: '100%',
      height: 3,
      borderRadius: 1.5,
      backgroundColor: palette.glyph,
      overflow: 'hidden',
      marginTop: 3,
    },
    progressFill: {
      height: '100%',
      borderRadius: 2,
      backgroundColor: palette.purple,
    },
    verticalProgressWrap: {
      width: '100%',
      paddingHorizontal: 4,
    },
    wideCenterCol: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
      gap: 2,
    },
    wideMeta: {
      width: '100%',
    },
    wideTitle: {
      color: palette.text,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    wideArtist: {
      color: palette.muted,
      fontSize: 11,
      fontWeight: '600',
    },
    wideControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    medCenterCol: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
      gap: 2,
    },
    medControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
    },
    title: {
      color: palette.text,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    artist: {
      color: palette.muted,
      fontSize: 10,
      fontWeight: '500',
    },
    sourceTagMini: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(124, 92, 255, 0.2)',
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 1,
      marginBottom: 2,
    },
    sourceTagMiniText: {
      color: palette.purple,
      fontSize: 8,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    verticalMeta: {
      width: '100%',
      alignItems: 'center',
      paddingHorizontal: 2,
    },
    verticalTitle: {
      color: palette.text,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
      width: '100%',
    },
    verticalArtist: {
      color: palette.muted,
      fontSize: 10,
      fontWeight: '500',
      textAlign: 'center',
      marginTop: 1,
      width: '100%',
    },
    verticalControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    largeTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    largeMeta: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
    },
    largeTitle: {
      color: palette.text,
      fontSize: 14,
      fontWeight: '800',
    },
    largeArtist: {
      color: palette.muted,
      fontSize: 11,
      fontWeight: '500',
    },
    largeControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      paddingTop: 4,
      width: '100%',
    },
    btnSecondarySmall: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: palette.glyph,
      borderWidth: 1,
      borderColor: palette.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnSecondaryMed: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: palette.glyph,
      borderWidth: 1,
      borderColor: palette.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrimarySmall: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: palette.purple,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrimaryMed: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: palette.purple,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: palette.purple,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.45,
      shadowRadius: 6,
      elevation: 4,
    },
    btnPrimaryLarge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: palette.purple,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: palette.purple,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.5,
      shadowRadius: 8,
      elevation: 5,
    },
    btnPressed: {
      opacity: 0.7,
      transform: [{ scale: 0.94 }],
    },
    btnPrimaryPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.94 }],
    },
    smallArtWrap: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: palette.glyph,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    smallArt: {
      width: '100%',
      height: '100%',
      borderRadius: 10,
    },
    smallPlayPill: {
      position: 'absolute',
      bottom: -4,
      right: -4,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: palette.purple,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smallTitle: {
      color: palette.text,
      fontSize: 10,
      fontWeight: '600',
      textAlign: 'center',
      width: '100%',
    },
  });
