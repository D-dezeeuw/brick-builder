/**
 * Maps our procedural shape + color catalog to real-world LEGO / BrickLink
 * identifiers so the Parts panel can show "what would I buy to build this"
 * and export to BrickLink's wanted-list format.
 *
 * IDs verified against BrickLink catalog (primary source) and LEGO Design IDs
 * (secondary). For a handful of shapes we use a close-match with a `note`
 * rather than a perfect one (e.g. tiles — we render without the modern
 * groove, but real buyers typically want the current 3070b/3069b/3068b
 * revisions anyway).
 */

import type { BrickColor } from './colors';
import type { BrickShape } from './catalog';

export type PartInfo = {
  /** BrickLink part ID — the primary lookup key for ordering. */
  blId: string;
  /** LEGO Design ID — stamped on the part itself. Often equal to blId. */
  designId: string;
  /** Human-readable part name as BrickLink lists it. */
  name: string;
  /**
   * Optional caveat. Set when the rendered geometry doesn't perfectly
   * match the part (e.g. grooved vs un-grooved tile), so the UI can
   * display a discreet warning next to the row.
   */
  note?: string;
};

export const SHAPE_TO_PART: Record<BrickShape, PartInfo> = {
  // --- Bricks (height 3 plates = 1 brick)
  brick_1x1: { blId: '3005', designId: '3005', name: 'Brick 1 x 1' },
  brick_1x2: { blId: '3004', designId: '3004', name: 'Brick 1 x 2' },
  brick_1x3: { blId: '3622', designId: '3622', name: 'Brick 1 x 3' },
  brick_1x4: { blId: '3010', designId: '3010', name: 'Brick 1 x 4' },
  brick_1x6: { blId: '3009', designId: '3009', name: 'Brick 1 x 6' },
  brick_1x8: { blId: '3008', designId: '3008', name: 'Brick 1 x 8' },
  brick_2x2: { blId: '3003', designId: '3003', name: 'Brick 2 x 2' },
  brick_2x3: { blId: '3002', designId: '3002', name: 'Brick 2 x 3' },
  brick_2x4: { blId: '3001', designId: '3001', name: 'Brick 2 x 4' },
  brick_2x6: { blId: '2456', designId: '2456', name: 'Brick 2 x 6' },
  brick_2x8: { blId: '3007', designId: '3007', name: 'Brick 2 x 8' },

  // --- Plates (height 1 plate)
  plate_1x1: { blId: '3024', designId: '3024', name: 'Plate 1 x 1' },
  plate_1x2: { blId: '3023', designId: '3023', name: 'Plate 1 x 2' },
  plate_1x3: { blId: '3623', designId: '3623', name: 'Plate 1 x 3' },
  plate_1x4: { blId: '3710', designId: '3710', name: 'Plate 1 x 4' },
  plate_1x6: { blId: '3666', designId: '3666', name: 'Plate 1 x 6' },
  plate_1x8: { blId: '3460', designId: '3460', name: 'Plate 1 x 8' },
  plate_2x2: { blId: '3022', designId: '3022', name: 'Plate 2 x 2' },
  plate_2x3: { blId: '3021', designId: '3021', name: 'Plate 2 x 3' },
  plate_2x4: { blId: '3020', designId: '3020', name: 'Plate 2 x 4' },
  plate_2x6: { blId: '3795', designId: '3795', name: 'Plate 2 x 6' },
  plate_2x8: { blId: '3034', designId: '3034', name: 'Plate 2 x 8' },
  plate_4x4: { blId: '3031', designId: '3031', name: 'Plate 4 x 4' },
  plate_4x6: { blId: '3032', designId: '3032', name: 'Plate 4 x 6' },
  plate_4x8: { blId: '3035', designId: '3035', name: 'Plate 4 x 8' },

  // --- Tiles (smooth top). 3070b / 3069b / 3068b are the modern "with groove"
  // revisions; BrickLink treats them as the current part for those sizes.
  tile_1x1: {
    blId: '3070b',
    designId: '3070',
    name: 'Tile 1 x 1 with Groove',
    note: 'Rendered without the underside groove — same part number.',
  },
  tile_1x2: {
    blId: '3069b',
    designId: '3069',
    name: 'Tile 1 x 2 with Groove',
    note: 'Rendered without the underside groove — same part number.',
  },
  tile_1x4: { blId: '2431', designId: '2431', name: 'Tile 1 x 4' },
  tile_2x2: {
    blId: '3068b',
    designId: '3068',
    name: 'Tile 2 x 2 with Groove',
    note: 'Rendered without the underside groove — same part number.',
  },
  tile_2x4: { blId: '87079', designId: '87079', name: 'Tile 2 x 4' },

  // --- Round
  round_plate_1x1: { blId: '4073', designId: '4073', name: 'Plate, Round 1 x 1' },
  round_plate_2x2: { blId: '4032a', designId: '4032', name: 'Plate, Round 2 x 2 with Axle Hole' },
  round_brick_1x1: { blId: '3062b', designId: '3062', name: 'Brick, Round 1 x 1' },

  // --- Specialty
  jumper_1x2: {
    blId: '15573',
    designId: '15573',
    name: 'Plate, Modified 1 x 2 with 1 Stud on Top (Jumper)',
  },
  slope45_1x2: { blId: '3040', designId: '3040', name: 'Slope 45 2 x 1' },
  slope45_1x3: { blId: '4286', designId: '4286', name: 'Slope 45 3 x 1' },
  slope45_2x2: { blId: '3039', designId: '3039', name: 'Slope 45 2 x 2' },
  slope45_2x3: { blId: '3038', designId: '3038', name: 'Slope 45 2 x 3' },
  slope45_2x4: { blId: '3037', designId: '3037', name: 'Slope 45 2 x 4' },
  slope30_1x2: {
    blId: '85984',
    designId: '85984',
    name: 'Slope 30 1 x 2 x 2/3',
  },
  cheese_1x1: {
    blId: '54200',
    designId: '54200',
    name: 'Slope 30 1 x 1 x 2/3 (Cheese Slope)',
  },
  window_1x2x2: {
    blId: '60592',
    designId: '60592',
    name: 'Window 1 x 2 x 2 Frame',
  },
  window_1x4x3: {
    blId: '60594',
    designId: '60594',
    name: 'Window 1 x 4 x 3 Frame',
  },
};

