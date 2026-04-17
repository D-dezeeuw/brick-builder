/**
 * Piece inventory: derive a per-SKU count from the live brick map.
 *
 * A SKU is the tuple (shape, color, transparent). Everything else —
 * rotation, position — is irrelevant to "what do I need to buy." The
 * Parts panel consumes this output directly; the exporters build
 * BrickLink XML / CSV from the same rows.
 */

import {
  BL_COLOR_ID,
  BL_COLOR_ID_TRANS,
  BRICK_COLOR_HEX,
  SHAPE_CATEGORY,
  SHAPE_LABEL,
  SHAPE_TO_PART,
  type Brick,
  type BrickColor,
  type BrickShape,
  type PartInfo,
  type ShapeCategory,
} from '@brick/shared';

export type InventoryRow = {
  /** Stable key "<shape>|<color>|<trans>" — useful as a React list key. */
  key: string;
  shape: BrickShape;
  color: BrickColor;
  transparent: boolean;
  qty: number;

  /** Resolved part + color metadata for display / export. */
  part: PartInfo;
  /** BrickLink color lookup — null if this (color, trans) combo has no BL counterpart. */
  blColor: { id: number; name: string } | null;
  /** Hex swatch from our palette (approximation, for the row avatar). */
  hex: string;

  /** Categorisation for group-by UI. */
  category: ShapeCategory;
  shapeLabel: string;
};

/** Build inventory rows from a `bricks` Map, sorted for predictable display. */
export function buildInventory(bricks: Map<string, Brick>): InventoryRow[] {
  const counts = new Map<string, { shape: BrickShape; color: BrickColor; transparent: boolean; qty: number }>();
  for (const b of bricks.values()) {
    const transparent = b.transparent === true;
    const key = `${b.shape}|${b.color}|${transparent ? 't' : 'o'}`;
    const existing = counts.get(key);
    if (existing) existing.qty += 1;
    else counts.set(key, { shape: b.shape, color: b.color, transparent, qty: 1 });
  }

  const rows: InventoryRow[] = [];
  for (const [key, v] of counts) {
    const part = SHAPE_TO_PART[v.shape];
    const blColor = v.transparent
      ? (BL_COLOR_ID_TRANS[v.color] ?? null)
      : BL_COLOR_ID[v.color];
    rows.push({
      key,
      shape: v.shape,
      color: v.color,
      transparent: v.transparent,
      qty: v.qty,
      part,
      blColor,
      hex: BRICK_COLOR_HEX[v.color],
      category: SHAPE_CATEGORY[v.shape],
      shapeLabel: SHAPE_LABEL[v.shape],
    });
  }

  // Default sort: category → part name → color name → opaque-before-trans.
  rows.sort((a, b) => {
    if (a.category !== b.category) return CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (a.part.name !== b.part.name) return a.part.name.localeCompare(b.part.name);
    const an = a.blColor?.name ?? 'zzz';
    const bn = b.blColor?.name ?? 'zzz';
    if (an !== bn) return an.localeCompare(bn);
    return Number(a.transparent) - Number(b.transparent);
  });
  return rows;
}

const CATEGORY_ORDER: Record<ShapeCategory, number> = {
  Bricks: 0,
  Plates: 1,
  Tiles: 2,
  Round: 3,
  Specialty: 4,
};

export type GroupBy = 'color' | 'shape' | 'category';

/** Group rows by the chosen axis. Preserves in-group sort order from buildInventory. */
export function groupInventory(
  rows: InventoryRow[],
  groupBy: GroupBy,
): Array<{ label: string; rows: InventoryRow[] }> {
  const groups = new Map<string, InventoryRow[]>();
  for (const r of rows) {
    const label = groupLabel(r, groupBy);
    const arr = groups.get(label);
    if (arr) arr.push(r);
    else groups.set(label, [r]);
  }
  // Stable order of group headings — matches the order keys were first seen,
  // which follows buildInventory's sort.
  return Array.from(groups, ([label, rs]) => ({ label, rows: rs }));
}

function groupLabel(r: InventoryRow, by: GroupBy): string {
  switch (by) {
    case 'color':
      return r.blColor?.name ?? (r.transparent ? `(unmappable trans ${r.color})` : r.color);
    case 'shape':
      return r.part.name;
    case 'category':
      return r.category;
  }
}

/** Sum of `qty` across all rows. */
export function totalPieces(rows: InventoryRow[]): number {
  let n = 0;
  for (const r of rows) n += r.qty;
  return n;
}

/** Count of distinct SKUs (rows). */
export function uniqueSkus(rows: InventoryRow[]): number {
  return rows.length;
}
