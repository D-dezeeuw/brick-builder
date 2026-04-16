/**
 * 16-color classic-leaning palette. Hex strings compatible with three.js Color.
 * Picked to cover common LEGO families: greys, primaries, greens, blues, earth.
 */

export type BrickColor =
  | 'white'
  | 'lightGrey'
  | 'darkGrey'
  | 'black'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'darkGreen'
  | 'green'
  | 'lime'
  | 'teal'
  | 'lightBlue'
  | 'blue'
  | 'purple'
  | 'brown'
  | 'tan';

export const BRICK_COLOR_HEX: Record<BrickColor, string> = {
  white: '#f2f3f2',
  lightGrey: '#a0a5a9',
  darkGrey: '#545759',
  black: '#1b2a34',
  red: '#c91a09',
  orange: '#fe8a18',
  yellow: '#f5cd30',
  darkGreen: '#003f2c',
  green: '#237841',
  lime: '#bbe90b',
  teal: '#009b8b',
  lightBlue: '#6a97c4',
  blue: '#0055bf',
  purple: '#81007b',
  brown: '#583927',
  tan: '#e4cd9e',
};

export const BRICK_COLOR_ORDER: readonly BrickColor[] = [
  'white',
  'lightGrey',
  'darkGrey',
  'black',
  'red',
  'orange',
  'yellow',
  'darkGreen',
  'green',
  'lime',
  'teal',
  'lightBlue',
  'blue',
  'purple',
  'brown',
  'tan',
];
