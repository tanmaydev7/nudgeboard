import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppStore } from '../store';
import { colors, spacing } from '../theme';
import { useCountdown } from '../useCountdown';

const palette = colors.dark;

type Props = {
  onCancel: () => void;
};

export function PairCodeScreen({ onCancel }: Props) {
  const pairing = useAppStore((s) => s.pairing);
  const { remaining, expired } = useCountdown(pairing?.expiresAt);
  const error = useAppStore((s) => s.error);
  const digits = (pairing?.otp ?? '').padEnd(6, ' ').slice(0, 6).split('');
  const hostName = pairing?.payload.name ?? 'desktop';

  return (
    <View style={styles.content}>
      <Text style={styles.brand}>NudgeBoard</Text>
      <Text style={styles.title}>
        Type these digits on{' '}
        <Text style={styles.host}>{hostName}</Text>
      </Text>
      <View style={styles.otpRow}>
        {digits.map((digit, index) => (
          <View key={index} style={styles.otpBox}>
            <Text style={styles.otpDigit}>{digit.trim()}</Text>
          </View>
        ))}
      </View>
      {pairing ? (
        <View style={styles.card}>
          <Text style={styles.cardName}>{pairing.payload.name}</Text>
          <Text style={styles.cardMeta}>
            {pairing.payload.os} · fingerprint
          </Text>
          <Text style={styles.fingerprint}>{pairing.payload.fingerprint}</Text>
        </View>
      ) : null}
      <Text style={expired ? styles.expired : styles.hint}>
        {expired
          ? 'This code expired. Scan a new QR on your PC.'
          : `Stay on the same Wi-Fi as this PC. Only type these on a computer you own. The code dies in ${remaining}.`}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        onPress={onCancel}
        style={({ pressed }) => [styles.ghost, pressed ? styles.pressed : null]}
      >
        <Text style={styles.ghostLabel}>Not my computer</Text>
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
  brand: {
    color: palette.muted,
    fontWeight: '600',
    textAlign: 'right',
  },
  title: {
    color: palette.text,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  host: {
    color: palette.text,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  otpBox: {
    flex: 1,
    minHeight: 64,
    borderRadius: 12,
    backgroundColor: '#2a2150',
    borderWidth: 1,
    borderColor: palette.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '700',
  },
  card: {
    backgroundColor: palette.slot,
    borderRadius: 16,
    padding: spacing.md,
    gap: 4,
  },
  cardName: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 16,
  },
  cardMeta: {
    color: palette.muted,
  },
  fingerprint: {
    color: palette.muted,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  hint: {
    color: palette.muted,
  },
  expired: {
    color: '#FF6B6B',
  },
  error: {
    color: '#FF6B6B',
  },
  ghost: {
    marginTop: 'auto',
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3a3f4a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: {
    color: palette.text,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
});
