/**
 * A procedurally-generated brick shape, described by its geometry class
 * and parameters. Geometry builders dispatch on `kind` and produce the
 * matching BufferGeometry.
 */

/** Rectangular brick/plate/tile with configurable top and bottom patterns. */
export type RectDef = {
  kind: 'rect';
  /** Width in studs along X. */
  w: number;
  /** Depth in studs along Z. */
  d: number;
  /** Height in plate-layers (brick = 3, plate = 1). */
  layers: number;
  /** Top surface pattern. */
  top: 'studs' | 'smooth' | 'jumper';
  /** Bottom pattern. 'antistuds' gives tubes / pins depending on w,d. */
  bottom: 'antistuds' | 'solid';
};

/** Cylindrical / round piece (1x1 or 2x2 footprint). */
export type RoundDef = {
  kind: 'round';
  /** Footprint diameter in studs (1 or 2). */
  diameter: 1 | 2;
  layers: number;
  top: 'stud' | 'smooth';
};

/** Sloped piece — rectangular footprint with a slanted top face. */
export type SlopeDef = {
  kind: 'slope';
  w: number;
  d: number;
  layers: number;
  /** Slope angle in degrees. */
  angle: 30 | 45;
};

/** Curved slope — rectangular footprint with a curved top profile. */
export type CurveDef = {
  kind: 'curve';
  w: number;
  d: number;
  layers: number;
  profile: 'convex' | 'concave';
};

export type ShapeDef = RectDef | RoundDef | SlopeDef | CurveDef;

/** The bounding grid footprint of a shape — used for collision and ghost sizing. */
export type Footprint = {
  /** Studs along X. */
  w: number;
  /** Studs along Z. */
  d: number;
  /** Plate-layers tall. */
  layers: number;
};

export function footprintOf(def: ShapeDef): Footprint {
  switch (def.kind) {
    case 'rect':
    case 'slope':
    case 'curve':
      return { w: def.w, d: def.d, layers: def.layers };
    case 'round':
      return { w: def.diameter, d: def.diameter, layers: def.layers };
  }
}
