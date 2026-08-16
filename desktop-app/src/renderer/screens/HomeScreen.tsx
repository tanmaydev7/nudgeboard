import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  LuLayoutGrid,
  LuWrench,
  LuTerminal,
  LuPencil,
  LuSearch,
  LuInfo,
  LuCircleHelp,
  LuPlus,
  LuX,
} from 'react-icons/lu';
import {
  UTILITY_ITEMS,
  type CustomFlow,
  type DeckTile,
  type DesktopApp,
  type UtilityItem,
} from '../../shared/ipc-types';
import {
  GRID_COLUMNS,
  GRID_ROWS,
  GRID_SLOTS,
  MAX_PAGES,
  deckPageCount,
  useAppStore,
} from '../store';
import { CustomFlowModal } from './CustomFlowModal';
import { DeviceSwitcher } from './DeviceSwitcher';

const DRAG_TYPE = 'application/x-nudgeboard-app';

type LibraryTab = 'apps' | 'utilities' | 'custom';

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
        tileType: value.tileType,
        utilityAction: value.utilityAction,
        customFlow: value.customFlow,
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
  tileType: 'app',
});

const tileFromUtility = (item: UtilityItem): DeckTile => ({
  id: `utility_${item.id}`,
  name: item.name,
  path: `utility:${item.id}`,
  iconPath: `utility:${item.id}`,
  tileType: 'utility',
  utilityAction: item.id,
});

const tileFromCustomFlow = (flow: CustomFlow): DeckTile => ({
  id: flow.id,
  name: flow.name,
  path: `custom:${flow.id}`,
  iconPath:
    flow.iconPath ??
    (flow.iconPreset ? `preset:${flow.iconPreset}` : 'preset:terminal'),
  tileType: 'custom',
  customFlow: flow,
});

