import { useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import {
  GRID_COLUMNS,
  GRID_ROWS,
  GRID_SLOTS,
  type DeckTileView,
  type WidgetActionType,
} from '../protocol';
import { type Palette, useThemedStyles } from '../theme';
import { MediaWidget } from './widgets/MediaWidget';
import { VolumeWidget } from './widgets/VolumeWidget';

const GAP = 10;

type Props = {
  tiles: Array<DeckTileView | null>;
  landscape?: boolean;
  onPressTile?: (id: string) => void;
  onWidgetAction?: (action: WidgetActionType, value?: number) => void;
};

const isBitmapIcon = (uri?: string): boolean => {
  if (!uri) {
    return false;
  }
  return (
    uri.startsWith('data:image/') || uri.startsWith('https://')
  );
};

type GridStyles = ReturnType<typeof makeStyles>;

type FilledTileProps = {
  tile: DeckTileView;
  width: number;
  height: number;
  colSpan: number;
  rowSpan: number;
  iconSize: number;
  styles: GridStyles;
  onPressTile?: (id: string) => void;
  onWidgetAction?: (action: WidgetActionType, value?: number) => void;
};

function FilledTile({
  tile,
  width,
  height,
  colSpan,
  rowSpan,
  iconSize,
  styles,
  onPressTile,
  onWidgetAction,
}: FilledTileProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const glyph = [...tile.name][0];
  const showImage = isBitmapIcon(tile.icon) && !iconFailed;

  const isWidget =
    tile.tileType === 'widget' ||
    tile.widgetType ||
    tile.id.startsWith('widget_');
  const widgetType =
    tile.widgetType ??
    (tile.id.includes('media')
      ? 'media'
      : tile.id.includes('volume')
        ? 'volume'
        : undefined);

  if (isWidget && widgetType === 'media') {
    return (
      <MediaWidget
        tile={tile}
        width={width}
        height={height}
        colSpan={colSpan}
        rowSpan={rowSpan}
        onAction={onWidgetAction}
      />
    );
  }

  if (isWidget && widgetType === 'volume') {
    return (
      <VolumeWidget
        tile={tile}
        width={width}
        height={height}
        colSpan={colSpan}
        rowSpan={rowSpan}
        onAction={onWidgetAction}
      />
    );
  }

  return (
    <Pressable
      onPress={() => onPressTile?.(tile.id)}
      style={({ pressed }) => [
        styles.tile,
        styles.filled,
        { width, height },
        pressed ? styles.pressed : null,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: tile.icon ?? '' }}
          style={{ width: iconSize, height: iconSize }}
          resizeMode="contain"
          onError={() => setIconFailed(true)}
        />
      ) : (
        <View
          style={[styles.glyphWrap, { width: iconSize, height: iconSize }]}
        >
          <Text style={styles.glyph}>{glyph}</Text>
        </View>
      )}
      <Text style={styles.name} numberOfLines={1}>
        {tile.name}
      </Text>
    </Pressable>
  );
}

