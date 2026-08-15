import { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { connectBridge, scanPairingQr } from '../pairing';
import type { PairingPayload } from '../protocol';
import { colors, spacing } from '../theme';

const palette = colors.dark;

type Connection = ReturnType<typeof connectBridge>;

export function HomeScreen() {
  const connectionRef = useRef<Connection | null>(null);
  const [payload, setPayload] = useState<PairingPayload | null>(null);
  const [otp, setOtp] = useState('');
  const [hostName, setHostName] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'otp' | 'connecting' | 'connected'
  >('idle');
  const [error, setError] = useState<string | null>(null);

  const disconnect = () => {
    connectionRef.current?.close();
    connectionRef.current = null;
    setPayload(null);
    setOtp('');
    setHostName(null);
    setStatus('idle');
  };

  const scan = () => {
    setError(null);
    scanPairingQr()
      .then((next) => {
        setPayload(next);
        setOtp('');
        setStatus('otp');
      })
      .catch((caught: unknown) => {
        const message = caught instanceof Error ? caught.message : '';
        if (message.toLowerCase().includes('cancel')) {
          return;
        }
        setError(message || 'Scan failed');
      });
  };

  const verify = () => {
    if (!payload) {
      return;
    }
    if (otp.trim().length !== 6) {
      setError('Enter the 6-digit OTP from the desktop app');
      return;
    }

    connectionRef.current?.close();
    setError(null);
    setStatus('connecting');
    const session = connectBridge(payload, otp.trim(), {
      onConnected: (nextHost) => {
        if (connectionRef.current !== session) {
          return;
        }
        setHostName(nextHost);
        setStatus('connected');
      },
      onError: (reason) => {
        if (connectionRef.current !== session) {
          return;
        }
        setError(reason);
        setStatus('otp');
      },
      onClose: () => {
        if (connectionRef.current !== session) {
          return;
        }
        setHostName(null);
        setStatus((current) => (current === 'connected' ? 'idle' : current));
      },
    });
    connectionRef.current = session;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>
      <View style={styles.content}>
        <Text style={styles.title}>Nudgeboard</Text>

        {status === 'connected' ? (
          <>
            <Text style={styles.subtitle}>
              Connected to {hostName ?? 'desktop'}.
            </Text>
            <Pressable
              onPress={disconnect}
              style={({ pressed }) => [
                styles.button,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.buttonLabel}>Disconnect</Text>
            </Pressable>
          </>
        ) : null}

        {status === 'otp' || status === 'connecting' ? (
          <>
            <Text style={styles.subtitle}>
              Enter the 6-digit OTP shown on the desktop app.
            </Text>
            <TextInput
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor={palette.muted}
              style={styles.input}
            />
            <Pressable
              onPress={verify}
              style={({ pressed }) => [
                styles.button,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.buttonLabel}>
                {status === 'connecting' ? 'Connecting…' : 'Verify OTP'}
              </Text>
            </Pressable>
          </>
        ) : null}

        {status === 'idle' ? (
          <>
            <Text style={styles.subtitle}>
              Scan the QR code from the desktop app to connect over Wi‑Fi.
            </Text>
            <Pressable
              onPress={scan}
              style={({ pressed }) => [
                styles.button,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.buttonLabel}>Scan QR code</Text>
            </Pressable>
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: palette.text,
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: palette.muted,
    fontSize: 16,
  },
  button: {
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: palette.slot,
  },
  buttonLabel: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    backgroundColor: palette.slot,
    color: palette.text,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
  },
  error: {
    color: '#FF6B6B',
  },
  pressed: {
    opacity: 0.8,
  },
});
