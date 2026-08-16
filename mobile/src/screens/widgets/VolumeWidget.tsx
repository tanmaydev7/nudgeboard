import { useEffect, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import type { DeckTileView, WidgetActionType } from '../../protocol';
import { useAppStore } from '../../store';
import { type Palette, useThemedStyles } from '../../theme';
import { VolumeHighIcon, VolumeLowIcon, VolumeMuteIcon } from './WidgetIcons';

type Props = {
  tile: DeckTileView;
  width: number;
  height: number;
  colSpan?: number;
  rowSpan?: number;
  onAction?: (action: WidgetActionType, value?: number) => void;
};

export function VolumeWidget({
  tile,
  width,
  height,
  colSpan: propColSpan,
  rowSpan: propRowSpan,
  onAction,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const volumeState = useAppStore((s) => s.volumeState);

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

  const isMuted = volumeState.isMuted;
  const [dragVol, setDragVol] = useState<number | null>(null);
  const [trackDim, setTrackDim] = useState({ width: 1, height: 1 });

  const trackRef = useRef<View>(null);
  const trackBounds = useRef({ pageX: 0, pageY: 0, width: 1, height: 1 });
  const lastSendTime = useRef(0);
  const pendingVolRef = useRef<number | null>(null);
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearDragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDragging = dragVol !== null;
  const currentVol = isDragging ? dragVol : isMuted ? 0 : volumeState.volume;

  useEffect(() => {
    return () => {
      if (sendTimerRef.current) {
        clearTimeout(sendTimerRef.current);
      }
      if (clearDragTimerRef.current) {
        clearTimeout(clearDragTimerRef.current);
      }
    };
  }, []);

  const dispatchVolume = (vol: number) => {
    onAction?.('set_volume', vol);
    lastSendTime.current = Date.now();
  };

  const handleToggleMute = () => {
    useAppStore.getState().setVolumeState({ ...volumeState, isMuted: !isMuted });
    onAction?.('toggle_mute');
  };

  const sendThrottledVolume = (vol: number, isFinal = false) => {
    pendingVolRef.current = vol;

    if (isFinal) {
      if (sendTimerRef.current) {
        clearTimeout(sendTimerRef.current);
        sendTimerRef.current = null;
      }
      dispatchVolume(vol);
      return;
    }

    const now = Date.now();
    const elapsed = now - lastSendTime.current;
    if (elapsed >= 35) {
      if (sendTimerRef.current) {
        clearTimeout(sendTimerRef.current);
        sendTimerRef.current = null;
      }
      dispatchVolume(vol);
    } else if (!sendTimerRef.current) {
      sendTimerRef.current = setTimeout(() => {
        sendTimerRef.current = null;
        if (pendingVolRef.current !== null) {
          dispatchVolume(pendingVolRef.current);
        }
      }, 35 - elapsed);
    }
  };

  const updateVolumeFromTouch = (pageX: number, pageY: number, isFinal = false) => {
    if (clearDragTimerRef.current) {
      clearTimeout(clearDragTimerRef.current);
      clearDragTimerRef.current = null;
    }

    let newVol: number;
    if (isVerticalSlim) {
      const { pageY: trackY, height: th } = trackBounds.current;
      if (th <= 0) return;
      const offset = trackY + th - pageY;
      const fraction = Math.max(0, Math.min(1, offset / th));
      newVol = Math.round(fraction * 100);
    } else {
      const { pageX: trackX, width: tw } = trackBounds.current;
      if (tw <= 0) return;
      const offset = pageX - trackX;
      const fraction = Math.max(0, Math.min(1, offset / tw));
      newVol = Math.round(fraction * 100);
    }

    setDragVol(newVol);
    useAppStore.getState().setVolumeState({ volume: newVol, isMuted: false });
    sendThrottledVolume(newVol, isFinal);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        trackRef.current?.measureInWindow((x, y, w, h) => {
          if (w > 0 && h > 0) {
            trackBounds.current = { pageX: x, pageY: y, width: w, height: h };
          }
          updateVolumeFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY, false);
        });
      },
      onPanResponderMove: (evt) => {
        updateVolumeFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY, false);
      },
      onPanResponderRelease: (evt) => {
        updateVolumeFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY, true);
        if (clearDragTimerRef.current) {
          clearTimeout(clearDragTimerRef.current);
        }
        clearDragTimerRef.current = setTimeout(() => {
          clearDragTimerRef.current = null;
          setDragVol(null);
        }, 600);
      },
      onPanResponderTerminate: (evt) => {
        updateVolumeFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY, true);
        if (clearDragTimerRef.current) {
          clearTimeout(clearDragTimerRef.current);
        }
        clearDragTimerRef.current = setTimeout(() => {
          clearDragTimerRef.current = null;
          setDragVol(null);
        }, 600);
      },
    }),
  ).current;

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width || 1;
    const h = e.nativeEvent.layout.height || 1;
    setTrackDim({ width: w, height: h });
    trackBounds.current.width = w;
    trackBounds.current.height = h;
    trackRef.current?.measureInWindow((x, y, measuredW, measuredH) => {
      if (measuredW > 0 && measuredH > 0) {
        trackBounds.current = { pageX: x, pageY: y, width: measuredW, height: measuredH };
      }
    });
  };

  const handlePreset = (presetVol: number) => {
    if (clearDragTimerRef.current) {
      clearTimeout(clearDragTimerRef.current);
    }
    setDragVol(presetVol);
    useAppStore.getState().setVolumeState({ volume: presetVol, isMuted: false });
    sendThrottledVolume(presetVol, true);
    clearDragTimerRef.current = setTimeout(() => {
      clearDragTimerRef.current = null;
      setDragVol(null);
    }, 600);
  };

  // 1. SMALL 1x1
  if (isSmall) {
    return (
      <View style={[styles.card, styles.cardSmall, { width, height }]}>
        <Pressable
          hitSlop={12}
          onPress={handleToggleMute}
          style={({ pressed }) => [
            styles.iconBtn,
            pressed ? styles.btnPressed : null,
          ]}
        >
          {isMuted ? (
            <VolumeMuteIcon size={24} color={styles.danger.color} />
          ) : currentVol > 50 ? (
            <VolumeHighIcon size={24} color={styles.accent.color} />
          ) : (
            <VolumeLowIcon size={24} color={styles.accent.color} />
          )}
        </Pressable>
        <Text style={styles.smallValText} numberOfLines={1}>
          {isMuted ? 'MUTED' : `${currentVol}%`}
        </Text>
      </View>
    );
  }

  // 2. VERTICAL SLIM 1x2, 1x3, 1x4
  if (isVerticalSlim) {
    const verticalThumbPosition = Math.max(
      0,
      Math.min(trackDim.height - 16, (currentVol / 100) * trackDim.height - 8),
    );

    return (
      <View style={[styles.card, styles.cardVertical, { width, height }]}>
        <View style={styles.verticalHeader}>
          <Pressable
            hitSlop={10}
            onPress={handleToggleMute}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed ? styles.btnPressed : null,
            ]}
          >
            {isMuted ? (
              <VolumeMuteIcon size={20} color={styles.danger.color} />
            ) : currentVol > 50 ? (
              <VolumeHighIcon size={20} color={styles.accent.color} />
            ) : (
              <VolumeLowIcon size={20} color={styles.accent.color} />
            )}
          </Pressable>
          <Text
            style={[styles.valBadge, isDragging ? styles.valBadgeActive : null]}
            numberOfLines={1}
          >
            {isMuted && !isDragging ? 'Muted' : `${currentVol}%`}
          </Text>
        </View>

        <View
          ref={trackRef}
          style={styles.verticalSliderTouchArea}
          onLayout={onTrackLayout}
          {...panResponder.panHandlers}
        >
          <View style={styles.verticalTrackBackground} pointerEvents="none">
            <View
              style={[
                styles.verticalTrackFill,
                { height: `${currentVol}%` },
                isMuted && !isDragging ? styles.trackFillMuted : null,
              ]}
            />
          </View>

          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              { bottom: verticalThumbPosition, left: -2 },
              isMuted && !isDragging ? styles.thumbMuted : null,
              isDragging ? styles.thumbActive : null,
            ]}
          />
        </View>
      </View>
    );
  }

  // 3. TALL PORTRAIT HERO (2x3, 2x4, 2x5, 3x3, 3x4, 3x5) — Studio Console
  if (isPortraitTall) {
    const thumbPos = Math.max(
      0,
      Math.min(trackDim.width - 20, (currentVol / 100) * trackDim.width - 10),
    );

    return (
      <View style={[styles.card, styles.cardTallPortrait, { width, height }]}>
        {/* Top Header: Mute Action, Big Vol Readout, and Meter */}
        <View style={styles.tallTopRow}>
          <Pressable
            hitSlop={12}
            onPress={handleToggleMute}
            style={({ pressed }) => [
              styles.heroIconCircle,
              isMuted ? styles.heroIconCircleMuted : null,
              pressed ? styles.btnPressed : null,
            ]}
          >
            {isMuted ? (
              <VolumeMuteIcon size={24} color={styles.danger.color} />
            ) : currentVol > 50 ? (
              <VolumeHighIcon size={24} color={styles.accent.color} />
            ) : (
              <VolumeLowIcon size={24} color={styles.accent.color} />
            )}
          </Pressable>

          <View style={styles.tallDigitWrap}>
            <Text style={styles.heroVolBig}>
              {isMuted && !isDragging ? 'MUTE' : `${currentVol}%`}
            </Text>
            <Text style={styles.heroStatusText}>
              {isMuted
                ? 'Audio Muted'
                : currentVol === 0
                  ? 'Silent'
                  : currentVol > 75
                    ? 'High Output'
                    : 'Optimal Level'}
            </Text>
          </View>

          <View style={styles.meterBars}>
            {[20, 40, 60, 80, 100].map((threshold, idx) => (
              <View
                key={idx}
                style={[
                  styles.meterBar,
                  currentVol >= threshold && !isMuted ? styles.meterBarOn : null,
                ]}
              />
            ))}
          </View>
        </View>

        {/* Center: Full-Width Slider Track */}
        <View style={styles.tallSliderSection}>
          <Text style={styles.tallSliderLabel}>MASTER AUDIO LEVEL</Text>
          <View
            ref={trackRef}
            style={styles.heroSliderTouchArea}
            onLayout={onTrackLayout}
            {...panResponder.panHandlers}
          >
            <View style={styles.heroTrackBackground} pointerEvents="none">
              <View
                style={[
                  styles.heroTrackFill,
                  { width: `${currentVol}%` },
                  isMuted && !isDragging ? styles.trackFillMuted : null,
                ]}
              />
            </View>

            <View
              pointerEvents="none"
              style={[
                styles.thumbHero,
                { left: thumbPos },
                isMuted && !isDragging ? styles.thumbMuted : null,
                isDragging ? styles.thumbActive : null,
              ]}
            />
          </View>
        </View>

        {/* Bottom: Preset Buttons Bank */}
        <View style={styles.presetRow}>
          <Pressable
            onPress={handleToggleMute}
            style={({ pressed }) => [
              styles.presetPill,
              isMuted ? styles.presetPillActive : null,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <Text style={[styles.presetText, isMuted ? styles.presetTextActive : null]}>
              MUTE
            </Text>
          </Pressable>
          {[25, 50, 75, 100].map((val) => (
            <Pressable
              key={val}
              onPress={() => handlePreset(val)}
              style={({ pressed }) => [
                styles.presetPill,
                currentVol === val && !isMuted ? styles.presetPillActive : null,
                pressed ? styles.btnPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.presetText,
                  currentVol === val && !isMuted ? styles.presetTextActive : null,
                ]}
              >
                {val}%
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  // 4. LANDSCAPE HERO (4x2, 3x2, 5x2 Landscape)
  if (isLandscapeHero) {
    const heroThumbPosition = Math.max(
      0,
      Math.min(trackDim.width - 18, (currentVol / 100) * trackDim.width - 9),
    );

    return (
      <View style={[styles.card, styles.cardHero, { width, height }]}>
        {/* Left Section: Big Readout & Mute Action */}
        <View style={styles.heroLeftCol}>
          <Pressable
            hitSlop={12}
            onPress={handleToggleMute}
            style={({ pressed }) => [
              styles.heroIconCircle,
              isMuted ? styles.heroIconCircleMuted : null,
              pressed ? styles.btnPressed : null,
            ]}
          >
            {isMuted ? (
              <VolumeMuteIcon size={26} color={styles.danger.color} />
            ) : currentVol > 50 ? (
              <VolumeHighIcon size={26} color={styles.accent.color} />
            ) : (
              <VolumeLowIcon size={26} color={styles.accent.color} />
            )}
          </Pressable>

          <View style={styles.heroDigitWrap}>
            <Text style={styles.heroVolBig}>
              {isMuted && !isDragging ? 'MUTE' : `${currentVol}%`}
            </Text>
            <Text style={styles.heroStatusText}>
              {isMuted
                ? 'Audio Muted'
                : currentVol === 0
                  ? 'Silent'
                  : currentVol > 75
                    ? 'High Output'
                    : 'Optimal Level'}
            </Text>
          </View>
        </View>

        {/* Right Section: Large Precision Track & Preset Bank */}
        <View style={styles.heroRightCol}>
          <View style={styles.heroTrackHeader}>
            <Text style={styles.heroTrackLabel}>MASTER AUDIO FADER</Text>
            <View style={styles.meterBars}>
              {[20, 40, 60, 80, 100].map((threshold, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.meterBar,
                    currentVol >= threshold && !isMuted ? styles.meterBarOn : null,
                  ]}
                />
              ))}
            </View>
          </View>

          <View
            ref={trackRef}
            style={styles.heroSliderTouchArea}
            onLayout={onTrackLayout}
            {...panResponder.panHandlers}
          >
            <View style={styles.heroTrackBackground} pointerEvents="none">
              <View
                style={[
                  styles.heroTrackFill,
                  { width: `${currentVol}%` },
                  isMuted && !isDragging ? styles.trackFillMuted : null,
                ]}
              />
            </View>

            <View
              pointerEvents="none"
              style={[
                styles.thumbHero,
                { left: heroThumbPosition },
                isMuted && !isDragging ? styles.thumbMuted : null,
                isDragging ? styles.thumbActive : null,
              ]}
            />
          </View>

          <View style={styles.presetRow}>
            <Pressable
              onPress={handleToggleMute}
              style={({ pressed }) => [
                styles.presetPill,
                isMuted ? styles.presetPillActive : null,
                pressed ? styles.btnPressed : null,
              ]}
            >
              <Text style={[styles.presetText, isMuted ? styles.presetTextActive : null]}>
                MUTE
              </Text>
            </Pressable>
            {[25, 50, 75, 100].map((val) => (
              <Pressable
                key={val}
                onPress={() => handlePreset(val)}
                style={({ pressed }) => [
                  styles.presetPill,
                  currentVol === val && !isMuted ? styles.presetPillActive : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Text
                  style={[
                    styles.presetText,
                    currentVol === val && !isMuted ? styles.presetTextActive : null,
                  ]}
                >
                  {val}%
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    );
  }

  // 5. SQUARE LARGE 2x2
  if (isSquareLarge) {
    const largeThumbPosition = Math.max(
      0,
      Math.min(trackDim.width - 16, (currentVol / 100) * trackDim.width - 8),
    );

    return (
      <View style={[styles.card, styles.cardLarge, { width, height }]}>
        <View style={styles.header}>
          <Pressable
            hitSlop={12}
            onPress={handleToggleMute}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed ? styles.btnPressed : null,
            ]}
          >
            {isMuted ? (
              <VolumeMuteIcon size={20} color={styles.danger.color} />
            ) : currentVol > 50 ? (
              <VolumeHighIcon size={20} color={styles.accent.color} />
            ) : (
              <VolumeLowIcon size={20} color={styles.accent.color} />
            )}
          </Pressable>

          <Text style={styles.title} numberOfLines={1}>
            Master Volume
          </Text>

          <Text
            style={[styles.valBadge, isDragging ? styles.valBadgeActive : null]}
            numberOfLines={1}
          >
            {isMuted && !isDragging ? 'Muted' : `${currentVol}%`}
          </Text>
        </View>

        <View
          ref={trackRef}
          style={styles.sliderTouchArea}
          onLayout={onTrackLayout}
          {...panResponder.panHandlers}
        >
          <View style={styles.trackBackground} pointerEvents="none">
            <View
              style={[
                styles.trackFill,
                { width: `${currentVol}%` },
                isMuted && !isDragging ? styles.trackFillMuted : null,
              ]}
            />
          </View>

          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              { left: largeThumbPosition },
              isMuted && !isDragging ? styles.thumbMuted : null,
              isDragging ? styles.thumbActive : null,
            ]}
          />
        </View>

        <View style={styles.presetRow}>
          <Pressable
            onPress={handleToggleMute}
            style={({ pressed }) => [
              styles.presetPill,
              isMuted ? styles.presetPillActive : null,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <Text style={[styles.presetText, isMuted ? styles.presetTextActive : null]}>
              MUTE
            </Text>
          </Pressable>
          {[25, 50, 75, 100].map((val) => (
            <Pressable
              key={val}
              onPress={() => handlePreset(val)}
              style={({ pressed }) => [
                styles.presetPill,
                currentVol === val && !isMuted ? styles.presetPillActive : null,
                pressed ? styles.btnPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.presetText,
                  currentVol === val && !isMuted ? styles.presetTextActive : null,
                ]}
              >
                {val}%
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  // 6. WIDE (3x1, 4x1, 5x1)
  if (isWideStrip) {
    const wideThumbPosition = Math.max(
      0,
      Math.min(trackDim.width - 16, (currentVol / 100) * trackDim.width - 8),
    );

    return (
      <View style={[styles.card, styles.cardWide, { width, height }]}>
        <View style={styles.wideLeft}>
          <Pressable
            hitSlop={12}
            onPress={handleToggleMute}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed ? styles.btnPressed : null,
            ]}
          >
            {isMuted ? (
              <VolumeMuteIcon size={18} color={styles.danger.color} />
            ) : currentVol > 50 ? (
              <VolumeHighIcon size={18} color={styles.accent.color} />
            ) : (
              <VolumeLowIcon size={18} color={styles.accent.color} />
            )}
          </Pressable>
          <Text style={styles.valBadge}>
            {isMuted && !isDragging ? 'Muted' : `${currentVol}%`}
          </Text>
        </View>

        <View
          ref={trackRef}
          style={styles.wideSliderTouchArea}
          onLayout={onTrackLayout}
          {...panResponder.panHandlers}
        >
          <View style={styles.trackBackground} pointerEvents="none">
            <View
              style={[
                styles.trackFill,
                { width: `${currentVol}%` },
                isMuted && !isDragging ? styles.trackFillMuted : null,
              ]}
            />
          </View>

          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              { left: wideThumbPosition },
              isMuted && !isDragging ? styles.thumbMuted : null,
              isDragging ? styles.thumbActive : null,
            ]}
          />
        </View>

        <View style={styles.widePresets}>
          {[0, 50, 100].map((val) => (
            <Pressable
              key={val}
              onPress={() => handlePreset(val)}
              style={({ pressed }) => [
                styles.presetPillSmall,
                currentVol === val && !isMuted ? styles.presetPillActive : null,
                pressed ? styles.btnPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.presetTextSmall,
                  currentVol === val && !isMuted ? styles.presetTextActive : null,
                ]}
              >
                {val}%
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  // 7. MEDIUM (2x1 Default)
  const thumbPosition = Math.max(
    0,
    Math.min(trackDim.width - 16, (currentVol / 100) * trackDim.width - 8),
  );

  return (
    <View style={[styles.card, { width, height }]}>
      <View style={styles.header}>
        <Pressable
          hitSlop={12}
          onPress={handleToggleMute}
          style={({ pressed }) => [
            styles.iconBtn,
            pressed ? styles.btnPressed : null,
          ]}
        >
          {isMuted ? (
            <VolumeMuteIcon size={18} color={styles.danger.color} />
          ) : currentVol > 50 ? (
            <VolumeHighIcon size={18} color={styles.accent.color} />
          ) : (
            <VolumeLowIcon size={18} color={styles.accent.color} />
          )}
        </Pressable>

        <Text style={styles.title} numberOfLines={1}>
          Master Volume
        </Text>

        <Text
          style={[styles.valBadge, isDragging ? styles.valBadgeActive : null]}
          numberOfLines={1}
        >
          {isMuted && !isDragging ? 'Muted' : `${currentVol}%`}
        </Text>
      </View>

      <View
        ref={trackRef}
        style={styles.sliderTouchArea}
        onLayout={onTrackLayout}
        {...panResponder.panHandlers}
      >
        <View style={styles.trackBackground} pointerEvents="none">
          <View
            style={[
              styles.trackFill,
              { width: `${currentVol}%` },
              isMuted && !isDragging ? styles.trackFillMuted : null,
            ]}
          />
        </View>

        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            { left: thumbPosition },
            isMuted && !isDragging ? styles.thumbMuted : null,
            isDragging ? styles.thumbActive : null,
          ]}
        />
      </View>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    accent: {
      color: palette.purple,
    },
    danger: {
      color: palette.danger,
    },
    card: {
      borderRadius: 18,
      backgroundColor: palette.slot,
      borderWidth: 1,
      borderColor: palette.line,
      padding: 12,
      justifyContent: 'space-between',
      overflow: 'hidden',
    },
    cardSmall: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      padding: 8,
    },
    cardVertical: {
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 8,
    },
    cardTallPortrait: {
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: 14,
      gap: 12,
    },
    cardWide: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      gap: 12,
    },
    cardLarge: {
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: 14,
      gap: 8,
    },
    cardHero: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 20,
    },
    tallTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
    },
    tallDigitWrap: {
      alignItems: 'center',
    },
    tallSliderSection: {
      width: '100%',
      gap: 6,
    },
    tallSliderLabel: {
      color: palette.purple,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.6,
      textAlign: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    verticalHeader: {
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      width: '100%',
    },
    iconBtn: {
      padding: 3,
    },
    btnPressed: {
      opacity: 0.6,
      transform: [{ scale: 0.92 }],
    },
    title: {
      flex: 1,
      color: palette.text,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    valBadge: {
      color: palette.purple,
      fontSize: 12,
      fontWeight: '800',
    },
    valBadgeActive: {
      color: palette.purple,
      transform: [{ scale: 1.08 }],
    },
    sliderTouchArea: {
      width: '100%',
      height: 36,
      justifyContent: 'center',
      paddingVertical: 6,
    },
    verticalSliderTouchArea: {
      width: 36,
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 4,
    },
    wideSliderTouchArea: {
      flex: 1,
      height: 36,
      justifyContent: 'center',
      paddingVertical: 6,
      marginHorizontal: 4,
    },
    trackBackground: {
      width: '100%',
      height: 8,
      borderRadius: 4,
      backgroundColor: palette.glyph,
      overflow: 'hidden',
    },
    verticalTrackBackground: {
      width: 10,
      height: '100%',
      borderRadius: 5,
      backgroundColor: palette.glyph,
      overflow: 'hidden',
      justifyContent: 'flex-end',
    },
    trackFill: {
      height: '100%',
      borderRadius: 4,
      backgroundColor: palette.purple,
    },
    verticalTrackFill: {
      width: '100%',
      borderRadius: 5,
      backgroundColor: palette.purple,
    },
    trackFillMuted: {
      backgroundColor: palette.danger,
    },
    thumb: {
      position: 'absolute',
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: palette.onPurple,
      borderWidth: 1.5,
      borderColor: palette.purple,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
      shadowRadius: 3,
      elevation: 5,
    },
    thumbActive: {
      transform: [{ scale: 1.25 }],
      backgroundColor: palette.onPurple,
      borderWidth: 2,
      borderColor: palette.purple,
    },
    thumbMuted: {
      backgroundColor: palette.danger,
      borderColor: palette.danger,
    },
    smallValText: {
      color: palette.purple,
      fontSize: 11,
      fontWeight: '800',
      textAlign: 'center',
    },
    presetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
      width: '100%',
    },
    presetPill: {
      flex: 1,
      paddingVertical: 5,
      borderRadius: 6,
      backgroundColor: palette.glyph,
      borderWidth: 1,
      borderColor: palette.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    presetPillSmall: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: palette.glyph,
      borderWidth: 1,
      borderColor: palette.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    presetPillActive: {
      backgroundColor: palette.purple,
      borderColor: palette.purple,
    },
    presetText: {
      color: palette.text,
      fontSize: 10,
      fontWeight: '700',
    },
    presetTextSmall: {
      color: palette.text,
      fontSize: 9,
      fontWeight: '700',
    },
    presetTextActive: {
      color: palette.onPurple,
    },
    wideLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    widePresets: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    heroLeftCol: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minWidth: 90,
    },
    heroIconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: palette.glyph,
      borderWidth: 1.5,
      borderColor: palette.purple,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: palette.purple,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
      shadowRadius: 6,
      elevation: 4,
    },
    heroIconCircleMuted: {
      borderColor: palette.danger,
      shadowColor: palette.danger,
    },
    heroDigitWrap: {
      alignItems: 'center',
    },
    heroVolBig: {
      color: palette.text,
      fontSize: 24,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    heroStatusText: {
      color: palette.muted,
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    heroRightCol: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'space-between',
      gap: 8,
      height: '100%',
      paddingVertical: 2,
    },
    heroTrackHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
    },
    heroTrackLabel: {
      color: palette.purple,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    meterBars: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    meterBar: {
      width: 4,
      height: 12,
      borderRadius: 1.5,
      backgroundColor: palette.glyph,
    },
    meterBarOn: {
      backgroundColor: palette.purple,
    },
    heroSliderTouchArea: {
      width: '100%',
      height: 40,
      justifyContent: 'center',
      paddingVertical: 8,
    },
    heroTrackBackground: {
      width: '100%',
      height: 10,
      borderRadius: 5,
      backgroundColor: palette.glyph,
      overflow: 'hidden',
    },
    heroTrackFill: {
      height: '100%',
      borderRadius: 5,
      backgroundColor: palette.purple,
    },
    thumbHero: {
      position: 'absolute',
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: palette.onPurple,
      borderWidth: 2,
      borderColor: palette.purple,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 4,
      elevation: 6,
    },
  });
