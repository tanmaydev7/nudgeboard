import { useRef } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../store';
import { colors, spacing } from '../theme';
import { DeckGrid } from './DeckGrid';
import { ProfileDrawer, DRAWER_PEEK, type ProfileDrawerHandle } from './ProfileDrawer';

const palette = colors.dark;

type Props = {
  onDisconnect: () => void;
  onPressTile?: (id: string) => void;
};

export function DeckScreen({ onDisconnect, onPressTile }: Props) {
  const connectedName = useAppStore((s) => s.connectedName);
  const profiles = useAppStore((s) => s.profiles);
  const activeFingerprint = useAppStore((s) => s.activeFingerprint);
  const status = useAppStore((s) => s.status);
  const profile = profiles.find(
    (item) => item.fingerprint === activeFingerprint,
  );
  const name = connectedName ?? profile?.name ?? 'Desktop';
  const live = status === 'connected';
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const drawerRef = useRef<ProfileDrawerHandle>(null);
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 8);

  return (
    <View style={styles.shell}>
      <View
        style={[
          styles.content,
          landscape ? styles.landscape : null,
          { paddingBottom: DRAWER_PEEK + bottomGap },
        ]}
      >
        <Pressable
          onPress={() => drawerRef.current?.open()}
          style={({ pressed }) => [styles.top, pressed ? styles.pressed : null]}
        >
          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>
          <Text style={live ? styles.linked : styles.offline}>
            {live ? '• linked' : '• not connected'}
          </Text>
        </Pressable>
        <DeckGrid onPressTile={live ? onPressTile : undefined} />
      </View>
      <ProfileDrawer ref={drawerRef} onDisconnect={onDisconnect} />
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
    paddingTop: spacing.md,
    paddingBottom: 0,
    gap: spacing.sm,
  },
  landscape: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    flex: 1,
    color: palette.text,
    fontSize: 22,
    fontWeight: '800',
  },
  linked: {
    color: palette.green,
    fontWeight: '700',
  },
  offline: {
    color: '#f87171',
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
