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

/**
 * Window brick — rectangular frame with a punch-through opening along the
 * depth (Z) axis. Studs sit on top of the top rail; the left and right
 * rails carry the opening's sides. Dimensions match LEGO window parts
 * (1×2×2, 1×4×3). Pairs well with the `transparent` modifier to make a
 * glass pane, but the frame + studs respect it too — the whole brick
 * becomes tinted glass, which matches the vibe of the editor.
 */
export type WindowDef = {
  kind: 'window';
  /** Width in studs along X (wall thickness in stud units). Usually 1. */
  w: number;
  /** Depth in studs along Z (opening length). */
  d: number;
  /** Height in plate layers. */
  layers: number;
};

export type ShapeDef = RectDef | RoundDef | SlopeDef | CurveDef | WindowDef;

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
    case 'window':
      return { w: def.w, d: def.d, layers: def.layers };
    case 'round':
      return { w: def.diameter, d: def.diameter, layers: def.layers };
  }
}
