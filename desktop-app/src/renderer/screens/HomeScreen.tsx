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
  LuSlidersHorizontal,
  LuMusic,
  LuVolume2,
  LuVolumeX,
  LuVolume1,
  LuPlay,
  LuPause,
  LuSkipBack,
  LuSkipForward,
  LuGripVertical,
} from 'react-icons/lu';
import {
  UTILITY_ITEMS,
  WIDGET_ITEMS,
  type CustomFlow,
  type DeckTile,
  type DesktopApp,
  type UtilityItem,
  type WidgetItem,
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
const SLOT_DRAG_TYPE = 'application/x-nudgeboard-slot';

type LibraryTab = 'apps' | 'utilities' | 'widgets' | 'custom';

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
        widgetType: value.widgetType,
        colSpan: typeof value.colSpan === 'number' ? value.colSpan : undefined,
        rowSpan: typeof value.rowSpan === 'number' ? value.rowSpan : undefined,
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
  colSpan: 1,
  rowSpan: 1,
});

const tileFromUtility = (item: UtilityItem): DeckTile => ({
  id: `utility_${item.id}`,
  name: item.name,
  path: `utility:${item.id}`,
  iconPath: `utility:${item.id}`,
  tileType: 'utility',
  utilityAction: item.id,
  colSpan: 1,
  rowSpan: 1,
});

const tileFromWidget = (
  item: WidgetItem,
  colSpan = item.defaultColSpan,
  rowSpan = item.defaultRowSpan,
): DeckTile => ({
  id: `widget_${item.id}_${Date.now()}`,
  name: item.name,
  path: `widget:${item.id}`,
  iconPath: item.id === 'volume' ? 'utility:volume_up' : 'utility:media_play_pause',
  tileType: 'widget',
  widgetType: item.id,
  colSpan,
  rowSpan,
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
  colSpan: 1,
  rowSpan: 1,
});

