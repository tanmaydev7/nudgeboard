import { useState } from 'react';
import { useAppStore } from '../store';
import { useCountdown } from '../useCountdown';
import { StepProgress } from './StepProgress';

const closePairing = () => {
  const { setView, setSnapshot } = useAppStore.getState();
  void window.api.cancelPairing().then((snapshot) => {
    setSnapshot(snapshot);
    if (snapshot.devices.length > 0) {
      setView('home');
      return;
    }
    void window.api.generateQr().then((next) => {
      setSnapshot(next);
      setView('qr');
    });
  });
};

export function QrScreen() {
  const snapshot = useAppStore((s) => s.snapshot);
  const setSnapshot = useAppStore((s) => s.setSnapshot);
  const pairing = snapshot?.pairing;
  const { remaining, expired } = useCountdown(pairing?.expiresAt);
  const [manual, setManual] = useState(false);
  const hasDevices = (snapshot?.devices.length ?? 0) > 0;

  return (
    <section className="panel pairing">
      {hasDevices ? (
        <button
          type="button"
          className="icon-close"
          aria-label="Close"
          onClick={closePairing}
        >
          ×
        </button>
      ) : null}
      <StepProgress step={1} total={2} />
      <h1>Scan this with the NudgeBoard app.</h1>
      <p className="hint">
        Keep your phone and this PC on the same Wi-Fi while you scan and use
        the app.
      </p>
      {pairing ? (
        <div className="qr-wrap">
          <img alt="Pairing QR code" src={pairing.qrDataUrl} />
          <span className="qr-badge" />
        </div>
      ) : null}
      <p className={`timer-row${expired ? ' expired' : ''}`}>
        {expired ? 'Expired' : `expires in ${remaining}`}
        <button
          type="button"
          className="link"
          onClick={() => void window.api.generateQr().then(setSnapshot)}
        >
          &nbsp;· Regenerate
        </button>
      </p>
      <div className="manual-bar">
        <span>Camera not handy?</span>
        <button
          type="button"
          className="link"
          onClick={() => setManual((open) => !open)}
        >
          {manual ? 'Hide code' : 'Show 6-digit code'}
        </button>
      </div>
      {manual && pairing ? (
        expired ? (
          <p className="timer-row expired">Expired</p>
        ) : (
          <OtpBoxes value={pairing.pairingCode} readOnly />
        )
      ) : null}
    </section>
  );
}

export function OtpScreen() {
  const snapshot = useAppStore((s) => s.snapshot);
  const setSnapshot = useAppStore((s) => s.setSnapshot);
  const setView = useAppStore((s) => s.setView);
  const pairing = snapshot?.pairing;
  const { remaining, expired } = useCountdown(pairing?.expiresAt);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);

  const verify = () => {
    if (otp.length !== 6) {
      return;
    }
    void window.api.verifyOtp(otp).then((result) => {
      if (result.ok === false) {
        setError(result.reason);
        return;
      }
      setSnapshot(result.snapshot);
      setView('home');
    });
  };

  const acceptPin = () => {
    void window.api.acceptPending().then((result) => {
      if (result.ok === false) {
        setError(result.reason);
        return;
      }
      setSnapshot(result.snapshot);
      setView('home');
    });
  };

  const pinConfirm = pairing?.step === 'confirm' || pairing?.pending?.via === 'pin';

  return (
    <section className="panel pairing">
      <button
        type="button"
        className="icon-close"
        aria-label="Close"
        onClick={closePairing}
      >
        ×
      </button>
      <StepProgress step={2} total={2} />
      <h1>
        {pinConfirm
          ? 'Trust this phone?'
          : 'Enter the 6 digits from your phone.'}
      </h1>
      <p className="hint">
        {pinConfirm
          ? 'This device typed your 6-digit code. Confirm it is yours before it can control this PC.'
          : 'Keep your phone and this PC on the same Wi-Fi while you pair and use the app.'}
      </p>
      {pairing?.pending ? (
        <div className="pending-card">
          <span className="device-glyph" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
              <rect
                x="7"
                y="2"
                width="10"
                height="20"
                rx="2.4"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M10 4.4h4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <div className="pending-card-body">
            <strong>{pairing.pending.name}</strong>
            {pairing.pending.model && pairing.pending.model !== pairing.pending.name ? (
              <em>{pairing.pending.model}</em>
            ) : null}
            <span className="fp">{pairing.pending.fingerprint}</span>
            {pairing.pending.ip ? <span>{pairing.pending.ip}</span> : null}
          </div>
        </div>
      ) : null}
      {pinConfirm ? null : (
        <OtpBoxes
          value={otp}
          onChange={(next) => {
            setError(null);
            setOtp(next);
          }}
        />
      )}
      <div className={`timer-row split${expired ? ' expired' : ''}`}>
        <span>{expired ? 'Expired' : `code expires in ${remaining}`}</span>
        <button
          type="button"
          className="link"
          onClick={() => void window.api.generateQr().then(setSnapshot)}
        >
          {pinConfirm ? 'Reject' : 'Resend'}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {pinConfirm ? (
        <button
          type="button"
          className="btn-primary"
          disabled={!pairing?.pending}
          onClick={acceptPin}
        >
          Trust this phone
        </button>
      ) : (
        <button
          type="button"
          className="btn-primary"
          disabled={otp.length !== 6}
          onClick={verify}
        >
          Verify &amp; connect
        </button>
      )}
    </section>
  );
}

function OtpBoxes({
  value,
  onChange,
  readOnly = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');

  return (
    <div className="otp-boxes">
      {digits.map((digit, index) => {
        const filled = digit.trim() !== '';
        const active = !readOnly && index === value.length;
        return (
          <span
            key={index}
            className={`otp-box${filled ? ' filled' : ''}${active ? ' active' : ''}`}
          >
            {filled ? digit : active ? <i className="caret" /> : ''}
          </span>
        );
      })}
      {readOnly ? null : (
        <input
          aria-label="Six-digit pairing code"
          autoFocus
          className="otp-hidden"
          inputMode="numeric"
          maxLength={6}
          value={value}
          onChange={(event) =>
            onChange?.(event.target.value.replace(/\D/g, '').slice(0, 6))
          }
        />
      )}
    </div>
  );
}
