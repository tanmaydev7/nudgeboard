import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrowserWindow, nativeImage, session, type NativeImage } from 'electron';
import type { PresetIconId, UtilityAction } from '../shared/ipc-types';
import {
  IoPlayForward,
  IoPlayBack,
  IoStop,
  IoVolumeHigh,
  IoVolumeMedium,
  IoVolumeMute,
  IoLockClosed,
  IoCamera,
  IoArrowBack,
  IoArrowForward,
} from 'react-icons/io5';
import { HiPlayPause } from 'react-icons/hi2';
import {
  LuTerminal,
  LuFileCode2,
  LuFileText,
  LuCode,
  LuFolder,
  LuRocket,
  LuGamepad2,
  LuMusic,
  LuWrench,
  LuStar,
  LuZap,
  LuGlobe,
  LuSettings,
  LuCamera,
} from 'react-icons/lu';

type IconComponent = React.ComponentType<{
  size?: number | string;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}>;

const readSvgAttr = (attrs: string, name: string): string | undefined => {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'i'));
  return match?.[1];
};

/** Unwrap a react-icons <svg> into a <g> so Electron can rasterize it. */
const flattenReactIconSvg = (markup: string, glyphColor: string): string => {
  const open = markup.match(/^<svg\b([^>]*)>/i);
  if (!open) {
    return markup.replace(/currentColor/g, glyphColor);
  }
  const attrs = open[1];
  const viewBox = readSvgAttr(attrs, 'viewBox') ?? '0 0 24 24';
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  const vbW = parts[2] || 24;
  const width = Number(readSvgAttr(attrs, 'width')) || vbW;
  const scale = width / vbW;
  const stroke = (readSvgAttr(attrs, 'stroke') ?? 'currentColor').replace(
    /currentColor/g,
    glyphColor,
  );
  const fill = (readSvgAttr(attrs, 'fill') ?? 'none').replace(
    /currentColor/g,
    glyphColor,
  );
  const inner = markup
    .replace(/^<svg\b[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
    .replace(/currentColor/g, glyphColor);
  const gAttrs = [
    `transform="scale(${scale})"`,
    `stroke="${stroke}"`,
    `fill="${fill}"`,
    readSvgAttr(attrs, 'stroke-width')
      ? `stroke-width="${readSvgAttr(attrs, 'stroke-width')}"`
      : '',
    readSvgAttr(attrs, 'stroke-linecap')
      ? `stroke-linecap="${readSvgAttr(attrs, 'stroke-linecap')}"`
      : '',
    readSvgAttr(attrs, 'stroke-linejoin')
      ? `stroke-linejoin="${readSvgAttr(attrs, 'stroke-linejoin')}"`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `<g ${gAttrs}>${inner}</g>`;
};

let iconSvgSeq = 0;

const renderIconSvg = (
  Component: IconComponent,
  gradientStart: string,
  gradientEnd: string,
  glyphColor: string,
  badgeBg?: string,
  size = 48,
): string => {
  const iconMarkup = renderToStaticMarkup(
    React.createElement(Component, {
      size,
      color: glyphColor,
      style: { display: 'block' },
    }),
  );
  const flattened = flattenReactIconSvg(iconMarkup, glyphColor);
  const offset = (100 - size) / 2;
  const uid = `nb${iconSvgSeq++}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256">
  <defs>
    <linearGradient id="${uid}bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${gradientStart}" />
      <stop offset="100%" stop-color="${gradientEnd}" />
    </linearGradient>
    <linearGradient id="${uid}border" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.22)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0.04)" />
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="92" height="92" rx="22" fill="url(#${uid}bg)" stroke="url(#${uid}border)" stroke-width="2" />
  ${badgeBg ? `<circle cx="50" cy="50" r="32" fill="${badgeBg}" opacity="0.12" />` : ''}
  <g transform="translate(${offset}, ${offset})">
    ${flattened}
  </g>
</svg>`;
};

export const UTILITY_SVGS: Record<UtilityAction, string> = {
  media_play_pause: renderIconSvg(
    HiPlayPause,
    '#0f172a',
    '#1e1b4b',
    '#38bdf8',
    '#38bdf8',
    52,
  ),
  media_next: renderIconSvg(
    IoPlayForward,
    '#0f172a',
    '#1e293b',
    '#38bdf8',
    '#38bdf8',
    46,
  ),
  media_prev: renderIconSvg(
    IoPlayBack,
    '#0f172a',
    '#1e293b',
    '#38bdf8',
    '#38bdf8',
    46,
  ),
  media_stop: renderIconSvg(
    IoStop,
    '#1f1216',
    '#2d151c',
    '#f43f5e',
    '#f43f5e',
    44,
  ),
  volume_up: renderIconSvg(
    IoVolumeHigh,
    '#062419',
    '#0b3824',
    '#34d399',
    '#34d399',
    50,
  ),
  volume_down: renderIconSvg(
    IoVolumeMedium,
    '#062419',
    '#0b3824',
    '#34d399',
    '#34d399',
    50,
  ),
  volume_mute: renderIconSvg(
    IoVolumeMute,
    '#291a07',
    '#3b2408',
    '#fbbf24',
    '#fbbf24',
    50,
  ),
  lock_workstation: renderIconSvg(
    IoLockClosed,
    '#1e1035',
    '#2e1065',
    '#c084fc',
    '#c084fc',
    44,
  ),
  screenshot: renderIconSvg(
    IoCamera,
    '#082f49',
    '#0c4a6e',
    '#38bdf8',
    '#38bdf8',
    48,
  ),
  switch_desktop_left: renderIconSvg(
    IoArrowBack,
    '#1e1035',
    '#2e1065',
    '#c084fc',
    '#c084fc',
    48,
  ),
  switch_desktop_right: renderIconSvg(
    IoArrowForward,
    '#1e1035',
    '#2e1065',
    '#c084fc',
    '#c084fc',
    48,
  ),
};

export const PRESET_SVGS = {
  terminal: renderIconSvg(
    LuTerminal,
    '#0f172a',
    '#1e293b',
    '#38bdf8',
    '#38bdf8',
    48,
  ),
  script: renderIconSvg(
    LuFileCode2,
    '#1e1b4b',
    '#312e81',
    '#818cf8',
    '#818cf8',
    48,
  ),
  code: renderIconSvg(
    LuCode,
    '#14532d',
    '#166534',
    '#4ade80',
    '#4ade80',
    48,
  ),
  folder: renderIconSvg(
    LuFolder,
    '#713f12',
    '#854d0e',
    '#fde047',
    '#fde047',
    48,
  ),
  rocket: renderIconSvg(
    LuRocket,
    '#701a75',
    '#86198f',
    '#f472b6',
    '#f472b6',
    48,
  ),
  gamepad: renderIconSvg(
    LuGamepad2,
    '#831843',
    '#9d174d',
    '#fb7185',
    '#fb7185',
    50,
  ),
  music: renderIconSvg(
    LuMusic,
    '#1e1b4b',
    '#3730a3',
    '#a5b4fc',
    '#a5b4fc',
    48,
  ),
  wrench: renderIconSvg(
    LuWrench,
    '#1f2937',
    '#374151',
    '#9ca3af',
    '#9ca3af',
    48,
  ),
  star: renderIconSvg(
    LuStar,
    '#78350f',
    '#92400e',
    '#fbbf24',
    '#fbbf24',
    48,
  ),
  zap: renderIconSvg(
    LuZap,
    '#7c2d12',
    '#9a3412',
    '#fb923c',
    '#fb923c',
    48,
  ),
  globe: renderIconSvg(
    LuGlobe,
    '#082f49',
    '#0c4a6e',
    '#38bdf8',
    '#38bdf8',
    48,
  ),
  settings: renderIconSvg(
    LuSettings,
    '#1f2937',
    '#374151',
    '#9ca3af',
    '#9ca3af',
    48,
  ),
  camera: renderIconSvg(
    LuCamera,
    '#082f49',
    '#0c4a6e',
    '#38bdf8',
    '#38bdf8',
    48,
  ),
  file: renderIconSvg(
    LuFileText,
    '#1e1b4b',
    '#312e81',
    '#818cf8',
    '#818cf8',
    48,
  ),
} as const satisfies Record<PresetIconId | 'script' | 'wrench', string>;

const pngCache = new Map<string, string>();
const mobilePngCache = new Map<string, string>();
const MOBILE_ICON_SIZE = 128;

let rasterWindow: BrowserWindow | null = null;
let rasterChain: Promise<unknown> = Promise.resolve();

const isBitmapDataUrl = (value: string): boolean =>
  value.startsWith('data:image/png') ||
  value.startsWith('data:image/jpeg') ||
  value.startsWith('data:image/jpg') ||
  value.startsWith('data:image/webp');

const decodeSvgDataUrl = (dataUrl: string): string => {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) {
    return dataUrl;
  }
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (/;base64/i.test(header)) {
    return Buffer.from(payload, 'base64').toString('utf8');
  }
  return decodeURIComponent(payload);
};

const getRasterWindow = (size: number): BrowserWindow => {
  if (rasterWindow && !rasterWindow.isDestroyed()) {
    rasterWindow.setSize(size, size);
    return rasterWindow;
  }
  rasterWindow = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    frame: false,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#000000',
    webPreferences: {
      sandbox: true,
      session: session.fromPartition('icon-rasterizer'),
    },
  });
  rasterWindow.setMenu(null);
  return rasterWindow;
};

