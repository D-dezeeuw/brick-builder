import {
  type BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Path,
  Shape,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  PLATE_HEIGHT_MM,
  STUD_DIAMETER_MM,
  STUD_HEIGHT_MM,
  STUD_PITCH_MM,
  type RoundDef,
} from '@brick/shared';
import { ANTI_STUD_PIN_R, ANTI_STUD_TUBE_OUTER_R, CEILING_THICKNESS_MM } from './common';

/**
 * Round plate / round brick — 1×1 or 2×2 footprint. Cylindrical body with
 * a hollow center (tube for 2×2, small pin for 1×1) and studs on top at
 * the square-grid positions the footprint would occupy, so these pieces
 * snap cleanly onto a normal studded grid.
 */
export function buildRoundGeometry(def: RoundDef): BufferGeometry {
  const { diameter, layers, top } = def;
  const bodyRadius = (diameter * STUD_PITCH_MM) / 2;
  const bodyH = layers * PLATE_HEIGHT_MM;
  const cx = bodyRadius;
  const cz = bodyRadius;

  const parts: BufferGeometry[] = [buildRoundBody(bodyRadius, bodyH, diameter, cx, cz)];
  parts.push(...buildRoundTop(cx, cz, bodyH, diameter, top));

  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('round mergeGeometries returned null');
  merged.computeVertexNormals();
  return merged;
}

function buildRoundBody(
  bodyRadius: number,
  bodyH: number,
  diameter: 1 | 2,
  cx: number,
  cz: number,
): BufferGeometry {
  const carvedDepth = bodyH - CEILING_THICKNESS_MM;
  if (carvedDepth <= 0.2) {
    const solid = new CylinderGeometry(bodyRadius, bodyRadius, bodyH, 32);
    solid.translate(cx, bodyH / 2, cz);
    return solid;
  }

  const outline = new Shape();
  outline.absarc(cx, cz, bodyRadius, 0, Math.PI * 2, false);
  const holeR = diameter === 2 ? ANTI_STUD_TUBE_OUTER_R : ANTI_STUD_PIN_R;
  const hole = new Path();
  hole.absarc(cx, cz, holeR, 0, Math.PI * 2, true);
  outline.holes.push(hole);

  const walls = new ExtrudeGeometry(outline, {
    depth: carvedDepth,
    bevelEnabled: false,
    curveSegments: 24,
  });
  walls.rotateX(-Math.PI / 2);
  walls.translate(0, 0, 2 * cz);

  const cap = new CylinderGeometry(bodyRadius, bodyRadius, CEILING_THICKNESS_MM, 32);
  cap.translate(cx, carvedDepth + CEILING_THICKNESS_MM / 2, cz);

  const body = mergeGeometries([walls, cap]);
  if (!body) throw new Error('round body merge failed');
  return body;
}

function buildRoundTop(
  cx: number,
  cz: number,
  bodyH: number,
  diameter: 1 | 2,
  top: RoundDef['top'],
): BufferGeometry[] {
  if (top === 'smooth') return [];
  const studR = STUD_DIAMETER_MM / 2;
  const studY = bodyH + STUD_HEIGHT_MM / 2;

  if (diameter === 1) {
    const stud = new CylinderGeometry(studR, studR, STUD_HEIGHT_MM, 16);
    stud.translate(cx, studY, cz);
    return [stud];
  }

  // 2×2 → four studs on the embedded grid.
  const studs: BufferGeometry[] = [];
  for (let ix = 0; ix < 2; ix++) {
    for (let iz = 0; iz < 2; iz++) {
      const stud = new CylinderGeometry(studR, studR, STUD_HEIGHT_MM, 16);
      stud.translate(
        ix * STUD_PITCH_MM + STUD_PITCH_MM / 2,
        studY,
        iz * STUD_PITCH_MM + STUD_PITCH_MM / 2,
      );
      studs.push(stud);
    }
  }
  return studs;
}
