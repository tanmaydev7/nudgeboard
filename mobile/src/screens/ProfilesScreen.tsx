import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppStore, type DesktopProfile } from '../store';
import { colors, spacing } from '../theme';

const palette = colors.dark;

type Props = {
  onAdd: () => void;
};

export function ProfilesScreen({ onAdd }: Props) {
  const profiles = useAppStore((s) => s.profiles);
  const activeFingerprint = useAppStore((s) => s.activeFingerprint);
  const status = useAppStore((s) => s.status);
  const connectedName = useAppStore((s) => s.connectedName);
  const selectProfile = useAppStore((s) => s.selectProfile);
  const setScreen = useAppStore((s) => s.setScreen);
  const error = useAppStore((s) => s.error);

  const onSelect = (profile: DesktopProfile) => {
    if (
      profile.fingerprint === activeFingerprint &&
      status === 'connected'
    ) {
      setScreen('deck');
      return;
    }
    selectProfile(profile.fingerprint);
  };

  return (
    <View style={styles.content}>
      <View style={styles.top}>
        <Text style={styles.brand}>NudgeBoard</Text>
        {status === 'connected' ? (
          <Text style={styles.linked}>• linked</Text>
        ) : null}
      </View>
      <Text style={styles.title}>Your computers</Text>
      <Text style={styles.sub}>
        Pick one to make it active. Connected and disconnected PCs stay in this
        list.
      </Text>
      <ScrollView contentContainerStyle={styles.list}>
        {profiles.map((profile) => {
          const active = profile.fingerprint === activeFingerprint;
          const live = active && status === 'connected';
          return (
            <Pressable
              key={profile.fingerprint}
              onPress={() => onSelect(profile)}
              style={({ pressed }) => [
                styles.card,
                active ? styles.cardActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <View style={styles.cardText}>
                <Text style={styles.cardName}>{profile.name}</Text>
                <Text style={styles.cardMeta}>
                  {profile.os} · {profile.fingerprint}
                </Text>
                <Text style={live ? styles.live : styles.offline}>
                  {live
                    ? `linked${connectedName ? ` · ${connectedName}` : ''}`
                    : active && status === 'connecting'
                      ? 'connecting…'
                      : 'disconnected'}
                </Text>
              </View>
              <View style={[styles.dot, live ? styles.dotOn : styles.dotOff]} />
            </Pressable>
          );
        })}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
      >
        <Text style={styles.buttonLabel}>Pair another PC</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    color: palette.muted,
    fontWeight: '600',
  },
  linked: {
    color: palette.green,
    fontWeight: '700',
  },
  title: {
    color: palette.text,
    fontSize: 32,
    fontWeight: '800',
  },
  sub: {
    color: palette.muted,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.slot,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardActive: {
    borderWidth: 1,
    borderColor: palette.purple,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 16,
  },
  cardMeta: {
    color: palette.muted,
    fontSize: 13,
  },
  live: {
    color: palette.green,
    marginTop: 4,
  },
  offline: {
    color: palette.muted,
    marginTop: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotOn: {
    backgroundColor: palette.green,
  },
  dotOff: {
    backgroundColor: '#6b7280',
  },
  error: {
    color: '#FF6B6B',
  },
  button: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: palette.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    color: palette.text,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