const rasterizeWithChromium = async (
  svg: string,
  size: number,
): Promise<string> => {
  const win = getRasterWindow(size);
  const svgUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#000;}</style></head>
<body><img id="i" width="${size}" height="${size}" src="${svgUrl}"></body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const png = (await win.webContents.executeJavaScript(`
    (async () => {
      const img = document.getElementById('i');
      if (!img) throw new Error('missing icon image');
      if (img.decode) {
        await img.decode();
      } else {
        await new Promise((resolve, reject) => {
          if (img.complete && img.naturalWidth) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('icon image failed'));
        });
      }
      const canvas = document.createElement('canvas');
      canvas.width = ${size};
      canvas.height = ${size};
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      ctx.drawImage(img, 0, 0, ${size}, ${size});
      return canvas.toDataURL('image/png');
    })()
  `)) as string;
  if (typeof png !== 'string' || !png.startsWith('data:image/png')) {
    throw new Error('Chromium did not return a PNG icon');
  }
  return png;
};

export const closeIconRasterizer = (): void => {
  if (rasterWindow && !rasterWindow.isDestroyed()) {
    rasterWindow.destroy();
  }
  rasterWindow = null;
};

export const rasterizeSvgToPngDataUrl = (
  svg: string,
  size = MOBILE_ICON_SIZE,
): Promise<string> => {
  const key = `${size}:${svg}`;
  const cached = mobilePngCache.get(key);
  if (cached) {
    return Promise.resolve(cached);
  }

  const job = rasterChain.then(async () => {
    const again = mobilePngCache.get(key);
    if (again) {
      return again;
    }
    const png = await rasterizeWithChromium(svg, size);
    mobilePngCache.set(key, png);
    return png;
  });
  rasterChain = job.then(
    (): undefined => undefined,
    (): undefined => undefined,
  );
  return job;
};

