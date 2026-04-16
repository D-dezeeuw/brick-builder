import { SHAPE_CATALOG, footprintOf, type Brick } from '@brick/shared';

export type CreationStats = {
  brickCount: number;
  uniqueColors: number;
  /** Bounding extent in studs (w × d) and plate-layers (h). Null when empty. */
  extent: { w: number; d: number; h: number } | null;
};

export function computeStats(bricks: Iterable<Brick>): CreationStats {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxY = 0;
  let count = 0;
  const colors = new Set<string>();

  for (const b of bricks) {
    count++;
    colors.add(b.color);
    const fp = footprintOf(SHAPE_CATALOG[b.shape]);
    const swap = b.rotation % 2 === 1;
    const w = swap ? fp.d : fp.w;
    const d = swap ? fp.w : fp.d;
    if (b.gx < minX) minX = b.gx;
    if (b.gx + w > maxX) maxX = b.gx + w;
    if (b.gz < minZ) minZ = b.gz;
    if (b.gz + d > maxZ) maxZ = b.gz + d;
    const top = b.gy + fp.layers;
    if (top > maxY) maxY = top;
  }

  return {
    brickCount: count,
    uniqueColors: colors.size,
    extent: count === 0 ? null : { w: maxX - minX, d: maxZ - minZ, h: maxY },
  };
}
