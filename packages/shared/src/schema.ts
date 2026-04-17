import { LEGACY_SHAPE_MAP, SHAPE_CATALOG, type BrickShape } from './catalog';
import type { BaseplateBounds, Brick, Rotation } from './index';
import { BRICK_COLOR_HEX, type BrickColor } from './colors';

/**
 * Serialised creation format. Versioned from day one so future schema changes
 * can either migrate or reject outright. `createdAt` is Unix milliseconds.
 *
 * BaseplateBounds is persisted so a shared / autosaved creation keeps the
 * exact plate the user was building on, rather than collapsing back to the
 * minimum extent and re-growing as bricks load.
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Caps on untrusted input. These protect against DoS (giant JSON from a
 * crafted URL / dropped file / realtime peer) and bound memory use for the
 * scene renderer. The numbers are generous enough for real builds but
 * reject-on-sight pathological payloads.
 */
export const MAX_TITLE_LENGTH = 256;
export const MAX_BRICKS_PER_CREATION = 10000;
/** Integer grid coord bound — no real build goes near this. */
const MAX_GRID_COORD = 100000;

export type Creation = {
  version: number;
  title: string;
  createdAt: number;
  bricks: Brick[];
  baseplateBounds: BaseplateBounds;
};

const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];

function isRotation(v: unknown): v is Rotation {
  return typeof v === 'number' && (ROTATIONS as readonly number[]).includes(v);
}

function isShape(v: unknown): v is BrickShape {
  return typeof v === 'string' && v in SHAPE_CATALOG;
}

function isColor(v: unknown): v is BrickColor {
  return typeof v === 'string' && v in BRICK_COLOR_HEX;
}

/** Finite integer within the grid-coord envelope. */
function isGridCoord(v: unknown, allowNegative: boolean): boolean {
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) return false;
  if (!allowNegative && v < 0) return false;
  return Math.abs(v) <= MAX_GRID_COORD;
}

export function isBrick(v: unknown): v is Brick {
  if (!v || typeof v !== 'object') return false;
  const b = v as Record<string, unknown>;
  // `transparent` is optional — if present it must be a boolean.
  if (b.transparent !== undefined && typeof b.transparent !== 'boolean') return false;
  return (
    typeof b.id === 'string' &&
    b.id.length > 0 &&
    b.id.length <= 64 &&
    isShape(b.shape) &&
    isColor(b.color) &&
    isGridCoord(b.gx, true) &&
    isGridCoord(b.gy, false) &&
    isGridCoord(b.gz, true) &&
    isRotation(b.rotation)
  );
}

function isBaseplateBounds(v: unknown): v is BaseplateBounds {
  if (!v || typeof v !== 'object') return false;
  const b = v as Record<string, unknown>;
  return (
    isGridCoord(b.minGx, true) &&
    isGridCoord(b.maxGx, true) &&
    isGridCoord(b.minGz, true) &&
    isGridCoord(b.maxGz, true) &&
    (b.minGx as number) < (b.maxGx as number) &&
    (b.minGz as number) < (b.maxGz as number)
  );
}

/**
 * Runtime guard: returns a Creation on success or null if anything is off.
 * Deliberately strict — we accept input from URLs, clipboards, dropped
 * files, and realtime peers. Corrupt or hostile payloads should fail fast
 * and leave the current scene untouched.
 *
 * Bricks whose shape was removed from the catalog get migrated via
 * LEGACY_SHAPE_MAP: a substitute shape keeps the brick; `null` drops it
 * silently rather than rejecting the whole creation.
 */
export function validateCreation(raw: unknown): Creation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== CURRENT_SCHEMA_VERSION) return null;
  if (typeof r.title !== 'string' || r.title.length > MAX_TITLE_LENGTH) return null;
  if (typeof r.createdAt !== 'number' || !Number.isFinite(r.createdAt)) return null;
  if (!Array.isArray(r.bricks) || r.bricks.length > MAX_BRICKS_PER_CREATION) return null;
  if (!isBaseplateBounds(r.baseplateBounds)) return null;
  const migrated: Brick[] = [];
  for (const raw of r.bricks) {
    const b = migrateLegacyBrick(raw);
    if (b === 'drop') continue;
    if (!isBrick(b)) return null;
    migrated.push(b);
  }
  return {
    version: r.version,
    title: r.title,
    createdAt: r.createdAt,
    bricks: migrated,
    baseplateBounds: r.baseplateBounds,
  };
}

/**
 * If a brick's shape is in LEGACY_SHAPE_MAP, rewrite it (or signal drop).
 * Returns the unchanged input for current shapes — they hit `isBrick` next
 * and reject if malformed.
 */
function migrateLegacyBrick(raw: unknown): unknown | 'drop' {
  if (!raw || typeof raw !== 'object') return raw;
  const shape = (raw as Record<string, unknown>).shape;
  if (typeof shape !== 'string') return raw;
  if (!(shape in LEGACY_SHAPE_MAP)) return raw;
  const replacement = LEGACY_SHAPE_MAP[shape];
  if (replacement === null) return 'drop';
  return { ...(raw as Record<string, unknown>), shape: replacement };
}

/** Clamp/sanitize a peer-supplied title to the max length. */
export function sanitizeTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return raw.slice(0, MAX_TITLE_LENGTH);
}

/** Validate peer-supplied baseplate bounds; returns null if malformed. */
export function validateBaseplateBounds(raw: unknown): BaseplateBounds | null {
  return isBaseplateBounds(raw) ? (raw as BaseplateBounds) : null;
}

/** Unused-named imports referenced for TypeScript `isolatedModules` symmetry. */
export type { BrickColor };