export const ensurePngDataUrl = async (
  icon?: string,
): Promise<string | undefined> => {
  if (!icon) {
    return undefined;
  }
  if (isBitmapDataUrl(icon)) {
    return icon;
  }
  if (!icon.startsWith('data:image/svg')) {
    return icon;
  }
  try {
    return await rasterizeSvgToPngDataUrl(decodeSvgDataUrl(icon), MOBILE_ICON_SIZE);
  } catch {
    return undefined;
  }
};

export const renderSvgToPngDataUrl = (svg: string, _size = 256): string => {
  const cached = pngCache.get(svg);
  if (cached) {
    return cached;
  }

  // nativeImage does not decode SVG. createFromDataURL(svg) can CHECK-crash
  // Chromium (EXC_BREAKPOINT / SIGTRAP). Desktop <img> can paint SVG; mobile
  // PNG conversion goes through rasterizeSvgToPngDataUrl / ensurePngDataUrl.
  const fallbackUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  pngCache.set(svg, fallbackUrl);
  return fallbackUrl;
};

export const getUtilityIconDataUrls = (): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const [action, svg] of Object.entries(UTILITY_SVGS)) {
    const png = renderSvgToPngDataUrl(svg);
    map[action] = png;
    map[`utility:${action}`] = png;
  }
  return map;
};

export const getPresetIconDataUrls = (): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const [id, svg] of Object.entries(PRESET_SVGS)) {
    const png = renderSvgToPngDataUrl(svg);
    map[id] = png;
    map[`preset:${id}`] = png;
  }
  return map;
};

export const getIconForPresetOrUtility = (
  idOrPath: string,
): string | undefined => {
  const clean = idOrPath.replace(/^(preset|utility):/, '');
  const svg =
    UTILITY_SVGS[clean as UtilityAction] ??
    PRESET_SVGS[clean as keyof typeof PRESET_SVGS] ??
    PRESET_SVGS.terminal;
  if (!svg) {
    return undefined;
  }
  return renderSvgToPngDataUrl(svg);
};