export function DeckGrid({
  tiles,
  landscape,
  onPressTile,
  onWidgetAction,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const [box, setBox] = useState<{ width: number; height: number } | undefined>(
    undefined,
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((prev) => {
      if (prev?.width === width && prev?.height === height) {
        return prev;
      }
      return { width, height };
    });
  };

  const isLandscape = landscape ?? (box ? box.width >= box.height : true);
  const cols = isLandscape ? GRID_COLUMNS : GRID_ROWS; // 5 in landscape, 3 in portrait
  const rows = isLandscape ? GRID_ROWS : GRID_COLUMNS; // 3 in landscape, 5 in portrait

  const tileSize = box
    ? Math.max(
        44,
        Math.floor(
          Math.min(
            (box.width - GAP * (cols - 1)) / cols,
            (box.height - GAP * (rows - 1)) / rows,
          ),
        ),
      )
    : 0;
  const iconSize = Math.round(tileSize * 0.42);

  const totalWidth = tileSize * cols + GAP * (cols - 1);
  const totalHeight = tileSize * rows + GAP * (rows - 1);

  // Compute covered slots so multi-cell widgets occupy the grid without pushing
  const coveredSlots = new Set<number>();
  for (let index = 0; index < GRID_SLOTS; index++) {
    const tile = tiles[index];
    if (tile) {
      const lCol = index % GRID_COLUMNS;
      const lRow = Math.floor(index / GRID_COLUMNS);
      const colSpan = Math.min(GRID_COLUMNS - lCol, tile.colSpan ?? 1);
      const rowSpan = Math.min(GRID_ROWS - lRow, tile.rowSpan ?? 1);
      for (let r = 0; r < rowSpan; r++) {
        for (let c = 0; c < colSpan; c++) {
          if (r !== 0 || c !== 0) {
            coveredSlots.add((lRow + r) * GRID_COLUMNS + (lCol + c));
          }
        }
      }
    }
  }

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {tileSize > 0 ? (
        <View style={[styles.gridContainer, { width: totalWidth, height: totalHeight }]}>
          {Array.from({ length: GRID_SLOTS }, (_, index) => {
            if (coveredSlots.has(index)) {
              return null;
            }
            const tile = tiles[index] ?? null;
            const lCol = index % GRID_COLUMNS;
            const lRow = Math.floor(index / GRID_COLUMNS);

            let slotCol: number;
            let slotRow: number;
            let colSpan: number;
            let rowSpan: number;

            if (isLandscape) {
              slotCol = lCol;
              slotRow = lRow;
              colSpan = tile
                ? Math.min(GRID_COLUMNS - lCol, tile.colSpan ?? 1)
                : 1;
              rowSpan = tile
                ? Math.min(GRID_ROWS - lRow, tile.rowSpan ?? 1)
                : 1;
            } else {
              // Rotated transpose for Portrait:
              // Landscape columns (0..4) become Portrait rows (0..4)
              // Landscape rows (0..2) become Portrait columns (0..2)
              slotCol = lRow;
              slotRow = lCol;
              colSpan = tile
                ? Math.min(GRID_ROWS - slotCol, tile.rowSpan ?? 1)
                : 1;
              rowSpan = tile
                ? Math.min(GRID_COLUMNS - slotRow, tile.colSpan ?? 1)
                : 1;
            }

            const itemWidth = tileSize * colSpan + GAP * (colSpan - 1);
            const itemHeight = tileSize * rowSpan + GAP * (rowSpan - 1);
            const left = slotCol * (tileSize + GAP);
            const top = slotRow * (tileSize + GAP);

            if (!tile) {
              return (
                <View
                  key={`empty-${index}`}
                  style={[
                    styles.tile,
                    {
                      position: 'absolute',
                      left,
                      top,
                      width: tileSize,
                      height: tileSize,
                    },
                  ]}
                >
                  <Text style={styles.plus}>+</Text>
                </View>
              );
            }

            return (
              <View
                key={`${tile.id}-${index}`}
                style={{
                  position: 'absolute',
                  left,
                  top,
                  width: itemWidth,
                  height: itemHeight,
                }}
              >
                <FilledTile
                  tile={tile}
                  width={itemWidth}
                  height={itemHeight}
                  colSpan={colSpan}
                  rowSpan={rowSpan}
                  iconSize={iconSize}
                  styles={styles}
                  onPressTile={onPressTile}
                  onWidgetAction={onWidgetAction}
                />
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      minHeight: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gridContainer: {
      position: 'relative',
    },
    tile: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: palette.slot,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8,
    },
    filled: {
      backgroundColor: palette.slot,
    },
    pressed: {
      transform: [{ scale: 0.94 }],
      opacity: 0.85,
    },
    glyphWrap: {
      borderRadius: 12,
      backgroundColor: palette.glyph,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glyph: {
      color: palette.text,
      fontSize: 22,
      fontWeight: '800',
    },
    name: {
      marginTop: 4,
      color: palette.text,
      fontSize: 11,
      fontWeight: '600',
      textAlign: 'center',
      width: '100%',
    },
    plus: {
      color: palette.muted,
      fontSize: 24,
      fontWeight: '300',
    },
  });