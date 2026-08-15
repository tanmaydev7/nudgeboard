import { useState } from 'react';
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { GRID_COLUMNS, GRID_ROWS, GRID_SLOTS } from '../protocol';
import { useAppStore } from '../store';
import { colors } from '../theme';

const palette = colors.dark;
const GAP = 10;

export function DeckGrid() {
  const deck = useAppStore((s) => s.deck);
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
  const tiles = Array.from(
    { length: GRID_SLOTS },
    (_, index) => deck[index] ?? null,
  );

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {tileSize > 0 ? (
        <View style={[styles.grid, { width: tileSize * GRID_COLUMNS + GAP * (GRID_COLUMNS - 1) }]}>
          {tiles.map((tile, index) => {
            const glyph = tile ? [...tile.name][0] : '+';
            return (
              <View
                key={tile?.id ?? `empty-${index}`}
                style={[
                  styles.tile,
                  tile ? styles.filled : null,
                  { width: tileSize, height: tileSize },
                ]}
              >
                {tile ? (
                  <>
                    {tile.icon ? (
                      <Image
                        source={{ uri: tile.icon }}
                        style={{ width: iconSize, height: iconSize }}
                        resizeMode="contain"
                      />
                    ) : (
                      <View
                        style={[
                          styles.glyphWrap,
                          { width: iconSize, height: iconSize },
                        ]}
                      >
                        <Text style={styles.glyph}>{glyph}</Text>
                      </View>
                    )}
                    <Text style={styles.name} numberOfLines={1}>
                      {tile.name}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.plus}>+</Text>
                )}
              </View>
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
});
