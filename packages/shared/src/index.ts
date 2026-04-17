/**
 * Internal LEGO unit: 1 LU = 0.8 mm.
 * Horizontal stud pitch = 10 LU, brick height = 12 LU, plate height = 4 LU.
 * Keep placement math in integer grid coords; convert to mm only at render.
 *
 * Three.js scene convention: 1 scene unit = 1 mm.
 */

// Raw physical constants (mm)
export const STUD_PITCH_MM = 8;
export const BRICK_HEIGHT_MM = 9.6;
export const PLATE_HEIGHT_MM = 3.2;
export const STUD_DIAMETER_MM = 4.8;
export const STUD_HEIGHT_MM = 1.7;
export const BRICK_GAP_MM = 0.2;

// Legacy LU exports
export const LU_MM = 0.8;
export const STUD_PITCH_LU = 10;
export const BRICK_HEIGHT_LU = 12;
export const PLATE_HEIGHT_LU = 4;

export const luToMm = (lu: number): number => lu * LU_MM;

/** Grid → world (mm). `gx`,`gz` are integer stud indices; `gy` is integer plate-height layer. */
export const gridToWorldX = (gx: number): number => gx * STUD_PITCH_MM;
export const gridToWorldZ = (gz: number): number => gz * STUD_PITCH_MM;
export const gridToWorldY = (gy: number): number => gy * PLATE_HEIGHT_MM;

/** World (mm) → nearest grid index. */
export const worldToGridX = (x: number): number => Math.round(x / STUD_PITCH_MM);
export const worldToGridZ = (z: number): number => Math.round(z / STUD_PITCH_MM);

// ---------- Public brick model ----------

export type {
  RectDef,
  RoundDef,
  SlopeDef,
  CurveDef,
  ShapeDef,
  Footprint,
} from './shapeDef';
export { footprintOf } from './shapeDef';

export {
  SHAPE_IDS,
  SHAPE_CATALOG,
  SHAPE_CATEGORY,
  SHAPE_LABEL,
  type BrickShape,
  type ShapeCategory,
} from './catalog';

export { BRICK_COLOR_HEX, BRICK_COLOR_ORDER, type BrickColor } from './colors';

export {
  CURRENT_SCHEMA_VERSION,
  MAX_BRICKS_PER_CREATION,
  MAX_TITLE_LENGTH,
  isBrick,
  sanitizeTitle,
  validateBaseplateBounds,
  validateCreation,
  type Creation,
} from './schema';

export {
  SHARE_HASH_PARAM,
  encodeCreation,
  decodeCreation,
  readCreationFromHash,
  buildShareUrl,
} from './urlCodec';

import { SHAPE_CATALOG, type BrickShape } from './catalog';
import { footprintOf } from './shapeDef';

/** Rotation around Y in 90° increments. */
export type Rotation = 0 | 1 | 2 | 3;

/** Baseplate extent in grid coords (exclusive upper bounds). */
export type BaseplateBounds = {
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
};

export type Brick = {
  id: string;
  shape: BrickShape;
  color: import('./colors').BrickColor;
  /** Bottom-front-left corner of the brick in grid coords. */
  gx: number;
  gz: number;
  /** Layer index in plate heights (0 = sitting on baseplate top). */
  gy: number;
  rotation: Rotation;
};

/** Cell key for collision lookups. */
export const cellKey = (gx: number, gy: number, gz: number): string => `${gx},${gy},${gz}`;

/**
 * Translation to apply AFTER rotating a brick's geometry around the world Y
 * axis, so the rotated brick's min-corner stays at the grid anchor (gx, gz).
 * `bodyW`/`bodyD` are the UNROTATED dimensions in mm (w*8, d*8).
 *
 * Rotating in-place around the geometry's own centre pushes non-square shapes
 * out of their grid cells; this offset compensates for that.
 */
export function rotationOffsetMM(
  rotation: Rotation,
  bodyW: number,
  bodyD: number,
): { x: number; z: number } {
  switch (rotation) {
    case 0:
      return { x: 0, z: 0 };
    case 1:
      return { x: 0, z: bodyW };
    case 2:
      return { x: bodyW, z: bodyD };
    case 3:
      return { x: bodyD, z: 0 };
  }
}

/**
 * All grid cells a brick occupies given its shape and rotation.
 * Footprint is swapped along X/Z when rotation is 1 or 3 (90° / 270°).
 */
export function footprintCells(
  shape: BrickShape,
  gx: number,
  gy: number,
  gz: number,
  rotation: Rotation,
): Array<{ gx: number; gy: number; gz: number }> {
  const def = SHAPE_CATALOG[shape];
  const { w, d, layers } = footprintOf(def);
  const swap = rotation % 2 === 1;
  const effW = swap ? d : w;
  const effD = swap ? w : d;
  const out: Array<{ gx: number; gy: number; gz: number }> = [];
  for (let ix = 0; ix < effW; ix++) {
    for (let iz = 0; iz < effD; iz++) {
      for (let iy = 0; iy < layers; iy++) {
        out.push({ gx: gx + ix, gy: gy + iy, gz: gz + iz });
      }
    }
  }
  return out;
}