export function HomeScreen() {
  const snapshot = useAppStore((s) => s.snapshot);
  const setSnapshot = useAppStore((s) => s.setSnapshot);
  const setView = useAppStore((s) => s.setView);
  const devices = snapshot?.devices ?? [];
  const active =
    devices.find((device) => device.id === snapshot?.activeDeviceId) ??
    devices[0];
  const tiles =
    snapshot?.tiles ??
    Array.from({ length: GRID_SLOTS }, (): DeckTile | null => null);
  const customFlows = snapshot?.customFlows ?? [];
  const pages = deckPageCount(tiles);
  const [tab, setTab] = useState<LibraryTab>('apps');
  const [apps, setApps] = useState<DesktopApp[] | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [utilityIcons, setUtilityIcons] = useState<Record<string, string>>({});
  const [presetIcons, setPresetIcons] = useState<Record<string, string>>({});
  const loadedIcons = useRef(icons);
  loadedIcons.current = icons;
  const [query, setQuery] = useState('');
  const [overSlot, setOverSlot] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [dialog, setDialog] = useState<'logout' | 'about' | 'help' | null>(null);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<CustomFlow | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isMac = window.api.platform === 'darwin';
  const activePage = Math.min(page, pages - 1);

  useEffect(() => {
    void window.api.listApps().then(setApps);
    void window.api.getUtilityIcons().then(setUtilityIcons);
    void window.api.getPresetIcons().then(setPresetIcons);
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
      if (
        !path ||
        seen.has(path) ||
        loadedIcons.current[path] ||
        path.startsWith('utility:') ||
        path.startsWith('preset:')
      ) {
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
      if (tile.tileType === 'app' || (!tile.tileType && !tile.path.includes(':'))) {
        const match = apps.find(
          (item) => item.id === tile.id || item.path === tile.path,
        );
        push(match?.iconPath ?? tile.path);
      } else if (tile.customFlow?.iconPath) {
        push(tile.customFlow.iconPath);
      }
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

  const iconFor = (
    path: string,
    id?: string,
    tile?: DeckTile | null,
  ): string | undefined => {
    if (
      tile?.tileType === 'utility' ||
      tile?.utilityAction ||
      path.startsWith('utility:')
    ) {
      const action =
        tile?.utilityAction ?? path.replace(/^utility:/, '');
      return utilityIcons[action] ?? utilityIcons[`utility:${action}`];
    }

    if (
      tile?.tileType === 'custom' ||
      tile?.customFlow ||
      path.startsWith('custom:')
    ) {
      const flow =
        tile?.customFlow ?? customFlows.find((f) => f.id === tile?.id);
      if (flow?.iconDataUrl) {
        return flow.iconDataUrl;
      }
      if (flow?.iconPreset && presetIcons[flow.iconPreset]) {
        return presetIcons[flow.iconPreset];
      }
      if (flow?.iconPath && icons[flow.iconPath]) {
        return icons[flow.iconPath];
      }
      if (tile?.iconPath) {
        const clean = tile.iconPath.replace(/^preset:/, '');
        if (presetIcons[clean]) {
          return presetIcons[clean];
        }
        if (icons[tile.iconPath]) {
          return icons[tile.iconPath];
        }
      }
      return presetIcons['terminal'];
    }

    return (
      (id ? iconByKey.get(id) : undefined) ??
      iconByKey.get(path) ??
      icons[path]
    );
  };

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

  const assignTile = (tile: DeckTile) => {
    if (selectedSlot === null) {
      return;
    }
    void window.api.setTile(selectedSlot, tile).then(setSnapshot);
    setSelectedSlot(null);
  };

  const handleSaveCustomFlow = (flow: CustomFlow) => {
    void window.api.saveCustomFlow(flow).then(setSnapshot);
    setCustomModalOpen(false);
    setEditingFlow(null);
  };

  const handleDeleteCustomFlow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    void window.api.deleteCustomFlow(id).then(setSnapshot);
  };

  const handleEditCustomFlow = (flow: CustomFlow, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFlow(flow);
    setCustomModalOpen(true);
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
    <section className={`home-shell${isMac ? ' mac' : ' win'}`}>
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
            <LuInfo size={15} />
            About NudgeBoard v1.0
          </button>
          <button type="button" onClick={() => setDialog('help')}>
            <LuCircleHelp size={15} />
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
              app, utility, or custom flow onto it. Stay on the same Wi-Fi.
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
                            ? iconFor(tile.path, tile.id, tile)
                            : undefined;
                          return (
                            <button
                              key={index}
                              type="button"
                              className={`slot${tile ? ' filled' : ''}${overSlot === index ? ' over' : ''}${selectedSlot === index ? ' selected' : ''}`}
                              aria-label={tile ? tile.name : 'Add item to slot'}
                              aria-pressed={selectedSlot === index}
                              onClick={() => {
                                if (tile) {
                                  return;
                                }
                                const next =
                                  selectedSlot === index ? null : index;
                                setSelectedSlot(next);
                                if (next !== null && tab === 'apps') {
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

        {/* 3-Tab Library Section */}
        <div className={`library${selectedSlot !== null ? ' picking' : ''}`}>
          <div className="library-head">
            <div className="library-tabs">
              <button
                type="button"
                className={`tab-btn${tab === 'apps' ? ' active' : ''}`}
                onClick={() => setTab('apps')}
              >
                <LuLayoutGrid size={15} />
                <span>{isMac ? 'Apps on this Mac' : 'Apps on this PC'}</span>
                <span className="tab-badge">
                  {visible ? String(visible.length) : '…'}
                </span>
              </button>

              <button
                type="button"
                className={`tab-btn${tab === 'utilities' ? ' active' : ''}`}
                onClick={() => setTab('utilities')}
              >
                <LuWrench size={15} />
                <span>Utilities</span>
                <span className="tab-badge">{UTILITY_ITEMS.length}</span>
              </button>

              <button
                type="button"
                className={`tab-btn${tab === 'custom' ? ' active' : ''}`}
                onClick={() => setTab('custom')}
              >
                <LuTerminal size={15} />
                <span>Custom</span>
                <span className="tab-badge">{customFlows.length}</span>
              </button>
            </div>

            {tab === 'apps' ? (
              <div className="library-tools">
                <label className="search-field">
                  <LuSearch size={14} />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search apps"
                    aria-label="Search apps"
                  />
                </label>
              </div>
            ) : null}

            {tab === 'custom' ? (
              <button
                type="button"
                className="btn-create-flow"
                onClick={() => {
                  setEditingFlow(null);
                  setCustomModalOpen(true);
                }}
              >
                <LuPlus size={14} /> Create Flow
              </button>
            ) : null}
          </div>

          {/* Tab 1: Apps */}
          {tab === 'apps' ? (
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
                      onClick={() => assignTile(tileFromApp(app))}
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
          ) : null}

          {/* Tab 2: Utilities */}
          {tab === 'utilities' ? (
            <div className="utilities-list">
              {UTILITY_ITEMS.map((item) => {
                const icon =
                  utilityIcons[item.id] ?? utilityIcons[`utility:${item.id}`];
                const tile = tileFromUtility(item);
                return (
                  <div
                    key={item.id}
                    className="app-row utility-row"
                    title={item.description}
                    draggable
                    onClick={() => assignTile(tile)}
                    onDragStart={(event) => {
                      const payload = JSON.stringify(tile);
                      event.dataTransfer.setData(DRAG_TYPE, payload);
                      event.dataTransfer.setData('text/plain', payload);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <span className="app-tile utility-tile">
                      {icon ? (
                        <img
                          alt=""
                          className="app-icon"
                          src={icon}
                          draggable={false}
                        />
                      ) : (
                        <span className="app-glyph">⚡</span>
                      )}
                    </span>
                    <span className="app-name">{item.name}</span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Tab 3: Custom Actions / Flows */}
          {tab === 'custom' ? (
            <div className="custom-flows-container">
              {customFlows.length === 0 ? (
                <div className="custom-empty-state">
                  <div className="custom-empty-icon">
                    <LuTerminal size={24} />
                  </div>
                  <h3>No custom flows yet</h3>
                  <p>
                    Create multi-step actions to open files, launch terminals,
                    and trigger recorded keyboard shortcuts in sequence.
                  </p>
                  <button
                    type="button"
                    className="btn-primary custom-empty-btn"
                    onClick={() => {
                      setEditingFlow(null);
                      setCustomModalOpen(true);
                    }}
                  >
                    + Create Your First Flow
                  </button>
                </div>
              ) : (
                <div className="custom-flow-grid">
                  {customFlows.map((flow) => {
                    const icon =
                      flow.iconDataUrl ||
                      (flow.iconPreset ? presetIcons[flow.iconPreset] : undefined) ||
                      (flow.iconPath ? icons[flow.iconPath] : undefined) ||
                      presetIcons['terminal'];
                    const tile = tileFromCustomFlow(flow);
                    const stepCount = flow.steps.length;
                    return (
                      <div
                        key={flow.id}
                        className="custom-flow-card"
                        draggable
                        onClick={() => assignTile(tile)}
                        onDragStart={(event) => {
                          const payload = JSON.stringify(tile);
                          event.dataTransfer.setData(DRAG_TYPE, payload);
                          event.dataTransfer.setData('text/plain', payload);
                          event.dataTransfer.effectAllowed = 'copy';
                        }}
                      >
                        <div className="flow-card-icon-wrap">
                          {icon ? (
                            <img
                              alt=""
                              className="flow-card-icon"
                              src={icon}
                              draggable={false}
                            />
                          ) : (
                            <span className="flow-card-glyph">
                              {[...flow.name][0]}
                            </span>
                          )}
                        </div>

                        <div className="flow-card-info">
                          <strong className="flow-card-name">
                            {flow.name}
                          </strong>
                          <span className="flow-card-meta">
                            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
                          </span>
                        </div>

                        <div className="flow-card-actions">
                          <button
                            type="button"
                            className="btn-flow-action edit"
                            title="Edit flow"
                            onClick={(e) => handleEditCustomFlow(flow, e)}
                          >
                            <LuPencil size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn-flow-action delete"
                            title="Delete flow"
                            onClick={(e) => handleDeleteCustomFlow(flow.id, e)}
                          >
                            <LuX size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Custom Flow Modal */}
      <CustomFlowModal
        isOpen={customModalOpen}
        initialFlow={editingFlow}
        presetIcons={presetIcons}
        onSave={handleSaveCustomFlow}
        onClose={() => {
          setCustomModalOpen(false);
          setEditingFlow(null);
        }}
      />

      {dialog === 'logout' && active ? (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Log out {active.name}?</h2>
            <p>
              This unpairs the phone and deletes its deck and custom actions on
              this computer. You can pair again later.
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
              phone, then drop apps, utilities, or custom multi-step flows onto
              the deck to launch them from your pocket.
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
              Click an empty slot, then click any app, media utility, or custom
              flow below — or drag items directly onto the phone grid. Hover a
              filled slot and press × to clear it. Add extra pages in the
              sidebar; swipe between them on your phone.
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
