import { useEffect, useRef, useState } from 'react';
import type { DeviceProfile } from '../../shared/ipc-types';
import { useAppStore } from '../store';

type Props = {
  onLogout?: () => void;
};

export function DeviceSwitcher({ onLogout }: Props) {
  const snapshot = useAppStore((s) => s.snapshot);
  const setView = useAppStore((s) => s.setView);
  const setSnapshot = useAppStore((s) => s.setSnapshot);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const devices = snapshot?.devices ?? [];
  const active =
    devices.find((device) => device.id === snapshot?.activeDeviceId) ??
    devices[0];

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointer);
    return () => window.removeEventListener('mousedown', onPointer);
  }, [open]);

  const addDevice = () => {
    setOpen(false);
    void window.api.generateQr().then((next) => {
      setSnapshot(next);
      setView('qr');
    });
  };

  const select = (device: DeviceProfile) => {
    setOpen(false);
    void window.api.setActiveDevice(device.id).then(setSnapshot);
  };

  return (
    <div className="switcher" ref={rootRef}>
      <button
        type="button"
        className="device-card"
        onClick={() => setOpen((value) => !value)}
      >
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
        <span className="device-meta">
          <strong className="device-name">
            {active?.name ?? 'No phone'}
          </strong>
          <em className={`device-status${active?.connected ? ' on' : ''}`}>
            <span className={`dot ${active?.connected ? 'on' : 'off'}`} />
            {active?.connected ? 'Connected' : 'Waiting'}
            {active?.model && active.model !== active.name ? (
              <span className="device-id"> · {active.model}</span>
            ) : null}
          </em>
        </span>
      </button>
      {open ? (
        <div className="switcher-menu">
          {devices.length === 0 ? (
            <p className="switcher-empty">No phones paired yet</p>
          ) : (
            devices.map((device) => (
              <button
                key={device.id}
                type="button"
                className={`switcher-item${device.id === active?.id ? ' active' : ''}`}
                onClick={() => select(device)}
              >
                <span>
                  <strong>{device.name}</strong>
                  <em>
                    {device.connected ? 'Connected' : 'Disconnected'}
                    {device.model ? ` · ${device.model}` : ''}
                  </em>
                </span>
                <span className={`dot ${device.connected ? 'on' : 'off'}`} />
              </button>
            ))
          )}
          <button type="button" className="switcher-add" onClick={addDevice}>
            + Add a phone
          </button>
          {active && onLogout ? (
            <button
              type="button"
              className="switcher-logout"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              Log out
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
