import type { BrickColor } from '@brick/shared';

/** Classic-ish LEGO colors. Hex strings consumable by three.js Color. */
export const BRICK_COLOR_HEX: Record<BrickColor, string> = {
  red: '#c91a09',
  yellow: '#f5cd30',
  blue: '#0055bf',
  teal: '#009b8b',
  black: '#1b2a34',
};

export const BRICK_COLOR_ORDER: readonly BrickColor[] = [
  'red',
  'yellow',
  'blue',
  'teal',
  'black',
];

export const BASEPLATE_STUDS = 32; // 32x32 studs for Phase 1
export const BASEPLATE_COLOR = '#8a8d91';
