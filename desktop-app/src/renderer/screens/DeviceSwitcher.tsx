import { useEffect, useRef, useState } from 'react';
import type { DeviceProfile } from '../../shared/ipc-types';
import { useAppStore } from '../store';

export function DeviceSwitcher() {
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
        className="switcher-trigger"
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className={`dot ${active?.connected ? 'on' : 'off'}`}
        />
        <span className="switcher-name">
          {active?.name ?? 'No phone'}
        </span>
        <span className="caret-down">▾</span>
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
                    {device.connected ? 'Connected' : 'Disconnected'} ·{' '}
                    {device.fingerprint}
                  </em>
                </span>
                <span className={`dot ${device.connected ? 'on' : 'off'}`} />
              </button>
            ))
          )}
          <button type="button" className="switcher-add" onClick={addDevice}>
            + Add a phone
          </button>
        </div>
      ) : null}
    </div>
  );
}
