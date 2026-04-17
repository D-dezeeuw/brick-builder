import type { BufferGeometry } from 'three';
import { SHAPE_CATALOG, type BrickShape, type ShapeDef } from '@brick/shared';
import { buildRectGeometry } from './rect';
import { buildRoundGeometry } from './round';
import { buildSlopeGeometry } from './slope';
import { buildWindowGeometry } from './window';

export function buildGeometry(def: ShapeDef, showStuds = true): BufferGeometry {
  switch (def.kind) {
    case 'rect':
      return buildRectGeometry(def, showStuds);
    case 'round':
      return buildRoundGeometry(def, showStuds);
    case 'slope':
      return buildSlopeGeometry(def, showStuds);
    case 'window':
      return buildWindowGeometry(def);
    case 'curve':
      throw new Error(`Geometry builder for 'curve' not yet implemented.`);
  }
}

// Cache key mixes in the studs flag so toggling back and forth reuses
// the already-built geometry rather than re-merging every tick.
type CacheKey = `${BrickShape}|${'s' | 'n'}`;
const cache = new Map<CacheKey, BufferGeometry>();

function keyFor(shape: BrickShape, showStuds: boolean): CacheKey {
  return `${shape}|${showStuds ? 's' : 'n'}`;
}

export function getGeometry(shape: BrickShape, showStuds = true): BufferGeometry {
  const key = keyFor(shape, showStuds);
  let g = cache.get(key);
  if (!g) {
    g = buildGeometry(SHAPE_CATALOG[shape], showStuds);
    cache.set(key, g);
  }
  return g;
}

export function clearGeometryCache(): void {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}

/**
 * Informed by Brick Architect's top-30 list — plates and tiles dominate
 * real builds, so those cache entries earn their slot on first paint.
 */
const WARM_CACHE_SHAPES: BrickShape[] = [
  'plate_1x2',
  'plate_1x1',
  'tile_1x1',
  'plate_2x2',
  'plate_2x4',
  'plate_1x4',
  'tile_1x2',
  'plate_2x3',
  'plate_1x3',
  'plate_1x6',
  'brick_1x1',
  'brick_1x2',
  'brick_2x2',
  'brick_2x4',
  'brick_1x4',
  'tile_2x2',
  'tile_2x4',
  'round_plate_1x1',
  'round_plate_2x2',
  'cheese_1x1',
];

/**
 * Build the warm-cache entries opportunistically across idle frames so we
 * never block the first paint. Safe to call multiple times — each already
 * cached shape is a no-op.
 */
export function warmGeometryCache(): void {
  const schedule =
    typeof requestIdleCallback === 'function'
      ? (cb: () => void) => requestIdleCallback(() => cb())
      : (cb: () => void) => setTimeout(cb, 0);
  let i = 0;
  const step = () => {
    if (i >= WARM_CACHE_SHAPES.length) return;
    getGeometry(WARM_CACHE_SHAPES[i++]);
    schedule(step);
  };
  schedule(step);
}
