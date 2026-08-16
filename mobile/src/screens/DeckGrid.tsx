import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { GRID_COLUMNS, GRID_ROWS, GRID_SLOTS, type DeckTileView } from '../protocol';
import { colors } from '../theme';

const palette = colors.dark;
const GAP = 10;

type Props = {
  tiles: Array<DeckTileView | null>;
  onPressTile?: (id: string) => void;
};

const isBitmapIcon = (uri?: string): boolean => {
  if (!uri) {
    return false;
  }
  return (
    uri.startsWith('data:image/') || uri.startsWith('https://')
  );
};

type FilledTileProps = {
  tile: DeckTileView;
  tileSize: number;
  iconSize: number;
  onPressTile?: (id: string) => void;
};

function FilledTile({ tile, tileSize, iconSize, onPressTile }: FilledTileProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const glyph = [...tile.name][0];
  const showImage = isBitmapIcon(tile.icon) && !iconFailed;

  return (
    <Pressable
      onPress={() => onPressTile?.(tile.id)}
      style={({ pressed }) => [
        styles.tile,
        styles.filled,
        { width: tileSize, height: tileSize },
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

export function DeckGrid({ tiles, onPressTile }: Props) {
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

  const tileSize = box
    ? Math.max(
        56,
        Math.min(
          (box.width - GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
          (box.height - GAP * (GRID_ROWS - 1)) / GRID_ROWS,
        ),
      )
    : 0;
  const iconSize = Math.round(tileSize * 0.42);
  const slots = Array.from(
    { length: GRID_SLOTS },
    (_, index) => tiles[index] ?? null,
  );

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {tileSize > 0 ? (
        <View style={[styles.grid, { width: tileSize * GRID_COLUMNS + GAP * (GRID_COLUMNS - 1) }]}>
          {slots.map((tile, index) => {
            if (!tile) {
              return (
                <View
                  key={`empty-${index}`}
                  style={[styles.tile, { width: tileSize, height: tileSize }]}
                >
                  <Text style={styles.plus}>+</Text>
                </View>
              );
            }
            return (
              <FilledTile
                key={`${tile.id}-${index}`}
                tile={tile}
                tileSize={tileSize}
                iconSize={iconSize}
                onPressTile={onPressTile}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  tile: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#3a3f4a',
    backgroundColor: palette.slot,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  filled: {
    borderStyle: 'solid',
    borderColor: '#2a2e36',
  },
  glyphWrap: {
    borderRadius: 8,
    backgroundColor: '#22262e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    color: palette.text,
    fontWeight: '700',
  },
  name: {
    color: palette.muted,
    fontSize: 11,
    textAlign: 'center',
    width: '100%',
  },
  plus: {
    color: palette.muted,
    fontSize: 28,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.85,
  },
});
