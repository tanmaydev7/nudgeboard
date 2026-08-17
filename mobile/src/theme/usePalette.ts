import { useMemo } from 'react';
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';
import { useAppStore } from '../store';
import { colors, type Palette } from './colors';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function usePalette(): Palette {
  return colors[useAppStore((s) => s.theme)];
}

export function useThemedStyles<T extends NamedStyles<T>>(
  factory: (palette: Palette) => T,
): T {
  const palette = usePalette();
  return useMemo(() => factory(palette), [factory, palette]);
}
