import { BoxGeometry, CylinderGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  PLATE_HEIGHT_MM,
  SHAPE_FOOTPRINT,
  STUD_DIAMETER_MM,
  STUD_HEIGHT_MM,
  STUD_PITCH_MM,
  type BrickShape,
} from '@brick/shared';

type StuddedBoxOpts = {
  /** Width in studs (X axis). */
  w: number;
  /** Depth in studs (Z axis). */
  d: number;
  /** Height in plate-layers (brick = 3, plate = 1). */
  layers: number;
};

/**
 * Build a brick body (box) with studs on top. Origin is the bottom-front-left
 * corner of the body, so a mesh placed at `(gx*8, gy*3.2, gz*8)` sits correctly
 * on the grid.
 *
 * Phase 1: no anti-studs, no wall insets, no tolerance gap — those land in Phase 3.
 */
export function buildStuddedBox({ w, d, layers }: StuddedBoxOpts): BufferGeometry {
  const bodyW = w * STUD_PITCH_MM;
  const bodyD = d * STUD_PITCH_MM;
  const bodyH = layers * PLATE_HEIGHT_MM;

  const body = new BoxGeometry(bodyW, bodyH, bodyD);
  body.translate(bodyW / 2, bodyH / 2, bodyD / 2);

  const parts: BufferGeometry[] = [body];
  const studRadius = STUD_DIAMETER_MM / 2;

  for (let ix = 0; ix < w; ix++) {
    for (let iz = 0; iz < d; iz++) {
      const stud = new CylinderGeometry(studRadius, studRadius, STUD_HEIGHT_MM, 16);
      stud.translate(
        ix * STUD_PITCH_MM + STUD_PITCH_MM / 2,
        bodyH + STUD_HEIGHT_MM / 2,
        iz * STUD_PITCH_MM + STUD_PITCH_MM / 2,
      );
      parts.push(stud);
    }
  }

  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('mergeGeometries returned null');
  merged.computeVertexNormals();
  return merged;
}

const geometryCache = new Map<BrickShape, BufferGeometry>();

export function getBrickGeometry(shape: BrickShape): BufferGeometry {
  let g = geometryCache.get(shape);
  if (!g) {
    const { w, d, layers } = SHAPE_FOOTPRINT[shape];
    g = buildStuddedBox({ w, d, layers });
    geometryCache.set(shape, g);
  }
  return g;
}
