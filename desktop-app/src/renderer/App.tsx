import { useEffect, useState } from 'react';
import type { BridgeSnapshot } from '../shared/ipc-types';

const App = () => {
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
  const isMac = window.api.platform === 'darwin';
  const connected = snapshot?.connected ?? [];

  useEffect(() => {
    void window.api.getSnapshot().then(setSnapshot);
    return window.api.onSnapshot(setSnapshot);
  }, []);

  return (
    <main className={isMac ? 'app mac' : 'app'}>
      <h1>Nudgeboard</h1>
      <p className="lead">
        Generate a QR code, scan it on your phone, then enter the OTP shown here.
      </p>

      <button
        type="button"
        className="primary"
        onClick={() => void window.api.generateQr()}
      >
        Generate QR
      </button>

      {snapshot?.pairing ? (
        <section className="card pairing">
          <img alt="Pairing QR code" src={snapshot.pairing.qrDataUrl} />
          <div>
            <p className="muted">OTP</p>
            <p className="otp">{snapshot.pairing.otp}</p>
            <p className="muted">
              {snapshot.pairing.payload.host}:{snapshot.pairing.payload.port}
            </p>
          </div>
        </section>
      ) : null}

      {connected.length > 0 ? (
        <section className="devices">
          {connected.map((device) => (
            <div key={device.id} className="device">
              <strong>{device.name}</strong>
              <span>
                {device.model} · {device.os}
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
};

export default App;
