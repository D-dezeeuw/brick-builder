/**
 * LEGO unit: 1 LU = 0.8 mm.
 * Stud pitch = 10 LU, brick height = 12 LU, plate height = 4 LU.
 * Keep all placement math in integer LUs; convert to mm only at render.
 */
export const LU_MM = 0.8;
export const STUD_PITCH_LU = 10;
export const BRICK_HEIGHT_LU = 12;
export const PLATE_HEIGHT_LU = 4;
export const STUD_DIAMETER_MM = 4.8;
export const STUD_HEIGHT_MM = 1.7;
export const BRICK_GAP_MM = 0.2;

export const luToMm = (lu: number): number => lu * LU_MM;
