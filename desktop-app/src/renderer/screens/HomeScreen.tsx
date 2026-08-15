import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { DeckTile, DesktopApp } from '../../shared/ipc-types';
import { GRID_COLUMNS, GRID_SLOTS, useAppStore } from '../store';
import { DeviceSwitcher } from './DeviceSwitcher';

const DRAG_TYPE = 'application/x-nudgeboard-app';

const parseTile = (raw: string): DeckTile | null => {
  try {
    const value = JSON.parse(raw) as Partial<DeckTile>;
    if (
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      typeof value.path === 'string'
    ) {
      return {
        id: value.id,
        name: value.name,
        path: value.path,
        iconPath:
          typeof value.iconPath === 'string' ? value.iconPath : undefined,
      };
    }
  } catch {
    return null;
  }
  return null;
};

export function HomeScreen() {
  const snapshot = useAppStore((s) => s.snapshot);
  const setSnapshot = useAppStore((s) => s.setSnapshot);
  const setView = useAppStore((s) => s.setView);
  const devices = snapshot?.devices ?? [];
  const active =
    devices.find((device) => device.id === snapshot?.activeDeviceId) ??
    devices[0];
  const tiles = snapshot?.tiles ?? Array.from({ length: GRID_SLOTS }, (): DeckTile | null => null);
  const [apps, setApps] = useState<DesktopApp[] | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const loadedIcons = useRef(icons);
  loadedIcons.current = icons;
  const [query, setQuery] = useState('');
  const [overSlot, setOverSlot] = useState<number | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    void window.api.listApps().then(setApps);
  }, []);

  const tileKey = useMemo(
    () => tiles.map((tile) => tile?.path ?? '').join('\0'),
    [tiles],
  );

  useEffect(() => {
    if (!apps) {
      return;
    }
    let cancelled = false;
    const wanted: string[] = [];
    const seen = new Set<string>();
    const push = (path: string) => {
      if (!path || seen.has(path) || loadedIcons.current[path]) {
        return;
      }
      seen.add(path);
      wanted.push(path);
    };
    for (const desktopApp of apps) {
      push(desktopApp.iconPath ?? desktopApp.path);
    }
    for (const tile of tiles) {
      if (!tile) {
        continue;
      }
      const match = apps.find(
        (item) => item.id === tile.id || item.path === tile.path,
      );
      push(match?.iconPath ?? tile.path);
    }

    const load = async () => {
      const chunkSize = 8;
      for (let index = 0; index < wanted.length; index += chunkSize) {
        if (cancelled) {
          return;
        }
        const batch = await window.api.getAppIcons(
          wanted.slice(index, index + chunkSize),
        );
        if (cancelled) {
          return;
        }
        setIcons((prev) => ({ ...prev, ...batch }));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [apps, tileKey]);

  const iconByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const desktopApp of apps ?? []) {
      const url =
        icons[desktopApp.iconPath ?? desktopApp.path] ?? icons[desktopApp.path];
      if (!url) {
        continue;
      }
      map.set(desktopApp.id, url);
      map.set(desktopApp.path, url);
    }
    return map;
  }, [apps, icons]);

  const iconFor = (path: string, id?: string) =>
    (id ? iconByKey.get(id) : undefined) ?? iconByKey.get(path) ?? icons[path];

  const visible = useMemo(() => {
    if (!apps) {
      return null;
    }
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return apps;
    }
    return apps.filter((app) => app.name.toLowerCase().includes(needle));
  }, [apps, query]);

  const slots = Array.from({ length: GRID_SLOTS }, (_, index) => index);

  const dropOn = (index: number, event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setOverSlot(null);
    const tile =
      parseTile(event.dataTransfer.getData(DRAG_TYPE)) ??
      parseTile(event.dataTransfer.getData('text/plain'));
    if (!tile) {
      return;
    }
    void window.api.setTile(index, tile).then(setSnapshot);
  };

  const logout = () => {
    if (!active) {
      return;
    }
    void window.api.removeDevice(active.id).then((next) => {
      setSnapshot(next);
      setConfirmLogout(false);
      if (next.devices.length > 0) {
        return;
      }
      void window.api.generateQr().then((pairing) => {
        setSnapshot(pairing);
        setView('qr');
      });
    });
  };

  return (
    <section className="panel home">
      <header className="home-bar">
        <div className="brand">
          <span className="brand-mark" />
          NudgeBoard
        </div>
        <div className="home-tools">
          <DeviceSwitcher />
          {active ? (
            <button
              type="button"
              className="btn-logout"
              onClick={() => setConfirmLogout(true)}
            >
              Log out
            </button>
          ) : null}
        </div>
      </header>

      {active ? (
        <p className={`status-line ${active.connected ? 'live' : ''}`}>
          <span className={`dot ${active.connected ? 'on' : 'off'}`} />
          {active.connected
            ? `${active.name} is on the LAN`
            : `${active.name} is saved — waiting to reconnect`}
        </p>
      ) : null}

      <div
        className="slot-grid"
        style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)` }}
      >
        {slots.map((slot) => {
          const tile = tiles[slot];
          const icon = tile ? iconFor(tile.path, tile.id) : undefined;
          return (
            <button
              key={slot}
              type="button"
              className={`slot${tile ? ' filled' : ''}${overSlot === slot ? ' over' : ''}`}
              aria-label={tile ? tile.name : 'Add tile'}
              onDragOver={(event) => {
                event.preventDefault();
                setOverSlot(slot);
              }}
              onDragLeave={() => setOverSlot((current) => (current === slot ? null : current))}
              onDrop={(event) => dropOn(slot, event)}
            >
              {tile ? (
                <>
                  {icon ? (
                    <img alt="" className="slot-icon" src={icon} />
                  ) : (
                    <span className="slot-glyph">{[...tile.name][0]}</span>
                  )}
                  <span className="slot-name">{tile.name}</span>
                  <span
                    className="slot-clear"
                    role="button"
                    aria-label={`Remove ${tile.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void window.api.setTile(slot, null).then(setSnapshot);
                    }}
                  >
                    ×
                  </span>
                </>
              ) : (
                '+'
              )}
            </button>
          );
        })}
      </div>

      <div className="app-list-header">
        <h2>Apps on this PC</h2>
        <span>{visible ? String(visible.length) : '…'}</span>
      </div>
      <input
        className="app-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search apps"
        aria-label="Search apps"
      />
      <div className="app-list">
        {apps === null ? (
          <p className="lead app-list-status">Reading installed apps…</p>
        ) : apps.length === 0 ? (
          <p className="lead app-list-status">No apps were found on this computer.</p>
        ) : visible && visible.length === 0 ? (
          <p className="lead app-list-status">No apps match that search.</p>
        ) : (
          visible?.map((app) => {
            const icon = iconFor(app.path, app.id);
            return (
              <div
                key={app.id}
                className="app-row"
                title={app.path}
                draggable
                onDragStart={(event) => {
                  const payload = JSON.stringify({
                    id: app.id,
                    name: app.name,
                    path: app.path,
                    iconPath: app.iconPath,
                  });
                  event.dataTransfer.setData(DRAG_TYPE, payload);
                  event.dataTransfer.setData('text/plain', payload);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
              >
                {icon ? (
                  <img alt="" className="app-icon" src={icon} />
                ) : (
                  <span className="app-glyph">{[...app.name][0]}</span>
                )}
                <span className="app-name">{app.name}</span>
              </div>
            );
          })
        )}
      </div>

      {confirmLogout && active ? (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Log out {active.name}?</h2>
            <p>
              This removes the phone from this computer. You can pair it again
              later.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmLogout(false)}
              >
                Cancel
              </button>
              <button type="button" className="btn-danger" onClick={logout}>
                Log out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
