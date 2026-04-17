import type { ShapeDef } from './shapeDef';

/** Ordered list of all catalog shape IDs. Order matters for sidebar display. */
export const SHAPE_IDS = [
  // --- Bricks (layers = 3)
  'brick_1x1',
  'brick_1x2',
  'brick_1x3',
  'brick_1x4',
  'brick_1x6',
  'brick_1x8',
  'brick_2x2',
  'brick_2x3',
  'brick_2x4',
  'brick_2x6',
  'brick_2x8',
  // --- Plates (layers = 1)
  'plate_1x1',
  'plate_1x2',
  'plate_1x3',
  'plate_1x4',
  'plate_1x6',
  'plate_1x8',
  'plate_2x2',
  'plate_2x3',
  'plate_2x4',
  'plate_2x6',
  'plate_2x8',
  'plate_4x4',
  'plate_4x6',
  'plate_4x8',
  // --- Tiles (smooth top, plate-height)
  'tile_1x1',
  'tile_1x2',
  'tile_1x4',
  'tile_2x2',
  'tile_2x4',
  // --- Round
  'round_plate_1x1',
  'round_plate_2x2',
  'round_brick_1x1',
  // --- Specialty
  'jumper_1x2',
  'slope45_1x2',
  'slope45_1x3',
  'slope45_2x2',
  'slope45_2x3',
  'slope45_2x4',
  'slope30_1x2',
  'cheese_1x1',
  'window_1x2x2',
  'window_1x4x3',
] as const;

export type BrickShape = (typeof SHAPE_IDS)[number];

/** Sidebar grouping. Order here controls render order in the browser. */
export type ShapeCategory = 'Bricks' | 'Plates' | 'Tiles' | 'Round' | 'Specialty';

export const SHAPE_CATEGORY: Record<BrickShape, ShapeCategory> = {
  brick_1x1: 'Bricks',
  brick_1x2: 'Bricks',
  brick_1x3: 'Bricks',
  brick_1x4: 'Bricks',
  brick_1x6: 'Bricks',
  brick_1x8: 'Bricks',
  brick_2x2: 'Bricks',
  brick_2x3: 'Bricks',
  brick_2x4: 'Bricks',
  brick_2x6: 'Bricks',
  brick_2x8: 'Bricks',
  plate_1x1: 'Plates',
  plate_1x2: 'Plates',
  plate_1x3: 'Plates',
  plate_1x4: 'Plates',
  plate_1x6: 'Plates',
  plate_1x8: 'Plates',
  plate_2x2: 'Plates',
  plate_2x3: 'Plates',
  plate_2x4: 'Plates',
  plate_2x6: 'Plates',
  plate_2x8: 'Plates',
  plate_4x4: 'Plates',
  plate_4x6: 'Plates',
  plate_4x8: 'Plates',
  tile_1x1: 'Tiles',
  tile_1x2: 'Tiles',
  tile_1x4: 'Tiles',
  tile_2x2: 'Tiles',
  tile_2x4: 'Tiles',
  round_plate_1x1: 'Round',
  round_plate_2x2: 'Round',
  round_brick_1x1: 'Round',
  jumper_1x2: 'Specialty',
  slope45_1x2: 'Specialty',
  slope45_1x3: 'Specialty',
  slope45_2x2: 'Specialty',
  slope45_2x3: 'Specialty',
  slope45_2x4: 'Specialty',
  slope30_1x2: 'Specialty',
  cheese_1x1: 'Specialty',
  window_1x2x2: 'Specialty',
  window_1x4x3: 'Specialty',
};

/** Human-readable display label for a shape. */
export const SHAPE_LABEL: Record<BrickShape, string> = {
  brick_1x1: '1×1',
  brick_1x2: '1×2',
  brick_1x3: '1×3',
  brick_1x4: '1×4',
  brick_1x6: '1×6',
  brick_1x8: '1×8',
  brick_2x2: '2×2',
  brick_2x3: '2×3',
  brick_2x4: '2×4',
  brick_2x6: '2×6',
  brick_2x8: '2×8',
  plate_1x1: '1×1',
  plate_1x2: '1×2',
  plate_1x3: '1×3',
  plate_1x4: '1×4',
  plate_1x6: '1×6',
  plate_1x8: '1×8',
  plate_2x2: '2×2',
  plate_2x3: '2×3',
  plate_2x4: '2×4',
  plate_2x6: '2×6',
  plate_2x8: '2×8',
  plate_4x4: '4×4',
  plate_4x6: '4×6',
  plate_4x8: '4×8',
  tile_1x1: '1×1',
  tile_1x2: '1×2',
  tile_1x4: '1×4',
  tile_2x2: '2×2',
  tile_2x4: '2×4',
  round_plate_1x1: '1×1 round plate',
  round_plate_2x2: '2×2 round plate',
  round_brick_1x1: '1×1 round brick',
  jumper_1x2: '1×2 jumper',
  slope45_1x2: '45° 1×2',
  slope45_1x3: '45° 1×3',
  slope45_2x2: '45° 2×2',
  slope45_2x3: '45° 2×3',
  slope45_2x4: '45° 2×4',
  slope30_1x2: '30° 1×2',
  cheese_1x1: '30° cheese',
  window_1x2x2: 'Window 1×2×2',
  window_1x4x3: 'Window 1×4×3',
};

