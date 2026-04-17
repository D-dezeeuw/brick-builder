import { type BufferGeometry, CylinderGeometry, ExtrudeGeometry, Shape } from 'three';
import {
  PLATE_HEIGHT_MM,
  STUD_DIAMETER_MM,
  STUD_HEIGHT_MM,
  STUD_PITCH_MM,
  type SlopeDef,
} from '@brick/shared';
import { safeMerge } from './common';

/**
 * Triangular-prism slope piece. `d == 1` (cheese-style) is a pure wedge.
 * `d >= 2` gets a 1-stud flat shelf at the tall end carrying studs, then
 * the slope descends across the remaining depth.
 *
 * Orientation: tall edge at world Z=0 (back), slope descends toward Z=d*8.
 * Rotation (R) cycles through the 4 facing directions.
 */
export function buildSlopeGeometry(def: SlopeDef, showStuds = true): BufferGeometry {
  const { w, d, layers } = def;
  const bodyH = layers * PLATE_HEIGHT_MM;
  const pitch = STUD_PITCH_MM;

  const cross = new Shape();
  if (d === 1) {
    // Pure wedge.
    cross.moveTo(0, 0);
    cross.lineTo(pitch, 0);
    cross.lineTo(0, bodyH);
    cross.lineTo(0, 0);
  } else {
    // Shelf at the back (shape-X ∈ [0, pitch]) + slope.
    cross.moveTo(0, 0);
    cross.lineTo(d * pitch, 0);
    cross.lineTo(pitch, bodyH);
    cross.lineTo(0, bodyH);
    cross.lineTo(0, 0);
  }

  const prism = new ExtrudeGeometry(cross, {
    depth: w * pitch,
    bevelEnabled: false,
    curveSegments: 1,
  });
  // Remap: shape-X → world-Z (depth), extrusion → world-X (width).
  prism.rotateY(-Math.PI / 2);
  prism.translate(w * pitch, 0, 0);

  const parts: BufferGeometry[] = [prism];

  if (d >= 2 && showStuds) {
    const studR = STUD_DIAMETER_MM / 2;
    const studY = bodyH + STUD_HEIGHT_MM / 2;
    for (let ix = 0; ix < w; ix++) {
      const stud = new CylinderGeometry(studR, studR, STUD_HEIGHT_MM, 16);
      stud.translate((ix + 0.5) * pitch, studY, pitch / 2);
      parts.push(stud);
    }
  }

  const merged = safeMerge(parts);
  merged.computeVertexNormals();
  return merged;
}
