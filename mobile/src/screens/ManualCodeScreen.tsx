import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { isPairingPin } from '../protocol';
import { useAppStore } from '../store';
import { colors, spacing } from '../theme';

const palette = colors.dark;

export function ManualCodeScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const startPinPairing = useAppStore((s) => s.startPinPairing);
  const status = useAppStore((s) => s.status);
  const storeError = useAppStore((s) => s.error);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const searching = status === 'connecting';
  const digits = code.padEnd(6, ' ').slice(0, 6).split('');

  const submit = () => {
    if (!isPairingPin(code)) {
      setError('Enter the 6-digit code from your PC');
      return;
    }
    setError(null);
    startPinPairing(code);
  };

  return (
    <View style={styles.content}>
      <Text style={styles.brand}>NudgeBoard</Text>
      <Text style={styles.title}>Type the 6 digits from your PC</Text>
      <Text style={styles.hint}>
        Keep your phone and PC on the same Wi-Fi. The code expires in 5 minutes.
      </Text>
      <View style={styles.otpRow}>
        {digits.map((digit, index) => (
          <View
            key={index}
            style={[
              styles.otpBox,
              digit.trim() ? styles.otpFilled : null,
              index === code.length ? styles.otpActive : null,
            ]}
          >
            <Text style={styles.otpDigit}>{digit.trim()}</Text>
          </View>
        ))}
        <TextInput
          value={code}
          onChangeText={(next) => {
            setError(null);
            setCode(next.replace(/\D/g, '').slice(0, 6));
          }}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          caretHidden
          style={styles.otpHidden}
          accessibilityLabel="Six-digit pairing code"
        />
      </View>
      {error || storeError ? (
        <Text style={styles.error}>{error ?? storeError}</Text>
      ) : null}
      <Pressable
        onPress={submit}
        disabled={code.length !== 6 || searching}
        style={({ pressed }) => [
          styles.button,
          code.length !== 6 || searching ? styles.disabled : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={styles.buttonLabel}>
          {searching ? 'Looking for your PC…' : 'Continue'}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => setScreen('scan')}
        disabled={searching}
        style={styles.linkWrap}
      >
        <Text style={styles.link}>Back to camera</Text>
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
  hint: {
    color: palette.muted,
  },
  otpRow: {
    position: 'relative',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  otpBox: {
    flex: 1,
    minHeight: 64,
    borderRadius: 12,
    backgroundColor: palette.slot,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpFilled: {
    backgroundColor: '#2a2150',
    borderWidth: 1,
    borderColor: palette.purple,
  },
  otpActive: {
    borderWidth: 1,
    borderColor: palette.purple,
  },
  otpDigit: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '700',
  },
  otpHidden: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  error: {
    color: '#FF6B6B',
  },
  button: {
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: palette.purple,
  },
  buttonLabel: {
    color: palette.text,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.45,
  },
  linkWrap: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  link: {
    color: palette.purple,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