function formatMediaTime(sec: number): string {
  if (!sec || isNaN(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function DesktopMediaSlot({
  colSpan,
  rowSpan,
}: {
  colSpan: number;
  rowSpan: number;
}) {
  const mediaState = useAppStore((s) => s.mediaState);
  const isPlaying = !!mediaState?.isPlaying;
  const trackTitle = mediaState?.title || 'No Media Playing';
  const trackArtist = mediaState?.artist || 'Spotify / Apple / YouTube';
  const sourceApp = mediaState?.sourceApp || 'SPOTIFY';

  const [currPos, setCurrPos] = useState(mediaState?.positionSec || 0);

  useEffect(() => {
    const rawBasePos = mediaState?.positionSec || 0;
    const updatedAt = mediaState?.updatedAt || Date.now();
    const duration = mediaState?.durationSec || 0;

    const initialElapsed = isPlaying ? Math.max(0, (Date.now() - updatedAt) / 1000) : 0;
    const initialPos = duration > 0 ? Math.min(duration, rawBasePos + initialElapsed) : rawBasePos + initialElapsed;

    setCurrPos(initialPos);

    if (!isPlaying) {
      return;
    }

    const startLocalTime = Date.now();
    const startCalculatedPos = initialPos;

    const interval = setInterval(() => {
      const elapsedSinceStart = (Date.now() - startLocalTime) / 1000;
      const next = duration > 0 ? Math.min(duration, startCalculatedPos + elapsedSinceStart) : startCalculatedPos + elapsedSinceStart;
      setCurrPos(next);
    }, 250);

    return () => clearInterval(interval);
  }, [
    mediaState?.title,
    mediaState?.artist,
    mediaState?.isPlaying,
    mediaState?.positionSec,
    mediaState?.durationSec,
    mediaState?.updatedAt,
    isPlaying,
  ]);

  const duration = mediaState?.durationSec || 0;
  const progressPercent =
    duration > 0
      ? Math.min(100, Math.max(0, (currPos / duration) * 100))
      : isPlaying
        ? 50
        : 0;

  const formattedPos = formatMediaTime(currPos);
  const formattedDur = duration > 0 ? formatMediaTime(duration) : '--:--';

  // 1. HERO (4x2, 3x2, 5x2, etc.)
  if (colSpan >= 3 && rowSpan >= 2) {
    return (
      <div className="slot-widget-media-hero">
        {/* Left: Large Artwork */}
        <div className="widget-media-hero-art-wrap">
          {mediaState?.artwork ? (
            <img
              src={mediaState.artwork}
              alt=""
              className="widget-media-art"
              draggable={false}
            />
          ) : (
            <div className="widget-media-disc">
              <LuMusic size={36} />
            </div>
          )}
        </div>

        {/* Center: Tags, Title, Artist, and Dynamic Progress Bar */}
        <div className="widget-media-hero-body">
          <div className="widget-media-hero-tags">
            <span className="widget-media-hero-source">
              {sourceApp.toUpperCase()}
            </span>
            <span className={`widget-media-hero-status${isPlaying ? ' playing' : ''}`}>
              <span className="dot" />
              {isPlaying ? 'NOW PLAYING' : 'PAUSED'}
            </span>
          </div>

          <span
            className="widget-media-hero-title"
            title={trackTitle}
          >
            {trackTitle}
          </span>
          <span
            className="widget-media-hero-artist"
            title={trackArtist}
          >
            {trackArtist}
          </span>

          <div className="widget-media-hero-progress-row">
            <span className="widget-media-time-label">{formattedPos}</span>
            <div className="widget-media-hero-progress">
              <div
                className="widget-media-hero-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="widget-media-time-label">{formattedDur}</span>
          </div>
        </div>

        {/* Right: Big, Tactile Playback Controls */}
        <div
          className="widget-media-hero-ctrls"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="widget-btn-ctrl hero-btn"
            title="Previous"
            onClick={() => window.api.triggerWidgetAction('media_prev')}
          >
            <LuSkipBack size={18} />
          </button>
          <button
            type="button"
            className="widget-btn-ctrl hero-play"
            title={isPlaying ? 'Pause' : 'Play'}
            onClick={() => window.api.triggerWidgetAction('media_play_pause')}
          >
            {isPlaying ? <LuPause size={24} /> : <LuPlay size={24} />}
          </button>
          <button
            type="button"
            className="widget-btn-ctrl hero-btn"
            title="Next"
            onClick={() => window.api.triggerWidgetAction('media_next')}
          >
            <LuSkipForward size={18} />
          </button>
        </div>
      </div>
    );
  }

  // 2. LARGE (2x2)
  if (colSpan === 2 && rowSpan >= 2) {
    return (
      <div className="slot-widget-media-large">
        <div className="widget-media-large-top">
          <div className="widget-media-art-wrap large">
            {mediaState?.artwork ? (
              <img
                src={mediaState.artwork}
                alt=""
                className="widget-media-art"
                draggable={false}
              />
            ) : (
              <div className="widget-media-disc">
                <LuMusic size={26} />
              </div>
            )}
          </div>
          <div className="widget-media-meta">
            <span className="widget-media-source-pill">
              {sourceApp.toUpperCase()}
            </span>
            <span className="widget-media-title" title={trackTitle}>
              {trackTitle}
            </span>
            <span className="widget-media-artist" title={trackArtist}>
              {trackArtist}
            </span>
          </div>
        </div>

        <div className="widget-media-hero-progress-row">
          <span className="widget-media-time-label small">{formattedPos}</span>
          <div className="widget-media-hero-progress">
            <div
              className="widget-media-hero-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="widget-media-time-label small">{formattedDur}</span>
        </div>

        <div
          className="widget-media-large-ctrls"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="widget-btn-ctrl hero-btn-med"
            title="Previous"
            onClick={() => window.api.triggerWidgetAction('media_prev')}
          >
            <LuSkipBack size={15} />
          </button>
          <button
            type="button"
            className="widget-btn-ctrl hero-play-large"
            title={isPlaying ? 'Pause' : 'Play'}
            onClick={() => window.api.triggerWidgetAction('media_play_pause')}
          >
            {isPlaying ? <LuPause size={20} /> : <LuPlay size={20} />}
          </button>
          <button
            type="button"
            className="widget-btn-ctrl hero-btn-med"
            title="Next"
            onClick={() => window.api.triggerWidgetAction('media_next')}
          >
            <LuSkipForward size={15} />
          </button>
        </div>
      </div>
    );
  }

  // 3. WIDE (3x1, 4x1, 5x1)
  if (colSpan >= 3 && rowSpan === 1) {
    return (
      <div className="slot-widget-media-wide">
        <div className="widget-media-art-wrap">
          {mediaState?.artwork ? (
            <img
              src={mediaState.artwork}
              alt=""
              className="widget-media-art"
              draggable={false}
            />
          ) : (
            <div className="widget-media-disc">
              <LuMusic size={20} />
            </div>
          )}
        </div>

        <div className="widget-media-wide-body">
          <div className="widget-media-wide-head">
            <span className="widget-media-title" title={trackTitle}>
              {trackTitle}
            </span>
            <span className="widget-media-source-pill">
              {sourceApp.toUpperCase()}
            </span>
          </div>
          <span className="widget-media-artist" title={trackArtist}>
            {trackArtist}
          </span>
          <div className="widget-media-hero-progress mini">
            <div
              className="widget-media-hero-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div
          className="widget-media-ctrls"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="widget-btn-ctrl"
            title="Previous"
            onClick={() => window.api.triggerWidgetAction('media_prev')}
          >
            <LuSkipBack size={13} />
          </button>
          <button
            type="button"
            className="widget-btn-ctrl play-main"
            title={isPlaying ? 'Pause' : 'Play'}
            onClick={() => window.api.triggerWidgetAction('media_play_pause')}
          >
            {isPlaying ? <LuPause size={15} /> : <LuPlay size={15} />}
          </button>
          <button
            type="button"
            className="widget-btn-ctrl"
            title="Next"
            onClick={() => window.api.triggerWidgetAction('media_next')}
          >
            <LuSkipForward size={13} />
          </button>
        </div>
      </div>
    );
  }

  // 4. VERTICAL (1x2, 1x3)
  if (colSpan === 1 && rowSpan >= 2) {
    return (
      <div className="slot-widget-media-vert">
        <div className="widget-media-vert-art-wrap">
          {mediaState?.artwork ? (
            <img
              src={mediaState.artwork}
              alt=""
              className="widget-media-art"
              draggable={false}
            />
          ) : (
            <div className="widget-media-disc">
              <LuMusic size={22} />
            </div>
          )}
        </div>

        <div className="widget-media-vert-meta">
          <span className="widget-media-vert-title" title={trackTitle}>
            {trackTitle}
          </span>
          <span className="widget-media-vert-artist" title={trackArtist}>
            {trackArtist}
          </span>
        </div>

        <div className="widget-media-hero-progress mini">
          <div
            className="widget-media-hero-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div
          className="widget-media-vert-ctrls"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="widget-btn-ctrl"
            title="Previous"
            onClick={() => window.api.triggerWidgetAction('media_prev')}
          >
            <LuSkipBack size={11} />
          </button>
          <button
            type="button"
            className="widget-btn-ctrl play-main"
            title={isPlaying ? 'Pause' : 'Play'}
            onClick={() => window.api.triggerWidgetAction('media_play_pause')}
          >
            {isPlaying ? <LuPause size={13} /> : <LuPlay size={13} />}
          </button>
          <button
            type="button"
            className="widget-btn-ctrl"
            title="Next"
            onClick={() => window.api.triggerWidgetAction('media_next')}
          >
            <LuSkipForward size={11} />
          </button>
        </div>
      </div>
    );
  }

  // 5. MEDIUM (2x1)
  if (colSpan >= 2) {
    return (
      <div className="slot-widget-media-med">
        <div className="widget-media-art-wrap">
          {mediaState?.artwork ? (
            <img
              src={mediaState.artwork}
              alt=""
              className="widget-media-art"
              draggable={false}
            />
          ) : (
            <div className="widget-media-disc">
              <LuMusic size={18} />
            </div>
          )}
        </div>

        <div className="widget-media-body">
          <div className="widget-media-meta">
            <span className="widget-media-title" title={trackTitle}>
              {trackTitle}
            </span>
            <span className="widget-media-artist" title={trackArtist}>
              {trackArtist}
            </span>
          </div>
          <div className="widget-media-hero-progress mini">
            <div
              className="widget-media-hero-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div
          className="widget-media-ctrls"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="widget-btn-ctrl"
            title="Previous"
            onClick={() => window.api.triggerWidgetAction('media_prev')}
          >
            <LuSkipBack size={12} />
          </button>
          <button
            type="button"
            className="widget-btn-ctrl play-main"
            title={isPlaying ? 'Pause' : 'Play'}
            onClick={() => window.api.triggerWidgetAction('media_play_pause')}
          >
            {isPlaying ? <LuPause size={13} /> : <LuPlay size={13} />}
          </button>
          <button
            type="button"
            className="widget-btn-ctrl"
            title="Next"
            onClick={() => window.api.triggerWidgetAction('media_next')}
          >
            <LuSkipForward size={12} />
          </button>
        </div>
      </div>
    );
  }

  // 6. SMALL (1x1)
  return (
    <div className="slot-widget-media-small">
      <div className="widget-small-art-wrap">
        {mediaState?.artwork ? (
          <img
            src={mediaState.artwork}
            alt=""
            className="widget-small-art"
            draggable={false}
          />
        ) : (
          <LuMusic size={20} />
        )}
        <button
          type="button"
          className="widget-small-play-badge"
          onClick={(e) => {
            e.stopPropagation();
            void window.api.triggerWidgetAction('media_play_pause');
          }}
        >
          {isPlaying ? <LuPause size={11} /> : <LuPlay size={11} />}
        </button>
      </div>
      <span className="widget-small-title">{trackTitle}</span>
    </div>
  );
}

export function HomeScreen() {
  const snapshot = useAppStore((s) => s.snapshot);
  const setSnapshot = useAppStore((s) => s.setSnapshot);
  const setView = useAppStore((s) => s.setView);
  const mediaState = useAppStore((s) => s.mediaState);
  const volumeState = useAppStore((s) => s.volumeState);
  const setVolumeState = useAppStore((s) => s.setVolumeState);
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
  const [resizing, setResizing] = useState<{
    index: number;
    startCol: number;
    startRow: number;
    targetColSpan: number;
    targetRowSpan: number;
    gridRect: DOMRect;
  } | null>(null);
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
        path.startsWith('preset:') ||
        path.startsWith('widget:')
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
      tile?.tileType === 'widget' ||
      tile?.widgetType ||
      path.startsWith('widget:')
    ) {
      const widget =
        tile?.widgetType ?? (path.replace(/^widget:/, '') as 'media' | 'volume');
      return widget === 'volume'
        ? utilityIcons['volume_up'] ?? utilityIcons['utility:volume_up']
        : utilityIcons['media_play_pause'] ?? utilityIcons['utility:media_play_pause'];
    }

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

  const dropOn = (index: number, event: DragEvent<HTMLDivElement | HTMLButtonElement>) => {
    event.preventDefault();
    setOverSlot(null);
    setSelectedSlot(null);

    const fromSlotStr = event.dataTransfer.getData(SLOT_DRAG_TYPE);
    if (fromSlotStr) {
      const fromIndex = parseInt(fromSlotStr, 10);
      if (!isNaN(fromIndex) && fromIndex !== index) {
        void window.api.moveTile(fromIndex, index).then(setSnapshot);
        return;
      }
    }

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

  const startResize = (index: number, tile: DeckTile, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const slotInPage = index % GRID_SLOTS;
    const startCol = slotInPage % GRID_COLUMNS;
    const startRow = Math.floor(slotInPage / GRID_COLUMNS);
    const gridEl = (e.currentTarget as HTMLElement).closest('.slot-grid');
    if (!gridEl) return;
    const gridRect = gridEl.getBoundingClientRect();

    setResizing({
      index,
      startCol,
      startRow,
      targetColSpan: tile.colSpan ?? 1,
      targetRowSpan: tile.rowSpan ?? 1,
      gridRect,
    });
  };

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { startCol, startRow, gridRect } = resizing;
      const colWidth = gridRect.width / GRID_COLUMNS;
      const rowHeight = gridRect.height / GRID_ROWS;

      const relX = e.clientX - gridRect.left;
      const relY = e.clientY - gridRect.top;

      const currCol = Math.min(
        GRID_COLUMNS - 1,
        Math.max(startCol, Math.floor(relX / colWidth)),
      );
      const currRow = Math.min(
        GRID_ROWS - 1,
        Math.max(startRow, Math.floor(relY / rowHeight)),
      );

      const nextColSpan = currCol - startCol + 1;
      const nextRowSpan = currRow - startRow + 1;

      setResizing((prev) =>
        prev
          ? {
              ...prev,
              targetColSpan: nextColSpan,
              targetRowSpan: nextRowSpan,
            }
          : null,
      );
    };

    const handleMouseUp = () => {
      const { index, targetColSpan, targetRowSpan } = resizing;
      const tile = tiles[index];
      if (
        tile &&
        (tile.colSpan !== targetColSpan || tile.rowSpan !== targetRowSpan)
      ) {
        void window.api
          .resizeTile(index, targetColSpan, targetRowSpan)
          .then(setSnapshot);
      }
      setResizing(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, tiles, setSnapshot]);

  const cycleSize = (index: number, tile: DeckTile, e: React.MouseEvent) => {
    e.stopPropagation();
    const slotInPage = index % GRID_SLOTS;
    const startCol = slotInPage % GRID_COLUMNS;
    const startRow = Math.floor(slotInPage / GRID_COLUMNS);
    const maxCols = GRID_COLUMNS - startCol;
    const maxRows = GRID_ROWS - startRow;

    const c = tile.colSpan ?? 1;
    const r = tile.rowSpan ?? 1;

    let nextCols = 1;
    let nextRows = 1;

    if (maxCols >= 2 && maxRows >= 2) {
      if (c === 1 && r === 1) {
        nextCols = 2;
        nextRows = 1;
      } else if (c === 2 && r === 1) {
        nextCols = 2;
        nextRows = 2;
      } else {
        nextCols = 1;
        nextRows = 1;
      }
    } else if (maxCols >= 2 && maxRows === 1) {
      if (c === 1) {
        nextCols = 2;
        nextRows = 1;
      } else {
        nextCols = 1;
        nextRows = 1;
      }
    } else if (maxCols === 1 && maxRows >= 2) {
      if (r === 1) {
        nextCols = 1;
        nextRows = 2;
      } else {
        nextCols = 1;
        nextRows = 1;
      }
    } else {
      nextCols = 1;
      nextRows = 1;
    }

    void window.api.resizeTile(index, nextCols, nextRows).then(setSnapshot);
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
                  {pageIndexes.map((pageIndex) => {
                    const pageStart = pageIndex * GRID_SLOTS;

                    // Compute covered slots so multi-cell widgets occupy the grid without pushing
                    const coveredSlots = new Set<number>();
                    for (let slot = 0; slot < GRID_SLOTS; slot++) {
                      const tileIndex = pageStart + slot;
                      const tile = tiles[tileIndex];
                      if (tile) {
                        const slotCol = slot % GRID_COLUMNS;
                        const slotRow = Math.floor(slot / GRID_COLUMNS);
                        const colSpan = Math.min(
                          GRID_COLUMNS - slotCol,
                          tile.colSpan ?? 1,
                        );
                        const rowSpan = Math.min(
                          GRID_ROWS - slotRow,
                          tile.rowSpan ?? 1,
                        );
                        for (let r = 0; r < rowSpan; r++) {
                          for (let c = 0; c < colSpan; c++) {
                            if (r !== 0 || c !== 0) {
                              coveredSlots.add(slot + r * GRID_COLUMNS + c);
                            }
                          }
                        }
                      }
                    }

                    return (
                      <div key={pageIndex} className="page-pane">
                        <div
                          className="slot-grid"
                          style={{
                            gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
                            gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, 1fr))`,
                          }}
                        >
                          {slots.map((slot) => {
                            if (coveredSlots.has(slot)) {
                              return null;
                            }
                            const index = pageStart + slot;
                            const tile = tiles[index];
                            const icon = tile
                              ? iconFor(tile.path, tile.id, tile)
                              : undefined;
                            const isWidget =
                              tile?.tileType === 'widget' ||
                              tile?.widgetType ||
                              tile?.path.startsWith('widget:');
                            const widgetType =
                              tile?.widgetType ??
                              (tile?.path.startsWith('widget:')
                                ? tile.path.replace(/^widget:/, '')
                                : undefined);
                            const slotCol = slot % GRID_COLUMNS;
                            const slotRow = Math.floor(slot / GRID_COLUMNS);
                            const isThisTileResizing =
                              resizing?.index === index;
                            const colSpan = isThisTileResizing
                              ? Math.min(
                                  GRID_COLUMNS - slotCol,
                                  resizing.targetColSpan,
                                )
                              : Math.min(
                                  GRID_COLUMNS - slotCol,
                                  tile?.colSpan ?? 1,
                                );
                            const rowSpan = isThisTileResizing
                              ? Math.min(
                                  GRID_ROWS - slotRow,
                                  resizing.targetRowSpan,
                                )
                              : Math.min(
                                  GRID_ROWS - slotRow,
                                  tile?.rowSpan ?? 1,
                                );
                            const isMultiCell = colSpan > 1 || rowSpan > 1;

                            return (
                              <div
                                key={index}
                                draggable={!!tile && !resizing}
                                style={{
                                  gridColumn: `${slotCol + 1} / span ${colSpan}`,
                                  gridRow: `${slotRow + 1} / span ${rowSpan}`,
                                }}
                                className={`slot${tile ? ' filled' : ''}${isWidget ? ' widget-slot' : ''}${isMultiCell ? ' multi-cell' : ''}${overSlot === index ? ' over' : ''}${selectedSlot === index ? ' selected' : ''}${isThisTileResizing ? ' is-resizing' : ''}`}
                                aria-label={
                                  tile ? tile.name : 'Add item to slot'
                                }
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
                                onDragStart={(event) => {
                                  if (!tile || resizing) return;
                                  event.dataTransfer.setData(
                                    SLOT_DRAG_TYPE,
                                    String(index),
                                  );
                                  event.dataTransfer.setData(
                                    'text/plain',
                                    JSON.stringify(tile),
                                  );
                                  event.dataTransfer.effectAllowed = 'move';
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
                                    {isWidget && widgetType === 'media' ? (
                                      <DesktopMediaSlot colSpan={colSpan} rowSpan={rowSpan} />
                                    ) : isWidget && widgetType === 'volume' ? (
                                      colSpan >= 3 && rowSpan >= 2 ? (
                                        /* HERO (4x2, 3x2, 5x2) STUDIO MIXER */
                                        <div className="slot-widget-volume-hero">
                                          <div className="widget-vol-hero-left">
                                            <button
                                              type="button"
                                              className={`widget-vol-hero-icon-btn${volumeState.isMuted ? ' muted' : ''}`}
                                              title={volumeState.isMuted ? 'Unmute' : 'Mute'}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                void window.api.triggerWidgetAction('toggle_mute');
                                              }}
                                            >
                                              {volumeState.isMuted ? (
                                                <LuVolumeX size={20} />
                                              ) : volumeState.volume > 50 ? (
                                                <LuVolume2 size={20} />
                                              ) : (
                                                <LuVolume1 size={20} />
                                              )}
                                            </button>
                                            <span className="widget-vol-hero-val">
                                              {volumeState.isMuted ? 'MUTED' : `${volumeState.volume}%`}
                                            </span>
                                            <span className="widget-vol-hero-status">
                                              {volumeState.isMuted
                                                ? 'Muted'
                                                : volumeState.volume === 0
                                                  ? 'Silent'
                                                  : volumeState.volume > 75
                                                    ? 'High'
                                                    : 'Optimal'}
                                            </span>
                                          </div>

                                          <div className="widget-vol-hero-right">
                                            <div className="widget-vol-hero-head">
                                              <span className="widget-vol-hero-label">
                                                Master Audio
                                              </span>
                                              <div className="widget-vol-meter-bars">
                                                {[20, 40, 60, 80, 100].map((t) => (
                                                  <div
                                                    key={t}
                                                    className={`widget-vol-meter-bar${volumeState.volume >= t && !volumeState.isMuted ? ' on' : ''}`}
                                                  />
                                                ))}
                                              </div>
                                            </div>

                                            <div
                                              className="widget-vol-hero-slider-wrap"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={volumeState.isMuted ? 0 : volumeState.volume}
                                                className="widget-vol-hero-slider"
                                                onChange={(e) => {
                                                  const v = Number(e.target.value);
                                                  setVolumeState({ ...volumeState, volume: v, isMuted: false });
                                                  void window.api.triggerWidgetAction('set_volume', v);
                                                }}
                                              />
                                            </div>

                                            <div
                                              className="widget-vol-presets-row"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <button
                                                type="button"
                                                className={`widget-btn-preset${volumeState.isMuted ? ' active' : ''}`}
                                                onClick={() => void window.api.triggerWidgetAction('toggle_mute')}
                                              >
                                                MUTE
                                              </button>
                                              {[25, 50, 75, 100].map((v) => (
                                                <button
                                                  key={v}
                                                  type="button"
                                                  className={`widget-btn-preset${volumeState.volume === v && !volumeState.isMuted ? ' active' : ''}`}
                                                  onClick={() => {
                                                    setVolumeState({ ...volumeState, volume: v, isMuted: false });
                                                    void window.api.triggerWidgetAction('set_volume', v);
                                                  }}
                                                >
                                                  {v}%
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      ) : colSpan === 2 && rowSpan >= 2 ? (
                                        /* LARGE 2x2 */
                                        <div className="slot-widget-volume-large">
                                          <div className="widget-vol-head">
                                            <button
                                              type="button"
                                              className={`widget-vol-icon-btn${volumeState.isMuted ? ' muted' : ''}`}
                                              title={volumeState.isMuted ? 'Unmute' : 'Mute'}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                void window.api.triggerWidgetAction('toggle_mute');
                                              }}
                                            >
                                              {volumeState.isMuted ? (
                                                <LuVolumeX size={16} />
                                              ) : volumeState.volume > 50 ? (
                                                <LuVolume2 size={16} />
                                              ) : (
                                                <LuVolume1 size={16} />
                                              )}
                                            </button>
                                            <span className="widget-vol-label">Volume</span>
                                            <span className="widget-vol-val">
                                              {volumeState.isMuted ? 'Muted' : `${volumeState.volume}%`}
                                            </span>
                                          </div>

                                          <div
                                            className="widget-vol-slider-wrap"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <input
                                              type="range"
                                              min="0"
                                              max="100"
                                              value={volumeState.isMuted ? 0 : volumeState.volume}
                                              className="widget-vol-slider"
                                              onChange={(e) => {
                                                const v = Number(e.target.value);
                                                setVolumeState({ ...volumeState, volume: v, isMuted: false });
                                                void window.api.triggerWidgetAction('set_volume', v);
                                              }}
                                            />
                                          </div>

                                          <div
                                            className="widget-vol-presets-row"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <button
                                              type="button"
                                              className={`widget-btn-preset${volumeState.isMuted ? ' active' : ''}`}
                                              onClick={() => void window.api.triggerWidgetAction('toggle_mute')}
                                            >
                                              Mute
                                            </button>
                                            {[25, 50, 75, 100].map((v) => (
                                              <button
                                                key={v}
                                                type="button"
                                                className={`widget-btn-preset${volumeState.volume === v && !volumeState.isMuted ? ' active' : ''}`}
                                                onClick={() => {
                                                  setVolumeState({ ...volumeState, volume: v, isMuted: false });
                                                  void window.api.triggerWidgetAction('set_volume', v);
                                                }}
                                              >
                                                {v}%
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ) : colSpan >= 3 && rowSpan === 1 ? (
                                        /* WIDE 3x1, 4x1, 5x1 */
                                        <div className="slot-widget-volume-wide">
                                          <div className="widget-vol-wide-left">
                                            <button
                                              type="button"
                                              className={`widget-vol-icon-btn${volumeState.isMuted ? ' muted' : ''}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                void window.api.triggerWidgetAction('toggle_mute');
                                              }}
                                            >
                                              {volumeState.isMuted ? (
                                                <LuVolumeX size={15} />
                                              ) : volumeState.volume > 50 ? (
                                                <LuVolume2 size={15} />
                                              ) : (
                                                <LuVolume1 size={15} />
                                              )}
                                            </button>
                                            <span className="widget-vol-val">
                                              {volumeState.isMuted ? 'Muted' : `${volumeState.volume}%`}
                                            </span>
                                          </div>

                                          <div
                                            className="widget-vol-slider-wrap wide"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <input
                                              type="range"
                                              min="0"
                                              max="100"
                                              value={volumeState.isMuted ? 0 : volumeState.volume}
                                              className="widget-vol-slider"
                                              onChange={(e) => {
                                                const v = Number(e.target.value);
                                                setVolumeState({ ...volumeState, volume: v, isMuted: false });
                                                void window.api.triggerWidgetAction('set_volume', v);
                                              }}
                                            />
                                          </div>

                                          <div
                                            className="widget-vol-presets-compact"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {[0, 50, 100].map((v) => (
                                              <button
                                                key={v}
                                                type="button"
                                                className={`widget-btn-preset compact${volumeState.volume === v && !volumeState.isMuted ? ' active' : ''}`}
                                                onClick={() => {
                                                  setVolumeState({ ...volumeState, volume: v, isMuted: false });
                                                  void window.api.triggerWidgetAction('set_volume', v);
                                                }}
                                              >
                                                {v}%
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ) : colSpan === 1 && rowSpan >= 2 ? (
                                        /* VERTICAL 1x2, 1x3 */
                                        <div className="slot-widget-volume-vert">
                                          <div className="widget-vol-vert-head">
                                            <button
                                              type="button"
                                              className={`widget-vol-icon-btn${volumeState.isMuted ? ' muted' : ''}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                void window.api.triggerWidgetAction('toggle_mute');
                                              }}
                                            >
                                              {volumeState.isMuted ? (
                                                <LuVolumeX size={16} />
                                              ) : volumeState.volume > 50 ? (
                                                <LuVolume2 size={16} />
                                              ) : (
                                                <LuVolume1 size={16} />
                                              )}
                                            </button>
                                            <span className="widget-vol-val">
                                              {volumeState.isMuted ? 'MUT' : `${volumeState.volume}%`}
                                            </span>
                                          </div>

                                          <div
                                            className="widget-vol-vert-slider-wrap"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <input
                                              type="range"
                                              min="0"
                                              max="100"
                                              value={volumeState.isMuted ? 0 : volumeState.volume}
                                              className="widget-vol-vert-slider"
                                              onChange={(e) => {
                                                const v = Number(e.target.value);
                                                setVolumeState({ ...volumeState, volume: v, isMuted: false });
                                                void window.api.triggerWidgetAction('set_volume', v);
                                              }}
                                            />
                                          </div>
                                          <span className="widget-vol-vert-foot">0%</span>
                                        </div>
                                      ) : colSpan >= 2 ? (
                                        /* MEDIUM 2x1 */
                                        <div className="slot-widget-volume-med">
                                          <div className="widget-vol-head">
                                            <button
                                              type="button"
                                              className={`widget-vol-icon-btn${volumeState.isMuted ? ' muted' : ''}`}
                                              title={
                                                volumeState.isMuted
                                                  ? 'Unmute'
                                                  : 'Mute'
                                              }
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                void window.api.triggerWidgetAction(
                                                  'toggle_mute',
                                                );
                                              }}
                                            >
                                              {volumeState.isMuted ? (
                                                <LuVolumeX size={14} />
                                              ) : volumeState.volume > 50 ? (
                                                <LuVolume2 size={14} />
                                              ) : (
                                                <LuVolume1 size={14} />
                                              )}
                                            </button>
                                            <span className="widget-vol-label">
                                              Volume
                                            </span>
                                            <span className="widget-vol-val">
                                              {volumeState.isMuted
                                                ? 'Muted'
                                                : `${volumeState.volume}%`}
                                            </span>
                                          </div>
                                          <div
                                            className="widget-vol-slider-wrap"
                                            onClick={(e) =>
                                              e.stopPropagation()
                                            }
                                          >
                                            <input
                                              type="range"
                                              min="0"
                                              max="100"
                                              value={
                                                volumeState.isMuted
                                                  ? 0
                                                  : volumeState.volume
                                              }
                                              className="widget-vol-slider"
                                              onChange={(e) => {
                                                const v = Number(e.target.value);
                                                setVolumeState({
                                                  ...volumeState,
                                                  volume: v,
                                                  isMuted: false,
                                                });
                                                void window.api.triggerWidgetAction(
                                                  'set_volume',
                                                  v,
                                                );
                                              }}
                                            />
                                          </div>
                                        </div>
                                      ) : (
                                        /* SMALL 1x1 */
                                        <div className="slot-widget-volume-small">
                                          <button
                                            type="button"
                                            className={`widget-vol-icon-btn${volumeState.isMuted ? ' muted' : ''}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              void window.api.triggerWidgetAction(
                                                'toggle_mute',
                                              );
                                            }}
                                          >
                                            {volumeState.isMuted ? (
                                              <LuVolumeX size={16} />
                                            ) : (
                                              <LuVolume2 size={16} />
                                            )}
                                          </button>
                                          <span className="widget-vol-small-text">
                                            {volumeState.isMuted
                                              ? 'MUTED'
                                              : `${volumeState.volume}%`}
                                          </span>
                                        </div>
                                      )
                                    ) : (
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
                                        <span className="slot-name-label">
                                          {tile.name}
                                        </span>
                                      </>
                                    )}

                                    {/* Top-Right Clear Button */}
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

                                    {/* Bottom-Right Corner Resize Handle */}
                                    <div
                                      className="slot-resize-handle"
                                      title={`Size: ${colSpan}×${rowSpan} — Drag corner or click to resize`}
                                      onMouseDown={(event) =>
                                        startResize(index, tile, event)
                                      }
                                      onClick={(event) =>
                                        cycleSize(index, tile, event)
                                      }
                                    >
                                      <span className="resize-handle-glyph" />
                                      <span className="resize-handle-badge">
                                        {colSpan}×{rowSpan}
                                      </span>
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
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
                className={`tab-btn${tab === 'widgets' ? ' active' : ''}`}
                onClick={() => setTab('widgets')}
              >
                <LuSlidersHorizontal size={15} />
                <span>Widgets</span>
                <span className="tab-badge">{WIDGET_ITEMS.length}</span>
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

          {/* Tab 2: Widgets */}
          {tab === 'widgets' ? (
            <div className="widgets-catalog-grid">
              {WIDGET_ITEMS.map((item) => {
                const isMedia = item.id === 'media';
                const isVol = item.id === 'volume';
                const defaultTile = tileFromWidget(item);

                return (
                  <div
                    key={item.id}
                    className="widget-card-item"
                    draggable
                    onClick={() => assignTile(defaultTile)}
                    onDragStart={(event) => {
                      const payload = JSON.stringify(defaultTile);
                      event.dataTransfer.setData(DRAG_TYPE, payload);
                      event.dataTransfer.setData('text/plain', payload);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <div className="widget-card-header">
                      <div
                        className={`widget-card-banner ${
                          isMedia ? 'media-banner' : 'volume-banner'
                        }`}
                      >
                        {isMedia ? (
                          <LuMusic size={22} />
                        ) : (
                          <LuVolume2 size={22} />
                        )}
                      </div>
                      <div className="widget-card-title-group">
                        <div className="widget-card-name-row">
                          <strong>{item.name}</strong>
                          <span className="widget-badge">Widget</span>
                        </div>
                        <span className="widget-size-pill">
                          {item.defaultColSpan}×{item.defaultRowSpan} Default
                        </span>
                      </div>
                    </div>

                    <p className="widget-card-description">{item.description}</p>

                    {/* Rich Live Preview Stage */}
                    <div className="widget-preview-box">
                      {isMedia ? (
                        <div className="preview-media-content">
                          <div className="preview-art-slot">
                            {mediaState?.artwork ? (
                              <img
                                src={mediaState.artwork}
                                alt="Album Art"
                                className="preview-art-img"
                              />
                            ) : (
                              <div className="preview-art-placeholder">
                                <LuMusic size={16} />
                              </div>
                            )}
                          </div>
                          <div className="preview-media-details">
                            <span className="preview-track-title">
                              {mediaState?.title || 'No Media Playing'}
                            </span>
                            <span className="preview-track-artist">
                              {mediaState?.artist || 'Spotify • Apple Music • YouTube'}
                            </span>
                          </div>
                          <span
                            className={`preview-status-tag ${
                              mediaState?.isPlaying ? 'playing' : 'idle'
                            }`}
                          >
                            {mediaState?.isPlaying ? '▶ LIVE' : 'READY'}
                          </span>
                        </div>
                      ) : isVol ? (
                        <div className="preview-vol-content">
                          <div className="preview-vol-bar-header">
                            <span className="preview-vol-text">Master Volume</span>
                            <span className="preview-vol-value">
                              {volumeState.isMuted ? 'Muted' : `${volumeState.volume}%`}
                            </span>
                          </div>
                          <div className="preview-vol-bar-track">
                            <div
                              className={`preview-vol-bar-fill ${
                                volumeState.isMuted ? 'muted' : ''
                              }`}
                              style={{
                                width: `${volumeState.isMuted ? 0 : volumeState.volume}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="widget-card-footer">
                      <button
                        type="button"
                        className="btn-add-widget-grid"
                        onClick={(e) => {
                          e.stopPropagation();
                          assignTile(defaultTile);
                        }}
                        title="Drag or click to place on deck"
                      >
                        <LuGripVertical size={14} className="grip-icon" />
                        <span>Drag to Deck</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Tab 3: Utilities */}
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
