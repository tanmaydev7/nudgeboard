import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../store';
import { ThemeToggle, spacing, type Palette, useThemedStyles } from '../theme';
/** Collapsed snap = default Gorhom handle height. One pill, always visible. */
export const DRAWER_PEEK = 24;

export type ProfileDrawerHandle = {
  open: () => void;
  close: () => void;
};

type Props = {
  onDisconnect: () => void;
  onLogout?: () => void;
};

export const ProfileDrawer = forwardRef<ProfileDrawerHandle, Props>(
  function ProfileDrawer({ onDisconnect, onLogout }, ref) {
    const sheetRef = useRef<BottomSheet>(null);
    const profiles = useAppStore((s) => s.profiles);
    const activeFingerprint = useAppStore((s) => s.activeFingerprint);
    const status = useAppStore((s) => s.status);
    const connectedName = useAppStore((s) => s.connectedName);
    const selectProfile = useAppStore((s) => s.selectProfile);
    const removeProfile = useAppStore((s) => s.removeProfile);
    const setScreen = useAppStore((s) => s.setScreen);
    const profile = profiles.find(
      (item) => item.fingerprint === activeFingerprint,
    );
    const name = connectedName ?? profile?.name ?? 'Desktop';
    const live = status === 'connected';
    const styles = useThemedStyles(makeStyles);
    const insets = useSafeAreaInsets();
    const snapPoints = useMemo(() => [DRAWER_PEEK], []);

    useImperativeHandle(ref, () => ({
      open: () => sheetRef.current?.expand(),
      close: () => sheetRef.current?.collapse(),
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={1}
          disappearsOnIndex={0}
          pressBehavior="collapse"
        />
      ),
      [],
    );

    const go = (screen: 'scan' | 'profiles') => {
      sheetRef.current?.collapse();
      setScreen(screen);
    };

    const reconnect = () => {
      if (!activeFingerprint) {
        return;
      }
      sheetRef.current?.collapse();
      onDisconnect();
      selectProfile(activeFingerprint);
    };

    const logout = () => {
      if (!activeFingerprint) {
        return;
      }
      sheetRef.current?.collapse();
      if (onLogout) {
        onLogout();
      } else {
        onDisconnect();
      }
      removeProfile(activeFingerprint);
    };

    return (
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        enableDynamicSizing
        enablePanDownToClose={false}
        animateOnMount={false}
        bottomInset={insets.bottom}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.background}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetView style={styles.body}>
          <View style={styles.header}>
            <View style={styles.monitor}>
              <Text style={styles.monitorGlyph}>▣</Text>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>
                {name}
              </Text>
              <View style={styles.statusRow}>
                <View
                  style={[styles.dot, live ? styles.dotOn : styles.dotOff]}
                />
                <Text style={live ? styles.live : styles.offline}>
                  {live
                    ? 'Connected'
                    : status === 'connecting'
                      ? 'Connecting…'
                      : 'Not connected'}
                </Text>
              </View>
            </View>
            <ThemeToggle />
          </View>

          <Pressable
            onPress={() => go('scan')}
            style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
          >
            <View style={[styles.badge, styles.badgeGreen]}>
              <Text style={styles.badgeLabel}>+</Text>
            </View>
            <Text style={styles.rowLabel}>Pair a new computer</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          {profiles.length > 1 ? (
            <Pressable
              onPress={() => go('profiles')}
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
            >
              <View style={[styles.badge, styles.badgeBlue]}>
                <Text style={styles.badgeLabel}>⌂</Text>
              </View>
              <Text style={styles.rowLabel}>Switch computer</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={logout}
            style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
          >
            <View style={[styles.badge, styles.badgeRed]}>
              <Text style={styles.badgeLabel}>×</Text>
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>Log out</Text>
              <Text style={styles.rowMeta}>
                Unpair and clear the deck and custom actions
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          <Pressable
            onPress={reconnect}
            style={({ pressed }) => [
              styles.reconnect,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.reconnectLabel}>
              {live ? 'Reconnect' : 'Retry'}
            </Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    background: {
      backgroundColor: palette.sheet,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: palette.handle,
    },
    body: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      gap: 4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingBottom: spacing.md,
    },
    monitor: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: palette.glyph,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monitorGlyph: {
      color: palette.text,
      fontSize: 20,
    },
    headerText: {
      flex: 1,
      gap: 4,
    },
    title: {
      color: palette.text,
      fontSize: 20,
      fontWeight: '800',
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    dotOn: {
      backgroundColor: palette.green,
    },
    dotOff: {
      backgroundColor: palette.danger,
    },
    live: {
      color: palette.green,
      fontWeight: '600',
    },
    offline: {
      color: palette.danger,
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
    },
    rowCopy: {
      flex: 1,
      gap: 2,
    },
    rowLabel: {
      flex: 1,
      color: palette.text,
      fontWeight: '600',
      fontSize: 16,
    },
    rowMeta: {
      color: palette.muted,
      fontSize: 13,
    },
    chevron: {
      color: palette.muted,
      fontSize: 22,
    },
    badge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeGreen: {
      backgroundColor: '#16a34a',
    },
    badgeBlue: {
      backgroundColor: '#2563eb',
    },
    badgeRed: {
      backgroundColor: '#dc2626',
    },
    badgeLabel: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 16,
    },
    reconnect: {
      marginTop: spacing.md,
      minHeight: 52,
      borderRadius: 14,
      backgroundColor: palette.reconnect,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reconnectLabel: {
      color: palette.green,
      fontWeight: '800',
      fontSize: 16,
    },
    pressed: {
      opacity: 0.85,
    },
  });
