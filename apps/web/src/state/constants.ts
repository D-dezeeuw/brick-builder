export { BRICK_COLOR_HEX, BRICK_COLOR_ORDER } from '@brick/shared';

export const BASEPLATE_COLOR = '#8a8d91';

export type BaseplateColor = 'grey' | 'blue' | 'green' | 'brown';

// Sampled to pair well with the brick palette under the current ACES
// tone map — each option reads as a plausible *environment* (floor,
// water, grass, earth) without competing with a brick's own colour.
export const BASEPLATE_COLOR_HEX: Record<BaseplateColor, string> = {
  grey: '#8a8d91',
  blue: '#2a5f8c',
  green: '#4f8c3f',
  brown: '#6b4a2e',
};

export const BASEPLATE_COLOR_LABEL: Record<BaseplateColor, string> = {
  grey: 'Concrete',
  blue: 'Ocean',
  green: 'Grass',
  brown: 'Mud',
};

export const BASEPLATE_COLOR_ORDER: readonly BaseplateColor[] = [
  'grey',
  'blue',
  'green',
  'brown',
];
