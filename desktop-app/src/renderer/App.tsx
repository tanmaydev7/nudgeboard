import { useEffect } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { OtpScreen, QrScreen } from './screens/PairingScreens';
import { ThemeToggle } from './screens/ThemeToggle';
import { useAppStore } from './store';

const App = () => {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const setSnapshot = useAppStore((s) => s.setSnapshot);
  const setMediaState = useAppStore((s) => s.setMediaState);
  const setVolumeState = useAppStore((s) => s.setVolumeState);
  const snapshot = useAppStore((s) => s.snapshot);
  const appearance = snapshot?.appearance ?? 'dark';
  const isMac = window.api.platform === 'darwin';

  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
    document.documentElement.style.colorScheme = appearance;
  }, [appearance]);

  useEffect(() => {
    void window.api.getSnapshot().then((next) => {
      setSnapshot(next);
      if (next.devices.length > 0) {
        setView('home');
        return;
      }
      void window.api.generateQr().then((pairing) => {
        setSnapshot(pairing);
        setView('qr');
      });
    });
    const unsubSnap = window.api.onSnapshot(setSnapshot);
    const unsubMedia = window.api.onMediaState?.(setMediaState);
    const unsubVol = window.api.onVolumeState?.(setVolumeState);
    return () => {
      unsubSnap();
      unsubMedia?.();
      unsubVol?.();
    };
  }, [setSnapshot, setView, setMediaState, setVolumeState]);

  useEffect(() => {
    const step = snapshot?.pairing?.step;
    if (step === 'qr' || step === 'otp' || step === 'confirm') {
      setView(step);
      return;
    }
    if ((snapshot?.devices.length ?? 0) > 0) {
      setView('home');
    }
  }, [snapshot?.pairing?.step, snapshot?.devices.length, setView]);

  return (
    <main className={isMac ? `shell mac ${view}` : `shell win ${view}`}>
      {isMac ? null : (
        <div className="titlebar">
          <span className="titlebar-name">NudgeBoard</span>
        </div>
      )}
      {view === 'qr' ? <QrScreen /> : null}
      {view === 'otp' || view === 'confirm' ? <OtpScreen /> : null}
      {view === 'home' ? <HomeScreen /> : null}
      <ThemeToggle />
    </main>
  );
};

export default App;
