import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { parsePairingPayload } from '../pairing';
import { makeOtp, useAppStore } from '../store';
import { colors, spacing } from '../theme';

const palette = colors.dark;

export function ManualCodeScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const startPairing = useAppStore((s) => s.startPairing);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    try {
      const payload = parsePairingPayload(code);
      startPairing(payload, makeOtp());
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : 'Invalid code';
      setError(message);
    }
  };

  return (
    <View style={styles.content}>
      <Text style={styles.brand}>NudgeBoard</Text>
      <Text style={styles.title}>Paste the code from your PC</Text>
      <Text style={styles.hint}>
        Keep your phone and PC on the same Wi-Fi while you pair and use the app.
      </Text>
      <TextInput
        value={code}
        onChangeText={(next) => {
          setError(null);
          setCode(next);
        }}
        placeholder="nb1|DESKTOP-RAY|..."
        placeholderTextColor={palette.muted}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        onPress={submit}
        style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
      >
        <Text style={styles.buttonLabel}>Continue</Text>
      </Pressable>
      <Pressable onPress={() => setScreen('scan')} style={styles.linkWrap}>
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
  input: {
    minHeight: 120,
    borderRadius: 14,
    backgroundColor: palette.slot,
    color: palette.text,
    padding: spacing.md,
    textAlignVertical: 'top',
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
