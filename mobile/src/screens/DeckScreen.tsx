import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deckPageCount, pageTiles } from '../protocol';
import { useAppStore } from '../store';
import { colors, spacing } from '../theme';
import { DeckGrid } from './DeckGrid';
import { ProfileDrawer, DRAWER_PEEK, type ProfileDrawerHandle } from './ProfileDrawer';

const palette = colors.dark;

type Props = {
  onDisconnect: () => void;
  onLogout?: () => void;
  onPressTile?: (id: string) => void;
};

export function DeckScreen({ onDisconnect, onLogout, onPressTile }: Props) {
  const connectedName = useAppStore((s) => s.connectedName);
  const profiles = useAppStore((s) => s.profiles);
  const activeFingerprint = useAppStore((s) => s.activeFingerprint);
  const status = useAppStore((s) => s.status);
  const deck = useAppStore((s) => s.deck);
  const profile = profiles.find(
    (item) => item.fingerprint === activeFingerprint,
  );
  const name = connectedName ?? profile?.name ?? 'Desktop';
  const live = status === 'connected';
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const drawerRef = useRef<ProfileDrawerHandle>(null);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 8);
  const pages = deckPageCount(deck);
  const [page, setPage] = useState(0);
  const [box, setBox] = useState<{ width: number; height: number } | undefined>(
    undefined,
  );

  useEffect(() => {
    setPage((current) => Math.min(current, pages - 1));
  }, [pages]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout;
    setBox((prev) => {
      if (prev?.width === next.width && prev?.height === next.height) {
        return prev;
      }
      return { width: next.width, height: next.height };
    });
  };

  const goToPage = (index: number) => {
    if (!box) {
      return;
    }
    scrollRef.current?.scrollTo({ x: index * box.width, animated: true });
    setPage(index);
  };

  const onPageScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!box) {
      return;
    }
    const next = Math.round(event.nativeEvent.contentOffset.x / box.width);
    setPage(next);
  };

  const pageDots = Array.from({ length: pages }, (_, index) => (
    <Pressable
      key={index}
      onPress={() => goToPage(index)}
      style={styles.dotHit}
      accessibilityLabel={`Page ${index + 1}`}
    >
      <View style={[styles.dot, index === page ? styles.dotOn : null]} />
    </Pressable>
  ));

  return (
    <View style={styles.shell}>
      <Pressable
        onPress={() => drawerRef.current?.open()}
        accessibilityLabel={live ? 'Connected' : 'Disconnected'}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.statusHit,
          pressed ? styles.pressed : null,
        ]}
      >
        <View
          style={[styles.statusDot, live ? styles.statusOn : styles.statusOff]}
        />
      </Pressable>
      <View
        style={[
          styles.content,
          landscape ? styles.landscape : null,
          {
            paddingTop: landscape ? spacing.sm : spacing.md,
            paddingBottom: DRAWER_PEEK + bottomGap,
          },
        ]}
      >
        {landscape ? null : (
          <>
            <Pressable
              onPress={() => drawerRef.current?.open()}
              style={({ pressed }) => [
                styles.top,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.title} numberOfLines={1}>
                {name}
              </Text>
            </Pressable>
            <Text style={styles.hint}>Stay on the same Wi-Fi as your PC.</Text>
          </>
        )}
        <View
          style={[styles.carousel, landscape ? styles.carouselLandscape : null]}
        >
          <View style={styles.pager} onLayout={onLayout}>
            {box ? (
              <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onPageScroll}
              >
                {Array.from({ length: pages }, (_, index) => (
                  <View
                    key={index}
                    style={{ width: box.width, height: box.height }}
                  >
                    <DeckGrid
                      tiles={pageTiles(deck, index)}
                      onPressTile={live ? onPressTile : undefined}
                    />
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>
          <View style={[styles.dots, landscape ? styles.dotsLandscape : null]}>
            {pageDots}
          </View>
        </View>
      </View>
      <ProfileDrawer
        ref={drawerRef}
        onDisconnect={onDisconnect}
        onLogout={onLogout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: 0,
    gap: spacing.sm,
  },
  landscape: {
    paddingHorizontal: spacing.sm,
    gap: 0,
  },
  statusHit: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 20,
    padding: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusOn: {
    backgroundColor: palette.green,
  },
  statusOff: {
    backgroundColor: '#f87171',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 28,
  },
  title: {
    flex: 1,
    color: palette.text,
    fontSize: 22,
    fontWeight: '800',
  },
  hint: {
    color: palette.muted,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.85,
  },
  carousel: {
    flex: 1,
    minHeight: 0,
    gap: spacing.sm,
  },
  carouselLandscape: {
    gap: 2,
  },
  pager: {
    flex: 1,
    minHeight: 0,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dotsLandscape: {
    paddingBottom: 2,
  },
  dotHit: {
    padding: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3a3f4a',
  },
  dotOn: {
    backgroundColor: '#d4d4d8',
  },
});
