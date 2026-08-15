import { useEffect } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { OtpScreen, QrScreen } from './screens/PairingScreens';
import { useAppStore } from './store';

const App = () => {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const setSnapshot = useAppStore((s) => s.setSnapshot);
  const snapshot = useAppStore((s) => s.snapshot);
  const isMac = window.api.platform === 'darwin';

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
    return window.api.onSnapshot(setSnapshot);
  }, [setSnapshot, setView]);

  useEffect(() => {
    const step = snapshot?.pairing?.step;
    if (step === 'qr' || step === 'otp') {
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
      {view === 'otp' ? <OtpScreen /> : null}
      {view === 'home' ? <HomeScreen /> : null}
    </main>
  );
};

export default App;
