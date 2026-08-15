import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { DeckTile, DesktopApp } from '../../shared/ipc-types';
import { GRID_COLUMNS, GRID_ROWS, GRID_SLOTS, MAX_PAGES, deckPageCount, useAppStore } from '../store';
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

const tileFromApp = (app: DesktopApp): DeckTile => ({
  id: app.id,
  name: app.name,
  path: app.path,
  iconPath: app.iconPath,
});

export function HomeScreen() {
  const snapshot = useAppStore((s) => s.snapshot);
  const setSnapshot = useAppStore((s) => s.setSnapshot);
  const setView = useAppStore((s) => s.setView);
  const devices = snapshot?.devices ?? [];
  const active =
    devices.find((device) => device.id === snapshot?.activeDeviceId) ??
    devices[0];
  const tiles = snapshot?.tiles ?? Array.from({ length: GRID_SLOTS }, (): DeckTile | null => null);
  const pages = deckPageCount(tiles);
  const [apps, setApps] = useState<DesktopApp[] | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const loadedIcons = useRef(icons);
  loadedIcons.current = icons;
  const [query, setQuery] = useState('');
  const [overSlot, setOverSlot] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [dialog, setDialog] = useState<'logout' | 'about' | 'help' | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isMac = window.api.platform === 'darwin';
  const activePage = Math.min(page, pages - 1);

  useEffect(() => {
    void window.api.listApps().then(setApps);
  }, []);

  useEffect(() => {
    setPage(0);
    setSelectedSlot(null);
  }, [snapshot?.activeDeviceId]);

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
  const pageIndexes = Array.from({ length: pages }, (_, index) => index);

  const selectPage = (next: number) => {
    setPage(next);
    setSelectedSlot(null);
  };

  const addPage = () => {
    if (pages >= MAX_PAGES) {
      return;
    }
    void window.api.addPage().then((next) => {
      setSnapshot(next);
      selectPage(deckPageCount(next.tiles) - 1);
    });
  };

  const removePage = (index: number) => {
    void window.api.removePage(index).then((next) => {
      setSnapshot(next);
      selectPage(Math.min(activePage, Math.max(0, deckPageCount(next.tiles) - 1)));
    });
  };

  const dropOn = (index: number, event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setOverSlot(null);
    setSelectedSlot(null);
    const tile =
      parseTile(event.dataTransfer.getData(DRAG_TYPE)) ??
      parseTile(event.dataTransfer.getData('text/plain'));
    if (!tile) {
      return;
    }
    void window.api.setTile(index, tile).then(setSnapshot);
  };

  const assignApp = (app: DesktopApp) => {
    if (selectedSlot === null) {
      return;
    }
    void window.api.setTile(selectedSlot, tileFromApp(app)).then(setSnapshot);
    setSelectedSlot(null);
  };

  const logout = () => {
    if (!active) {
      return;
    }
    void window.api.removeDevice(active.id).then((next) => {
      setSnapshot(next);
      setDialog(null);
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
    <section className={`home-shell${isMac ? ' mac' : ''}`}>
      <aside className="sidebar">
        <DeviceSwitcher onLogout={() => setDialog('logout')} />

        <div className="pages">
          <h2>Pages</h2>
          <div className="page-list">
            {pageIndexes.map((index) => {
              const start = index * GRID_SLOTS;
              const pageFilled = tiles
                .slice(start, start + GRID_SLOTS)
                .filter(Boolean).length;
              return (
                <div
                  key={index}
                  className={`page-item${index === activePage ? ' active' : ''}`}
                >
                  <button
                    type="button"
                    className="page-select"
                    onClick={() => selectPage(index)}
                  >
                    <div className="page-mini" aria-hidden>
                      {slots.map((slot) => (
                        <span
                          key={slot}
                          className={
                            tiles[start + slot] ? 'filled' : undefined
                          }
                        />
                      ))}
                    </div>
                    <div className="page-copy">
                      <strong>Page {index + 1}</strong>
                      <em>
                        {pageFilled}/{GRID_SLOTS} apps
                      </em>
                    </div>
                  </button>
                  {pages > 1 ? (
                    <button
                      type="button"
                      className="page-remove"
                      aria-label={`Remove page ${index + 1}`}
                      onClick={() => removePage(index)}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="page-add"
            disabled={pages >= MAX_PAGES}
            onClick={addPage}
          >
            + Add page
          </button>
        </div>

        <div className="sidebar-foot">
          <button type="button" onClick={() => setDialog('about')}>
            <InfoIcon />
            About NudgeBoard v1.0
          </button>
          <button type="button" onClick={() => setDialog('help')}>
            <HelpIcon />
            Help &amp; Feedback
          </button>
        </div>
      </aside>

      <div className="stage">
        <header className="stage-head">
          <div>
            <h1>Deck</h1>
            <p>
              Page {activePage + 1} of {pages} · Click an empty slot or drag an
              app onto it
            </p>
          </div>
          {active?.connected ? (
            <span className="live-pill">
              <span className="dot on" />
              LIVE
            </span>
          ) : (
            <span className="live-pill dim">Offline</span>
          )}
        </header>

        <div className="phone-stage">
          <div className="phone">
            <div className="phone-bezel">
              <div className="phone-screen">
                <div
                  className="page-track"
                  style={{ transform: `translateX(-${activePage * 100}%)` }}
                >
                  {pageIndexes.map((pageIndex) => (
                    <div key={pageIndex} className="page-pane">
                      <div
                        className="slot-grid"
                        style={{
                          gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
                          gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, 1fr))`,
                        }}
                      >
                        {slots.map((slot) => {
                          const index = pageIndex * GRID_SLOTS + slot;
                          const tile = tiles[index];
                          const icon = tile
                            ? iconFor(tile.path, tile.id)
                            : undefined;
                          return (
                            <button
                              key={index}
                              type="button"
                              className={`slot${tile ? ' filled' : ''}${overSlot === index ? ' over' : ''}${selectedSlot === index ? ' selected' : ''}`}
                              aria-label={tile ? tile.name : 'Add app'}
                              aria-pressed={selectedSlot === index}
                              onClick={() => {
                                if (tile) {
                                  return;
                                }
                                const next =
                                  selectedSlot === index ? null : index;
                                setSelectedSlot(next);
                                if (next !== null) {
                                  searchRef.current?.focus();
                                }
                              }}
                              onDragOver={(event) => {
                                event.preventDefault();
                                setOverSlot(index);
                              }}
                              onDragLeave={() =>
                                setOverSlot((current) =>
                                  current === index ? null : current,
                                )
                              }
                              onDrop={(event) => dropOn(index, event)}
                            >
                              {tile ? (
                                <>
                                  {icon ? (
                                    <img
                                      alt=""
                                      className="slot-icon"
                                      src={icon}
                                      draggable={false}
                                    />
                                  ) : (
                                    <span className="slot-glyph">
                                      {[...tile.name][0]}
                                    </span>
                                  )}
                                  <span
                                    className="slot-clear"
                                    role="button"
                                    aria-label={`Remove ${tile.name}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void window.api
                                        .setTile(index, null)
                                        .then(setSnapshot);
                                    }}
                                  >
                                    ×
                                  </span>
                                </>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="page-dots">
            {pageIndexes.map((index) => (
              <button
                key={index}
                type="button"
                className={index === activePage ? 'on' : undefined}
                aria-label={`Page ${index + 1}`}
                aria-current={index === activePage}
                onClick={() => selectPage(index)}
              />
            ))}
          </div>
          {active ? (
            <p className={`mirror-line${active.connected ? ' live' : ''}`}>
              <span className={`dot ${active.connected ? 'on' : 'off'}`} />
              {active.connected
                ? `Deck on ${active.name}`
                : `${active.name} is saved — waiting to reconnect`}
            </p>
          ) : null}
        </div>

        <div className={`library${selectedSlot !== null ? ' picking' : ''}`}>
          <div className="library-head">
            <h2>{isMac ? 'Apps on this Mac' : 'Apps on this PC'}</h2>
            <div className="library-tools">
              <label className="search-field">
                <SearchIcon />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search"
                  aria-label="Search apps"
                />
              </label>
              <span className="app-count">
                {visible ? String(visible.length) : '…'}
              </span>
            </div>
          </div>
          <div className="app-list">
            {apps === null ? (
              <p className="lead app-list-status">Reading installed apps…</p>
            ) : apps.length === 0 ? (
              <p className="lead app-list-status">
                No apps were found on this computer.
              </p>
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
                    onClick={() => assignApp(app)}
                    onDragStart={(event) => {
                      const payload = JSON.stringify(tileFromApp(app));
                      event.dataTransfer.setData(DRAG_TYPE, payload);
                      event.dataTransfer.setData('text/plain', payload);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <span className="app-tile">
                      {icon ? (
                        <img
                          alt=""
                          className="app-icon"
                          src={icon}
                          draggable={false}
                        />
                      ) : (
                        <span className="app-glyph">{[...app.name][0]}</span>
                      )}
                    </span>
                    <span className="app-name">{app.name}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {dialog === 'logout' && active ? (
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
                onClick={() => setDialog(null)}
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

      {dialog === 'about' ? (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>NudgeBoard v1.0</h2>
            <p>
              A Stream Deck-style companion for iPhone and Android. Pair a
              phone, then drop apps onto the deck to launch them from your
              pocket.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDialog(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialog === 'help' ? (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Help &amp; Feedback</h2>
            <p>
              Click an empty slot, then click an app below — or drag an app
              onto the phone. Hover a filled slot and press × to clear it. Add
              more pages in the sidebar; swipe between them on the phone.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDialog(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.2" stroke="#5b9dff" strokeWidth="1.8" />
      <path
        d="M16 16.6 20 20.5"
        stroke="#5b9dff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 11.2v5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="8.2" r="0.9" fill="currentColor" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M9.6 9.4a2.4 2.4 0 1 1 3.3 2.2c-.7.4-1.1.9-1.1 1.7v.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.4" r="0.8" fill="currentColor" />
    </svg>
  );
}
