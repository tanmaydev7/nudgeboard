import { View } from 'react-native';

type IconProps = {
  size?: number;
  color?: string;
};

export function PlayIcon({ size = 16, color = '#FFFFFF' }: IconProps) {
  const w = size;
  const h = size;
  return (
    <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 0,
          height: 0,
          borderStyle: 'solid',
          borderLeftWidth: size * 0.75,
          borderTopWidth: size * 0.45,
          borderBottomWidth: size * 0.45,
          borderLeftColor: color,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          marginLeft: size * 0.15,
        }}
      />
    </View>
  );
}

export function PauseIcon({ size = 16, color = '#FFFFFF' }: IconProps) {
  const barW = Math.max(2.5, size * 0.22);
  const barH = size * 0.75;
  const gap = size * 0.22;
  return (
    <View
      style={{
        width: size,
        height: size,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap,
      }}
    >
      <View
        style={{
          width: barW,
          height: barH,
          backgroundColor: color,
          borderRadius: 1.5,
        }}
      />
      <View
        style={{
          width: barW,
          height: barH,
          backgroundColor: color,
          borderRadius: 1.5,
        }}
      />
    </View>
  );
}

export function SkipBackIcon({ size = 16, color = '#FFFFFF' }: IconProps) {
  const barW = Math.max(2, size * 0.14);
  const barH = size * 0.65;
  return (
    <View
      style={{
        width: size,
        height: size,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: barW,
          height: barH,
          backgroundColor: color,
          borderRadius: 1,
          marginRight: 1,
        }}
      />
      <View
        style={{
          width: 0,
          height: 0,
          borderStyle: 'solid',
          borderRightWidth: size * 0.55,
          borderTopWidth: size * 0.35,
          borderBottomWidth: size * 0.35,
          borderRightColor: color,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
        }}
      />
    </View>
  );
}

export function StopIcon({ size = 16, color = '#FFFFFF' }: IconProps) {
  const innerSize = Math.round(size * 0.65);
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: innerSize,
          height: innerSize,
          backgroundColor: color,
          borderRadius: 2,
        }}
      />
    </View>
  );
}

export function SkipForwardIcon({ size = 16, color = '#FFFFFF' }: IconProps) {
  const barW = Math.max(2, size * 0.14);
  const barH = size * 0.65;
  return (
    <View
      style={{
        width: size,
        height: size,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 0,
          height: 0,
          borderStyle: 'solid',
          borderLeftWidth: size * 0.55,
          borderTopWidth: size * 0.35,
          borderBottomWidth: size * 0.35,
          borderLeftColor: color,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
        }}
      />
      <View
        style={{
          width: barW,
          height: barH,
          backgroundColor: color,
          borderRadius: 1,
          marginLeft: 1,
        }}
      />
    </View>
  );
}

export function VolumeHighIcon({ size = 18, color = '#A855F7' }: IconProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
      }}
    >
      {/* Speaker box */}
      <View
        style={{
          width: size * 0.22,
          height: size * 0.35,
          backgroundColor: color,
          borderRadius: 1,
        }}
      />
      {/* Speaker cone */}
      <View
        style={{
          width: 0,
          height: 0,
          borderStyle: 'solid',
          borderRightWidth: size * 0.3,
          borderTopWidth: size * 0.32,
          borderBottomWidth: size * 0.32,
          borderRightColor: color,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
        }}
      />
      {/* Waves */}
      <View style={{ marginLeft: 2, gap: 2 }}>
        <View
          style={{
            width: size * 0.12,
            height: size * 0.38,
            borderRightWidth: 1.5,
            borderColor: color,
            borderRadius: size * 0.15,
          }}
        />
      </View>
      <View style={{ marginLeft: 1 }}>
        <View
          style={{
            width: size * 0.14,
            height: size * 0.6,
            borderRightWidth: 1.5,
            borderColor: color,
            borderRadius: size * 0.25,
          }}
        />
      </View>
    </View>
  );
}

export function VolumeLowIcon({ size = 18, color = '#A855F7' }: IconProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
      }}
    >
      {/* Speaker box */}
      <View
        style={{
          width: size * 0.22,
          height: size * 0.35,
          backgroundColor: color,
          borderRadius: 1,
        }}
      />
      {/* Speaker cone */}
      <View
        style={{
          width: 0,
          height: 0,
          borderStyle: 'solid',
          borderRightWidth: size * 0.3,
          borderTopWidth: size * 0.32,
          borderBottomWidth: size * 0.32,
          borderRightColor: color,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
        }}
      />
      {/* Wave */}
      <View style={{ marginLeft: 2 }}>
        <View
          style={{
            width: size * 0.12,
            height: size * 0.4,
            borderRightWidth: 1.5,
            borderColor: color,
            borderRadius: size * 0.15,
          }}
        />
      </View>
    </View>
  );
}

export function VolumeMuteIcon({ size = 18, color = '#EF4444' }: IconProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
      }}
    >
      {/* Speaker box */}
      <View
        style={{
          width: size * 0.22,
          height: size * 0.35,
          backgroundColor: color,
          borderRadius: 1,
        }}
      />
      {/* Speaker cone */}
      <View
        style={{
          width: 0,
          height: 0,
          borderStyle: 'solid',
          borderRightWidth: size * 0.3,
          borderTopWidth: size * 0.32,
          borderBottomWidth: size * 0.32,
          borderRightColor: color,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
        }}
      />
      {/* X mark */}
      <View
        style={{
          marginLeft: 3,
          width: size * 0.3,
          height: size * 0.3,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            position: 'absolute',
            width: size * 0.32,
            height: 1.5,
            backgroundColor: color,
            transform: [{ rotate: '45deg' }],
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: size * 0.32,
            height: 1.5,
            backgroundColor: color,
            transform: [{ rotate: '-45deg' }],
          }}
        />
      </View>
    </View>
  );
}

export function MusicNoteIcon({ size = 20, color = '#A855F7' }: IconProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: size * 0.6,
          height: size * 0.6,
          borderRadius: size * 0.3,
          borderWidth: 1.5,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: size * 0.2,
            height: size * 0.2,
            borderRadius: size * 0.1,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

export function SpotifyIcon({ size = 18, color = '#1DB954' }: IconProps) {
  const r = size / 2;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* 3 curved waves */}
      <View
        style={{
          width: size * 0.62,
          height: size * 0.14,
          borderRadius: size * 0.08,
          backgroundColor: '#000000',
          transform: [{ rotate: '-8deg' }],
          marginBottom: size * 0.04,
        }}
      />
      <View
        style={{
          width: size * 0.52,
          height: size * 0.12,
          borderRadius: size * 0.06,
          backgroundColor: '#000000',
          transform: [{ rotate: '-8deg' }],
          marginBottom: size * 0.04,
        }}
      />
      <View
        style={{
          width: size * 0.42,
          height: size * 0.1,
          borderRadius: size * 0.05,
          backgroundColor: '#000000',
          transform: [{ rotate: '-8deg' }],
        }}
      />
    </View>
  );
}

export function RotatePhoneIcon({ size = 20, color = '#A855F7' }: IconProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: size * 0.82,
          height: size * 0.56,
          borderRadius: 4,
          borderWidth: 1.5,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: size * 0.1,
            height: size * 0.1,
            borderRadius: 1,
            backgroundColor: color,
            position: 'absolute',
            right: 2,
          }}
        />
      </View>
    </View>
  );
}
