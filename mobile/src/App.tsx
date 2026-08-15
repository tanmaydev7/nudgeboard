import { useEffect, useRef, useState } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { connectBridge, getDeviceInfo } from './pairing';
import type { ClientMessage } from './protocol';
import { DeckScreen } from './screens/DeckScreen';
import { ManualCodeScreen } from './screens/ManualCodeScreen';
import { PairCodeScreen } from './screens/PairCodeScreen';
import { ProfilesScreen } from './screens/ProfilesScreen';
import { ScanScreen } from './screens/ScanScreen';
import { useAppStore } from './store';
import { colors } from './theme';

type Connection = ReturnType<typeof connectBridge>;

function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());

  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    if (useAppStore.persist.hasHydrated()) {
      setHydrated(true);
    }
    return unsub;
  }, []);

  return hydrated;
}

function useBridgeConnection() {
  const connectionRef = useRef<Connection | null>(null);
  const status = useAppStore((s) => s.status);
  const pairing = useAppStore((s) => s.pairing);
  const activeFingerprint = useAppStore((s) => s.activeFingerprint);
  const finishPairing = useAppStore((s) => s.finishPairing);
  const markDisconnected = useAppStore((s) => s.markDisconnected);
  const setError = useAppStore((s) => s.setError);
  const setStatus = useAppStore((s) => s.setStatus);
  const setDeck = useAppStore((s) => s.setDeck);

  const disconnect = () => {
    connectionRef.current?.close();
    connectionRef.current = null;
  };

  useEffect(() => {
    if (status !== 'connecting') {
      return;
    }

    const device = getDeviceInfo();
    let host = '';
    let port = 0;
    let message: ClientMessage;

    if (pairing) {
      host = pairing.payload.host;
      port = pairing.payload.port;
      message = {
        type: 'hello',
        token: pairing.payload.token,
        otp: pairing.otp,
        device,
      };
    } else {
      const profile = useAppStore
        .getState()
        .profiles.find((item) => item.fingerprint === activeFingerprint);
      if (!profile) {
        setStatus('idle');
        return;
      }
      host = profile.host;
      port = profile.port;
      message = {
        type: 'reconnect',
        token: profile.token,
        device,
      };
    }

    connectionRef.current?.close();
    const session = connectBridge(host, port, message, {
      onConnected: (hostName) => {
        if (connectionRef.current !== session) {
          return;
        }
        finishPairing(hostName);
      },
      onDeck: (tiles) => {
        if (connectionRef.current !== session) {
          return;
        }
        setDeck(tiles);
      },
      onError: (reason) => {
        if (connectionRef.current !== session) {
          return;
        }
        setError(reason);
        setStatus('idle');
      },
      onClose: () => {
        if (connectionRef.current !== session) {
          return;
        }
        if (useAppStore.getState().status === 'connected') {
          markDisconnected();
        }
      },
    });
    connectionRef.current = session;
  }, [
    status,
    pairing,
    activeFingerprint,
    finishPairing,
    markDisconnected,
    setError,
    setStatus,
    setDeck,
  ]);

  return { disconnect };
}

function AppShell() {
  const hydrated = useHydrated();

  if (!hydrated) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.dark.background }}
      />
    );
  }

  return <ReadyApp />;
}

function ReadyApp() {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const cancelPairing = useAppStore((s) => s.cancelPairing);
  const { disconnect } = useBridgeConnection();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.dark.background }}
      edges={
        screen === 'deck'
          ? ['top', 'right', 'left']
          : ['top', 'right', 'bottom', 'left']
      }
    >
      {screen === 'scan' ? (
        <ScanScreen onBack={() => setScreen('profiles')} />
      ) : null}
      {screen === 'manual' ? <ManualCodeScreen /> : null}
      {screen === 'pair_code' ? (
        <PairCodeScreen
          onCancel={() => {
            disconnect();
            cancelPairing();
          }}
        />
      ) : null}
      {screen === 'profiles' ? (
        <ProfilesScreen onAdd={() => setScreen('scan')} />
      ) : null}
      {screen === 'deck' ? <DeckScreen onDisconnect={disconnect} /> : null}
    </SafeAreaView>
  );
}

function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <AppShell />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default App;
