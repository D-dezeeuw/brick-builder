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

// Legacy LU exports (kept for geometry tooling that prefers integer units)
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

// ---------- Brick types ----------

/** Brick shape identifier — width x depth (studs) plus height class. */
export type BrickShape = '1x1' | '1x1P';

export type BrickColor = 'red' | 'yellow' | 'blue';

/** Rotation around Y in 90° increments. */
export type Rotation = 0 | 1 | 2 | 3;

export type Brick = {
  id: string;
  shape: BrickShape;
  color: BrickColor;
  /** Bottom-front-left corner of the brick in grid coords. */
  gx: number;
  gz: number;
  /** Layer index in plate heights (0 = sitting on baseplate top). */
  gy: number;
  rotation: Rotation;
};

/** Footprint dimensions for a shape (in studs). Expands in Phase 2. */
export type ShapeFootprint = {
  /** Width along X (studs). */
  w: number;
  /** Depth along Z (studs). */
  d: number;
  /** Height in plate-layers (brick = 3, plate = 1). */
  layers: number;
};

export const SHAPE_FOOTPRINT: Record<BrickShape, ShapeFootprint> = {
  '1x1': { w: 1, d: 1, layers: 3 },
  '1x1P': { w: 1, d: 1, layers: 1 },
};

/** Cell key for collision lookups. */
export const cellKey = (gx: number, gy: number, gz: number): string => `${gx},${gy},${gz}`;

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
  const { w, d, layers } = SHAPE_FOOTPRINT[shape];
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