// Base64 square 32x32 PNG from icons/png/nudgeboard-32.png
const SQUARE_ICON_32_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADSUlEQVR42u3WyU9TURQHYP8HUYGAKHOYC4UWCpShQFuGRwFLaSszVjCKIENQmVp9IIMmBCgJKoEUSUggGqNiXJCoC1caXWp0Z6IJMShytz9zn/RCU0BaF7ro4ibtaU7f13vO7bmHvA4fw79chzwAD2C3YHhYJBLFUrboexr39fFHvCiRxelrGtsvx9/vBMQJEkRFxh4csPOL7IvGg4PCnOI0dtAclwHy5GJUKa2oVlqhkZlRID/n9JCQ4HCHnNLyPLR2l+BSfyHq25OQnBbjPkCVZsKgnuCGgWCkcgM3z3wBp2jadwcudhiwtNqO+68a8fBtJQrLJK4D7PWkAF5PBMTQFmKw9iMyZdyePXChtRqLj/sYQqFOcL0H7CsumMO1CuKE6NQ+h/fRgF1zjKe1WFgeweITimiDTB7t+imgv4pubWqcARYd2UYYthBVG6hXzSDwZAiOeHk75NTV1ME2b8XC8rCASJWLEBQYKpyGAwPsR02ZZkJ/OREQ150QP6BXmgXEzpymhhbM3p6DbX5SQCjVmUKclsHlJsxLNaFXSxiiseARzLo1hhiq/AZpTLFDztmaTtwdX8LsnTnY7k1Cpc5x/xRQQI+WoG8LYcy1gsvoAK/fZIhe7QcE+EawHJOxG9PDT7cQs1DmKV0H2LeTAq6eIgyhyx4X4jXKGYdynM9/BnH874c06MyYsrzE9PCKgMhVqF0vgb2hUmINuFJGGEKdOCDUPDQ4Ak2q1W2EkcCQNSHkGPP7MHH5DaYsLzA9sgKpWO56E9pXdBCHrlLCECoxzz477hOBLs0nDLCd2IQsshol8m6MtbxniKS4DPeHUY7MhM4SwhBFKaMOwyg3tRYW3XeG4CvW0Kx5gFuNnzHWShGvkS4pcH8YUUBHCWGIcoXVaRZo0s3CER3YUY6R6nWGyEnTun8KFDIT2jSEIXYD0GGkl9v2RChSKv4O0FpMGEKbbd11HNO/5TbNOyfEaM06sqVG94cRBbRwhCHypaN7XkjioxTo0X51Qshiy90fRhGBHJqLCEMo4vl9O1ocpoNF95Mh6BgXhXDu3wkDfBOQGccjS8QjW8QjKpD74x0vJbIBBUk8CpN4FEl4BPkleG7FHoAH8H8DfgG0MksIoXZ8XwAAAABJRU5ErkJggg==';

export const createTrayNativeImage = (): NativeImage => {
  const candidatePaths = [
    path.join(__dirname, '../../../icons/nudgeboard-icon-square.png'),
    path.join(__dirname, '../../icons/nudgeboard-icon-square.png'),
    path.join(process.cwd(), '../icons/nudgeboard-icon-square.png'),
    path.join(__dirname, '../../../icons/png/nudgeboard-32.png'),
    path.join(__dirname, '../../icons/png/nudgeboard-32.png'),
    path.join(process.cwd(), 'icons/png/nudgeboard-32.png'),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) {
        return img.resize({ width: 32, height: 32 });
      }
    }
  }
  return nativeImage.createFromBuffer(
    Buffer.from(SQUARE_ICON_32_BASE64, 'base64'),
  );
};

export const createAppNativeImage = (): NativeImage => {
  const candidatePaths = [
    path.join(__dirname, '../../../icons/nudgeboard-icon-square.png'),
    path.join(__dirname, '../../icons/nudgeboard-icon-square.png'),
    path.join(process.cwd(), '../icons/nudgeboard-icon-square.png'),
    path.join(__dirname, '../../../icons/png/nudgeboard-256.png'),
    path.join(__dirname, '../../icons/png/nudgeboard-256.png'),
    path.join(__dirname, '../../icons/png/nudgeboard-512.png'),
    path.join(process.cwd(), 'icons/png/nudgeboard-256.png'),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) {
        return img;
      }
    }
  }
  return createTrayNativeImage().resize({ width: 256, height: 256 });
};
