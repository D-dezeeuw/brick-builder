import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const CEILING_THICKNESS_MM = 1.6;
export const ANTI_STUD_TUBE_OUTER_R = 3.25;
export const ANTI_STUD_PIN_R = 0.9;

/**
 * mergeGeometries() requires every input to be either all indexed or all
 * non-indexed. ExtrudeGeometry produces non-indexed geometry, while
 * Box/CylinderGeometry are indexed — mixing them fails with a cryptic
 * "make sure index attribute exists among all geometries" error.
 * Normalize everything to non-indexed before merging.
 */
export function safeMerge(parts: BufferGeometry[]): BufferGeometry {
  const normalized = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(normalized);
  if (!merged) throw new Error('mergeGeometries returned null');
  return merged;
}
