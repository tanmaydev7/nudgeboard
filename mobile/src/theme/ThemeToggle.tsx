import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useAppStore } from '../store';

const TRACK_W = 56;
const TRACK_H = 30;
const THUMB = 24;
const PAD = 3;
const TRAVEL = TRACK_W - THUMB - PAD * 2;

function Sun({ color }: { color: string }) {
  return (
    <View style={iconStyles.box}>
      <View style={[iconStyles.rayN, { backgroundColor: color }]} />
      <View style={[iconStyles.rayE, { backgroundColor: color }]} />
      <View style={[iconStyles.rayS, { backgroundColor: color }]} />
      <View style={[iconStyles.rayW, { backgroundColor: color }]} />
      <View style={[iconStyles.sunCore, { backgroundColor: color }]} />
    </View>
  );
}

function Moon({ color, cut }: { color: string; cut: string }) {
  return (
    <View style={iconStyles.box}>
      <View style={[iconStyles.moon, { backgroundColor: color }]} />
      <View style={[iconStyles.moonCut, { backgroundColor: cut }]} />
    </View>
  );
}

export function ThemeToggle() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const light = theme === 'light';
  const offset = useRef(new Animated.Value(light ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(offset, {
      toValue: light ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [light, offset]);

  return (
    <Pressable
      onPress={() => setTheme(light ? 'dark' : 'light')}
      accessibilityRole="switch"
      accessibilityState={{ checked: !light }}
      accessibilityLabel={
        light ? 'Switch to dark appearance' : 'Switch to light appearance'
      }
      style={[styles.track, light ? styles.trackLight : styles.trackDark]}
    >
      <Animated.View
        style={[
          styles.thumb,
          light ? styles.thumbLight : styles.thumbDark,
          {
            transform: [
              {
                translateX: offset.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, TRAVEL],
                }),
              },
            ],
          },
        ]}
      >
        {light ? (
          <Sun color="#111111" />
        ) : (
          <Moon color="#ffffff" cut="#111111" />
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    padding: PAD,
    justifyContent: 'center',
  },
  trackLight: {
    backgroundColor: '#1a1a1a',
  },
  trackDark: {
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d4d4d4',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbLight: {
    backgroundColor: '#ffffff',
  },
  thumbDark: {
    backgroundColor: '#111111',
  },
});

const iconStyles = StyleSheet.create({
  box: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rayN: {
    position: 'absolute',
    top: 0,
    width: 1.5,
    height: 3,
    borderRadius: 1,
  },
  rayS: {
    position: 'absolute',
    bottom: 0,
    width: 1.5,
    height: 3,
    borderRadius: 1,
  },
  rayW: {
    position: 'absolute',
    left: 0,
    width: 3,
    height: 1.5,
    borderRadius: 1,
  },
  rayE: {
    position: 'absolute',
    right: 0,
    width: 3,
    height: 1.5,
    borderRadius: 1,
  },
  moon: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  moonCut: {
    position: 'absolute',
    top: 0,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
  },
});
