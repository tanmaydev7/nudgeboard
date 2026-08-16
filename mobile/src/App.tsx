import { useEffect, useRef, useState } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { findPairingHost } from './lan';
import { connectBridge, getDeviceInfo } from './pairing';
import {
  isPrivateLanHost,
  type ClientMessage,
  type WidgetActionType,
} from './protocol';
import { DeckScreen } from './screens/DeckScreen';
import { ManualCodeScreen } from './screens/ManualCodeScreen';
import { PairCodeScreen } from './screens/PairCodeScreen';
import { ProfilesScreen } from './screens/ProfilesScreen';
import { ScanScreen } from './screens/ScanScreen';
import { useAppStore } from './store';
import { colors, usePalette } from './theme';

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
  const pin = useAppStore((s) => s.pin);
  const activeFingerprint = useAppStore((s) => s.activeFingerprint);
  const finishPairing = useAppStore((s) => s.finishPairing);
  const markDisconnected = useAppStore((s) => s.markDisconnected);
  const setError = useAppStore((s) => s.setError);
  const setStatus = useAppStore((s) => s.setStatus);
  const setDeck = useAppStore((s) => s.setDeck);
  const setMediaState = useAppStore((s) => s.setMediaState);
  const setVolumeState = useAppStore((s) => s.setVolumeState);

  const disconnect = () => {
    connectionRef.current?.close();
    connectionRef.current = null;
  };

  const logout = () => {
    connectionRef.current?.send({ type: 'logout' });
    const connection = connectionRef.current;
    setTimeout(() => {
      if (connectionRef.current === connection) {
        disconnect();
      }
    }, 250);
  };

  const pressTile = (id: string) => {
    connectionRef.current?.send({ type: 'press', id });
  };

  const triggerWidgetAction = (action: WidgetActionType, value?: number) => {
    connectionRef.current?.send({ type: 'widget_action', action, value });
  };

  useEffect(() => {
    if (status !== 'connecting') {
      return;
    }

    const device = getDeviceInfo();
    let cancelled = false;

    const attach = (
      host: string,
      port: number,
      message: ClientMessage,
      knownToken?: string,
    ) => {
      if (cancelled) {
        return;
      }
      if (!isPrivateLanHost(host)) {
        setError('That computer address is not on your local network.');
        setStatus('idle');
        return;
      }
      connectionRef.current?.close();
      const session = connectBridge(
        host,
        port,
        message,
        {
          onConnected: (ok) => {
            if (connectionRef.current !== session) {
              return;
            }
            finishPairing(ok.hostName, {
              fingerprint: ok.fingerprint,
              token: ok.token,
              host: ok.host || host,
              port: ok.port || port,
              os: ok.os,
            });
          },
          onDeck: (tiles) => {
            if (connectionRef.current !== session) {
              return;
            }
            setDeck(tiles);
          },
          onMediaState: (media) => {
            if (connectionRef.current !== session) {
              return;
            }
            setMediaState(media);
          },
          onVolumeState: (vol) => {
            if (connectionRef.current !== session) {
              return;
            }
            setVolumeState(vol);
          },
          onError: (reason) => {
            if (connectionRef.current !== session) {
              return;
            }
            if (reason.includes('does not recognize')) {
              const fingerprint = useAppStore.getState().activeFingerprint;
              if (fingerprint) {
                useAppStore.getState().removeProfile(fingerprint);
              }
              return;
            }
            setError(reason);
            setStatus('idle');
          },
          onLoggedOut: () => {
            if (connectionRef.current !== session) {
              return;
            }
            const fingerprint = useAppStore.getState().activeFingerprint;
            if (fingerprint) {
              useAppStore.getState().removeProfile(fingerprint);
            }
          },
          onClose: () => {
            if (connectionRef.current !== session) {
              return;
            }
            if (useAppStore.getState().status === 'connected') {
              markDisconnected();
            }
          },
        },
        knownToken,
      );
      connectionRef.current = session;
    };

    if (pairing) {
      attach(pairing.payload.host, pairing.payload.port, {
        type: 'hello',
        token: pairing.payload.token,
        otp: pairing.otp,
        device,
      });
    } else if (pin) {
      void findPairingHost().then((found) => {
        if (cancelled) {
          return;
        }
        if (!found) {
          setError(
            'No pairing PC found. Check the code and that you are on the same Wi-Fi.',
          );
          setStatus('idle');
          return;
        }
        attach(found.host, found.port, {
          type: 'hello_pin',
          pin,
          device,
        });
      });
    } else {
      const profile = useAppStore
        .getState()
        .profiles.find((item) => item.fingerprint === activeFingerprint);
      if (!profile) {
        setStatus('idle');
        return;
      }
      attach(
        profile.host,
        profile.port,
        {
          type: 'reconnect',
          token: profile.token,
          device,
        },
        profile.token,
      );
    }

    return () => {
      cancelled = true;
    };
  }, [
    status,
    pairing,
    pin,
    activeFingerprint,
    finishPairing,
    markDisconnected,
    setError,
    setStatus,
    setDeck,
    setMediaState,
    setVolumeState,
  ]);

  return { disconnect, logout, pressTile, triggerWidgetAction };
}

function AppShell() {
  const hydrated = useHydrated();
  const palette = usePalette();

  if (!hydrated) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: palette.background }}
      />
    );
  }

  return <ReadyApp />;
}

function ReadyApp() {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const cancelPairing = useAppStore((s) => s.cancelPairing);
  const palette = usePalette();
  const { disconnect, logout, pressTile, triggerWidgetAction } =
    useBridgeConnection();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: palette.background }}
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
      {screen === 'deck' ? (
        <DeckScreen
          onDisconnect={disconnect}
          onLogout={logout}
          onPressTile={pressTile}
          onWidgetAction={triggerWidgetAction}
        />
      ) : null}
    </SafeAreaView>
  );
}

function App() {
  const theme = useAppStore((s) => s.theme);
  return (
    <GestureHandlerRootView
      style={[styles.root, { backgroundColor: colors[theme].background }]}
    >
      <SafeAreaProvider>
        <StatusBar
          barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
        />
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
