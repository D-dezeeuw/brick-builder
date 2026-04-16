import { SHAPE_CATALOG, type BrickShape } from './catalog';
import type { BaseplateBounds, Brick, Rotation } from './index';
import type { BrickColor } from './colors';

/**
 * Serialised creation format. Versioned from day one so future schema changes
 * can either migrate or reject outright. `createdAt` is Unix milliseconds.
 *
 * BaseplateBounds is persisted so a shared / autosaved creation keeps the
 * exact plate the user was building on, rather than collapsing back to the
 * minimum extent and re-growing as bricks load.
 */
export const CURRENT_SCHEMA_VERSION = 1;

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

function isBrick(v: unknown): v is Brick {
  if (!v || typeof v !== 'object') return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.id === 'string' &&
    isShape(b.shape) &&
    typeof b.color === 'string' &&
    typeof b.gx === 'number' &&
    typeof b.gy === 'number' &&
    typeof b.gz === 'number' &&
    isRotation(b.rotation)
  );
}

function isBaseplateBounds(v: unknown): v is BaseplateBounds {
  if (!v || typeof v !== 'object') return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.minGx === 'number' &&
    typeof b.maxGx === 'number' &&
    typeof b.minGz === 'number' &&
    typeof b.maxGz === 'number' &&
    b.minGx < b.maxGx &&
    b.minGz < b.maxGz
  );
}

/**
 * Runtime guard: returns a Creation on success or null if anything is off.
 * Deliberately strict about shape/rotation/bounds because we accept input
 * from URLs and untrusted clipboards — corrupt payloads should fail fast
 * and leave the current scene untouched.
 */
export function validateCreation(raw: unknown): Creation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== CURRENT_SCHEMA_VERSION) return null;
  if (typeof r.title !== 'string') return null;
  if (typeof r.createdAt !== 'number' || !Number.isFinite(r.createdAt)) return null;
  if (!Array.isArray(r.bricks)) return null;
  if (!isBaseplateBounds(r.baseplateBounds)) return null;
  for (const b of r.bricks) {
    if (!isBrick(b)) return null;
  }
  return {
    version: r.version,
    title: r.title,
    createdAt: r.createdAt,
    bricks: r.bricks as Brick[],
    baseplateBounds: r.baseplateBounds,
  };
}

/** Unused-named imports referenced for TypeScript `isolatedModules` symmetry. */
export type { BrickColor };
