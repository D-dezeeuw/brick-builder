import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Path,
  Shape,
} from 'three';
import {
  PLATE_HEIGHT_MM,
  STUD_DIAMETER_MM,
  STUD_HEIGHT_MM,
  STUD_PITCH_MM,
  type RectDef,
} from '@brick/shared';

import { ANTI_STUD_PIN_R, ANTI_STUD_TUBE_OUTER_R, CEILING_THICKNESS_MM, safeMerge } from './common';

/**
 * Rectangular brick / plate / tile geometry, optionally hollowed on the bottom
 * with authentic LEGO anti-stud tubes (≥2×2) or pins (1-wide strips).
 * Origin at body bottom-front-left so world placement stays `(gx*8, gy*3.2, gz*8)`.
 */

export function buildRectGeometry(def: RectDef, showStuds = true): BufferGeometry {
  const { w, d, layers, top, bottom } = def;
  const bodyW = w * STUD_PITCH_MM;
  const bodyD = d * STUD_PITCH_MM;
  const bodyH = layers * PLATE_HEIGHT_MM;

  const parts: BufferGeometry[] = [buildBody(bodyW, bodyD, bodyH, w, d, bottom)];
  // showStuds=false collapses every stud-bearing top variant to a smooth
  // one so the brick reads like a tile — used by the "hide studs" scene
  // toggle for clean screenshots.
  const effectiveTop = showStuds ? top : 'smooth';
  parts.push(...buildTop(bodyW, bodyD, bodyH, w, d, effectiveTop));

  const merged = safeMerge(parts);
  merged.computeVertexNormals();
  return merged;
}

/** Body = pierced lower walls + solid cap on top, or a plain solid box. */
function buildBody(
  bodyW: number,
  bodyD: number,
  bodyH: number,
  w: number,
  d: number,
  bottom: RectDef['bottom'],
): BufferGeometry {
  const canCarve = bottom === 'antistuds' && bodyH > CEILING_THICKNESS_MM + 0.2;
  if (!canCarve) {
    const box = new BoxGeometry(bodyW, bodyH, bodyD);
    box.translate(bodyW / 2, bodyH / 2, bodyD / 2);
    return box;
  }

  // Outer outline = the brick footprint at y=0.
  const outline = new Shape();
  outline.moveTo(0, 0);
  outline.lineTo(bodyW, 0);
  outline.lineTo(bodyW, bodyD);
  outline.lineTo(0, bodyD);
  outline.lineTo(0, 0);

  addAntiStudHoles(outline, w, d);

  const carvedDepth = bodyH - CEILING_THICKNESS_MM;
  const walls = new ExtrudeGeometry(outline, {
    depth: carvedDepth,
    bevelEnabled: false,
    curveSegments: 16,
  });
  // Extrude points along +Z by default. Rotate so extrusion goes up +Y and
  // shift so the footprint sits at Z ∈ [0, bodyD] (rotation flips Z negative).
  walls.rotateX(-Math.PI / 2);
  walls.translate(0, 0, bodyD);

  const cap = new BoxGeometry(bodyW, CEILING_THICKNESS_MM, bodyD);
  cap.translate(bodyW / 2, carvedDepth + CEILING_THICKNESS_MM / 2, bodyD / 2);

  return safeMerge([walls, cap]);
}

function addAntiStudHoles(outline: Shape, w: number, d: number): void {
  // ≥ 2×2: tubes at interior grid points (where 4 studs meet).
  if (w >= 2 && d >= 2) {
    for (let i = 1; i < w; i++) {
      for (let j = 1; j < d; j++) {
        outline.holes.push(
          circleHole(i * STUD_PITCH_MM, j * STUD_PITCH_MM, ANTI_STUD_TUBE_OUTER_R),
        );
      }
    }
    return;
  }
  // 1-wide strip with length ≥ 2: pins on the centerline between studs.
  if (w === 1 && d >= 2) {
    for (let j = 1; j < d; j++) {
      outline.holes.push(circleHole(STUD_PITCH_MM / 2, j * STUD_PITCH_MM, ANTI_STUD_PIN_R));
    }
    return;
  }
  if (d === 1 && w >= 2) {
    for (let i = 1; i < w; i++) {
      outline.holes.push(circleHole(i * STUD_PITCH_MM, STUD_PITCH_MM / 2, ANTI_STUD_PIN_R));
    }
    return;
  }
  // 1×1 has no anti-studs at all.
}

function circleHole(x: number, y: number, r: number): Path {
  const p = new Path();
  p.absarc(x, y, r, 0, Math.PI * 2, true);
  return p;
}

/** Top surface: full grid of studs, one centered stud (jumper), or nothing (tile). */
function buildTop(
  bodyW: number,
  bodyD: number,
  bodyH: number,
  w: number,
  d: number,
  top: RectDef['top'],
): BufferGeometry[] {
  if (top === 'smooth') return [];

  const studR = STUD_DIAMETER_MM / 2;
  const studY = bodyH + STUD_HEIGHT_MM / 2;

  if (top === 'jumper') {
    const stud = new CylinderGeometry(studR, studR, STUD_HEIGHT_MM, 16);
    stud.translate(bodyW / 2, studY, bodyD / 2);
    return [stud];
  }

  const studs: BufferGeometry[] = [];
  for (let ix = 0; ix < w; ix++) {
    for (let iz = 0; iz < d; iz++) {
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
