import { BoxGeometry, type BufferGeometry, CylinderGeometry } from 'three';
import {
  PLATE_HEIGHT_MM,
  STUD_DIAMETER_MM,
  STUD_HEIGHT_MM,
  STUD_PITCH_MM,
  type WindowDef,
} from '@brick/shared';
import { safeMerge } from './common';

/**
 * Rectangular window brick: four frame rails around a punch-through
 * opening along the depth axis. Kept procedural so every catalog entry
 * (`window_1x2x2`, `window_1x4x3`, future sizes) builds from the same
 * code path rather than shipping a static mesh.
 *
 * Layout (top-down view, X→right, Z→forward):
 *   +----------------+
 *   |     top        |  <- runs along X, full depth Z, frame-thickness Y
 *   |+--------------+|
 *   |||            |||  <- left + right rails fill the sides
 *   |||   opening  |||
 *   |||            |||
 *   |+--------------+|
 *   |     bottom     |
 *   +----------------+
 *
 * The frame is a single merged BufferGeometry — no CSG. Studs sit on
 * top of the top rail so the brick attaches like any studded piece.
 * Back face is fully open too so peers looking through see daylight.
 */

/** LEGO-ish frame thickness. ~2.4 mm reads as a plausible wall. */
const FRAME_MM = 2.4;

export function buildWindowGeometry(def: WindowDef): BufferGeometry {
  const { w, d, layers } = def;
  const bodyW = w * STUD_PITCH_MM;
  const bodyD = d * STUD_PITCH_MM;
  const bodyH = layers * PLATE_HEIGHT_MM;

  // Rail thicknesses — top/bottom span full width + depth, left/right
  // fill the remaining height between them.
  const innerH = Math.max(0, bodyH - 2 * FRAME_MM);

  const parts: BufferGeometry[] = [];

  // Top rail.
  const top = new BoxGeometry(bodyW, FRAME_MM, bodyD);
  top.translate(bodyW / 2, bodyH - FRAME_MM / 2, bodyD / 2);
  parts.push(top);

  // Bottom rail.
  const bottom = new BoxGeometry(bodyW, FRAME_MM, bodyD);
  bottom.translate(bodyW / 2, FRAME_MM / 2, bodyD / 2);
  parts.push(bottom);

  if (innerH > 0) {
    // Left rail (sits at x=0 .. FRAME_MM).
    const left = new BoxGeometry(FRAME_MM, innerH, bodyD);
    left.translate(FRAME_MM / 2, FRAME_MM + innerH / 2, bodyD / 2);
    parts.push(left);

    // Right rail (sits at x=bodyW-FRAME_MM .. bodyW). Only if wide enough
    // to not overlap the left rail — at w=1 and FRAME_MM=2.4 they're
    // independent; at hypothetical w=0 (degenerate) we'd skip.
    if (bodyW > 2 * FRAME_MM) {
      const right = new BoxGeometry(FRAME_MM, innerH, bodyD);
      right.translate(bodyW - FRAME_MM / 2, FRAME_MM + innerH / 2, bodyD / 2);
      parts.push(right);
    }
  }

  // Studs on top.
  const studR = STUD_DIAMETER_MM / 2;
  const studY = bodyH + STUD_HEIGHT_MM / 2;
  for (let ix = 0; ix < w; ix++) {
    for (let iz = 0; iz < d; iz++) {
      const stud = new CylinderGeometry(studR, studR, STUD_HEIGHT_MM, 16);
      stud.translate(
        ix * STUD_PITCH_MM + STUD_PITCH_MM / 2,
        studY,
        iz * STUD_PITCH_MM + STUD_PITCH_MM / 2,
      );
      parts.push(stud);
    }
  }

  const merged = safeMerge(parts);
  merged.computeVertexNormals();
  return merged;
}