const rect = (
  w: number,
  d: number,
  layers: number,
  top: 'studs' | 'smooth' | 'jumper',
): ShapeDef => ({
  kind: 'rect',
  w,
  d,
  layers,
  top,
  bottom: 'antistuds',
});

export const SHAPE_CATALOG: Record<BrickShape, ShapeDef> = {
  // Bricks — layers 3, studded top
  brick_1x1: rect(1, 1, 3, 'studs'),
  brick_1x2: rect(1, 2, 3, 'studs'),
  brick_1x3: rect(1, 3, 3, 'studs'),
  brick_1x4: rect(1, 4, 3, 'studs'),
  brick_1x6: rect(1, 6, 3, 'studs'),
  brick_1x8: rect(1, 8, 3, 'studs'),
  brick_2x2: rect(2, 2, 3, 'studs'),
  brick_2x3: rect(2, 3, 3, 'studs'),
  brick_2x4: rect(2, 4, 3, 'studs'),
  brick_2x6: rect(2, 6, 3, 'studs'),
  brick_2x8: rect(2, 8, 3, 'studs'),
  // Plates — layers 1, studded top
  plate_1x1: rect(1, 1, 1, 'studs'),
  plate_1x2: rect(1, 2, 1, 'studs'),
  plate_1x3: rect(1, 3, 1, 'studs'),
  plate_1x4: rect(1, 4, 1, 'studs'),
  plate_1x6: rect(1, 6, 1, 'studs'),
  plate_1x8: rect(1, 8, 1, 'studs'),
  plate_2x2: rect(2, 2, 1, 'studs'),
  plate_2x3: rect(2, 3, 1, 'studs'),
  plate_2x4: rect(2, 4, 1, 'studs'),
  plate_2x6: rect(2, 6, 1, 'studs'),
  plate_2x8: rect(2, 8, 1, 'studs'),
  plate_4x4: rect(4, 4, 1, 'studs'),
  plate_4x6: rect(4, 6, 1, 'studs'),
  plate_4x8: rect(4, 8, 1, 'studs'),
  // Tiles — layers 1, smooth top
  tile_1x1: rect(1, 1, 1, 'smooth'),
  tile_1x2: rect(1, 2, 1, 'smooth'),
  tile_1x4: rect(1, 4, 1, 'smooth'),
  tile_2x2: rect(2, 2, 1, 'smooth'),
  tile_2x4: rect(2, 4, 1, 'smooth'),
  // Round
  round_plate_1x1: { kind: 'round', diameter: 1, layers: 1, top: 'stud' },
  round_plate_2x2: { kind: 'round', diameter: 2, layers: 1, top: 'stud' },
  round_brick_1x1: { kind: 'round', diameter: 1, layers: 3, top: 'stud' },
  // Specialty
  jumper_1x2: rect(1, 2, 1, 'jumper'),
  slope45_1x2: { kind: 'slope', w: 1, d: 2, layers: 3, angle: 45 },
  slope45_1x3: { kind: 'slope', w: 1, d: 3, layers: 3, angle: 45 },
  slope45_2x2: { kind: 'slope', w: 2, d: 2, layers: 3, angle: 45 },
  slope45_2x3: { kind: 'slope', w: 2, d: 3, layers: 3, angle: 45 },
  slope45_2x4: { kind: 'slope', w: 2, d: 4, layers: 3, angle: 45 },
  // Shallow 30° slope (part 85984) — 1 wide × 2 deep × 2-plate tall.
  slope30_1x2: { kind: 'slope', w: 1, d: 2, layers: 2, angle: 30 },
  cheese_1x1: { kind: 'slope', w: 1, d: 1, layers: 2, angle: 30 },
  // Windows are their own geometry — rectangular frame with an opening
  // through the depth axis.
  window_1x2x2: { kind: 'window', w: 1, d: 2, layers: 2 },
  window_1x4x3: { kind: 'window', w: 1, d: 4, layers: 3 },
};

/**
 * Legacy shape IDs that have been removed from the catalog, mapped to
 * the closest current replacement. Used during Creation validation so
 * scenes saved against earlier versions migrate in place instead of
 * failing wholesale. `null` means "drop the brick" — no sensible
 * substitute exists.
 *
 * - `slope45_1x1`: no real 1×1×3 slope part exists; dropped.
 * - `windshield_2x2` / `windshield_2x4`: reused slope geometry, never
 *   true windshield parts. Migrate to same-footprint 45° slopes; the
 *   extra layer height is a minor visual shift but preserves placement.
 */
export const LEGACY_SHAPE_MAP: Record<string, BrickShape | null> = {
  slope45_1x1: null,
  windshield_2x2: 'slope45_2x2',
  windshield_2x4: 'slope45_2x4',
};
