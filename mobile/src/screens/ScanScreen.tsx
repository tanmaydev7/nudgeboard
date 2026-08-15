import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { useBarcodeScannerOutput } from 'react-native-vision-camera-barcode-scanner';
import { parsePairingPayload } from '../pairing';
import { makeOtp, useAppStore } from '../store';
import { colors, spacing } from '../theme';

const palette = colors.dark;
const QR_FORMATS: Array<'qr-code'> = ['qr-code'];

type Props = {
  onBack?: () => void;
};

export function ScanScreen({ onBack }: Props) {
  const setScreen = useAppStore((s) => s.setScreen);
  const setError = useAppStore((s) => s.setError);
  const startPairing = useAppStore((s) => s.startPairing);
  const error = useAppStore((s) => s.error);
  const profiles = useAppStore((s) => s.profiles);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const locked = useRef(false);
  const [active, setActive] = useState(true);

  const scannerOutput = useBarcodeScannerOutput({
    barcodeFormats: QR_FORMATS,
    onBarcodeScanned: (barcodes) => {
      if (locked.current) {
        return;
      }
      const value = barcodes[0]?.rawValue;
      if (!value) {
        return;
      }
      try {
        const payload = parsePairingPayload(value);
        locked.current = true;
        setActive(false);
        setError(null);
        startPairing(payload, makeOtp());
      } catch {
        // Ignore unrelated QR codes until a Nudgeboard payload is in frame.
      }
    },
    onError: (caught) => {
      setError(caught.message || 'Scan failed');
    },
  });

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  return (
    <View style={styles.content}>
      <View style={styles.top}>
        <Text style={styles.brand}>NudgeBoard</Text>
      </View>
      <Text style={styles.title}>Point at the code on your PC</Text>
      <View style={styles.finder} collapsable={false}>
        <View style={styles.finderClip}>
          {hasPermission && device ? (
            <Camera
              style={styles.camera}
              isActive={active}
              device={device}
              outputs={[scannerOutput]}
              implementationMode="compatible"
              onError={(caught) => {
                setError(caught.message || 'Camera failed');
              }}
            />
          ) : (
            <Pressable
              onPress={requestPermission}
              style={({ pressed }) => [
                styles.permission,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.permissionLabel}>
                {device == null ? 'No camera found' : 'Allow camera'}
              </Text>
              <Text style={styles.finderHint}>
                {device == null
                  ? 'Enter the code instead'
                  : 'Needed to scan the desktop code'}
              </Text>
            </Pressable>
          )}
        </View>
        <View pointerEvents="none" style={styles.overlay}>
          <View style={styles.overlayRow}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
          </View>
          <View style={styles.overlayRow}>
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={() => setScreen('manual')} style={styles.linkWrap}>
        <Text style={styles.link}>Enter code instead</Text>
      </Pressable>
      {profiles.length > 0 && onBack ? (
        <Pressable onPress={onBack} style={styles.linkWrap}>
          <Text style={styles.mutedLink}>Back to computers</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  top: {
    alignItems: 'flex-end',
  },
  brand: {
    color: palette.muted,
    fontWeight: '600',
  },
  title: {
    color: palette.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  finder: {
    flex: 1,
    minHeight: 280,
    maxHeight: 420,
  },
  finderClip: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#14161c',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 16,
  },
  overlayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  permissionLabel: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 16,
  },
  finderHint: {
    color: palette.muted,
  },
  corner: {
    width: 28,
    height: 28,
    borderColor: palette.lime,
  },
  tl: {
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  tr: {
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bl: {
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  br: {
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  error: {
    color: '#FF6B6B',
  },
  linkWrap: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  link: {
    color: palette.purple,
    fontWeight: '700',
    fontSize: 16,
  },
  mutedLink: {
    color: palette.muted,
  },
  pressed: {
    opacity: 0.85,
  },
});