/** BrickLink numeric color IDs for the opaque variant of each palette entry. */
export const BL_COLOR_ID: Record<BrickColor, { id: number; name: string }> = {
  white: { id: 1, name: 'White' },
  lightGrey: { id: 86, name: 'Light Bluish Gray' },
  darkGrey: { id: 85, name: 'Dark Bluish Gray' },
  black: { id: 11, name: 'Black' },
  red: { id: 5, name: 'Red' },
  orange: { id: 4, name: 'Orange' },
  yellow: { id: 3, name: 'Yellow' },
  darkGreen: { id: 80, name: 'Dark Green' },
  green: { id: 6, name: 'Green' },
  lime: { id: 34, name: 'Lime' },
  teal: { id: 39, name: 'Dark Turquoise' },
  lightBlue: { id: 42, name: 'Medium Blue' },
  blue: { id: 7, name: 'Blue' },
  purple: { id: 89, name: 'Dark Purple' },
  brown: { id: 88, name: 'Reddish Brown' },
  tan: { id: 2, name: 'Tan' },
};

/**
 * BrickLink IDs for the transparent variant of each palette entry. Not every
 * color has a real trans counterpart (no Trans-Tan, Trans-Brown, Trans-Grey,
 * Trans-Teal in the regular palette), so entries are `Partial`. Rows that
 * resolve to `undefined` get flagged in the Parts panel and are excluded
 * from the BrickLink XML export.
 */
export const BL_COLOR_ID_TRANS: Partial<Record<BrickColor, { id: number; name: string }>> = {
  white: { id: 12, name: 'Trans-Clear' },
  black: { id: 13, name: 'Trans-Black' },
  red: { id: 17, name: 'Trans-Red' },
  orange: { id: 98, name: 'Trans-Orange' },
  yellow: { id: 19, name: 'Trans-Yellow' },
  green: { id: 20, name: 'Trans-Green' },
  darkGreen: { id: 20, name: 'Trans-Green' },
  lime: { id: 16, name: 'Trans-Neon Green' },
  lightBlue: { id: 15, name: 'Trans-Light Blue' },
  blue: { id: 14, name: 'Trans-Dark Blue' },
  purple: { id: 51, name: 'Trans-Purple' },
};

/** Build a BrickLink catalog URL for a specific part + color combo. */
export function bricklinkUrl(partId: string, colorId: number): string {
  return `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(partId)}&idColor=${colorId}`;
}
