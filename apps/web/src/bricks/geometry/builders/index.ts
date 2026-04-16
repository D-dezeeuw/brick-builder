import type { BufferGeometry } from 'three';
import { SHAPE_CATALOG, type BrickShape, type ShapeDef } from '@brick/shared';
import { buildRectGeometry } from './rect';
import { buildRoundGeometry } from './round';
import { buildSlopeGeometry } from './slope';

export function buildGeometry(def: ShapeDef): BufferGeometry {
  switch (def.kind) {
    case 'rect':
      return buildRectGeometry(def);
    case 'round':
      return buildRoundGeometry(def);
    case 'slope':
      return buildSlopeGeometry(def);
    case 'curve':
      throw new Error(`Geometry builder for 'curve' not yet implemented.`);
  }
}

const cache = new Map<BrickShape, BufferGeometry>();

export function getGeometry(shape: BrickShape): BufferGeometry {
  let g = cache.get(shape);
  if (!g) {
    g = buildGeometry(SHAPE_CATALOG[shape]);
    cache.set(shape, g);
  }
  return g;
}

export function clearGeometryCache(): void {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
