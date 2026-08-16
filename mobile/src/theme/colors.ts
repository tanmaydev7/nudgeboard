export type ThemeMode = 'light' | 'dark';

const dark = {
  background: '#0b0c0e',
  text: '#F5F5F4',
  muted: '#A8A29E',
  slot: '#1c1f26',
  green: '#30D158',
  purple: '#7c5cff',
  lime: '#c8f247',
  error: '#FF6B6B',
  danger: '#f87171',
  border: '#3a3f4a',
  line: '#2a2e36',
  well: '#14161c',
  otp: '#2a2150',
  glyph: '#22262e',
  handle: '#4b5160',
  pageDot: '#3a3f4a',
  pageDotOn: '#d4d4d8',
  sheet: '#1c1f26',
  reconnect: '#14352a',
  onPurple: '#F5F5F4',
};

const light = {
  background: '#F7F4EE',
  text: '#1C1917',
  muted: '#78716C',
  slot: '#E7E5E4',
  green: '#16A34A',
  purple: '#6d4aff',
  lime: '#65a30d',
  error: '#DC2626',
  danger: '#DC2626',
  border: '#D6D3D1',
  line: '#D6D3D1',
  well: '#E7E5E4',
  otp: '#EDE9FE',
  glyph: '#D6D3D1',
  handle: '#A8A29E',
  pageDot: '#D6D3D1',
  pageDotOn: '#44403C',
  sheet: '#FFFFFF',
  reconnect: '#DCFCE7',
  onPurple: '#F5F5F4',
};

export const colors = { light, dark } as const;
export type Palette = typeof dark;
