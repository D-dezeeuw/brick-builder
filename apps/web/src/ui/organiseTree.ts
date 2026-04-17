/**
 * Helpers for the Layers tree view: given the live `bricks` Map, build
 * a per-layer grouping by (shape, color, transparent) so the tree has
 * three usable levels (Layer → Group → Brick). Also exposes display
 * helpers for human-readable labels.
 */

import {
  DEFAULT_LAYER_ID,
  SHAPE_CATEGORY,
  SHAPE_LABEL,
  type Brick,
  type BrickColor,
  type BrickShape,
  type Layer,
} from '@brick/shared';

export type GroupKey = string;

export type TreeGroup = {
  /** `${layerId}|${shape}|${color}|${transparent}` — stable across ticks. */
  key: GroupKey;
  shape: BrickShape;
  color: BrickColor;
  transparent: boolean;
  /** Bricks belonging to this group, sorted by (gy, gz, gx) for a pleasant skim order. */
  bricks: Brick[];
};

export type TreeLayer = {
  layer: Layer;
  groups: TreeGroup[];
  /** Flattened count — sum of group.bricks.length. */
  total: number;
};

export function groupKey(
  layerId: string,
  shape: BrickShape,
  color: BrickColor,
  transparent: boolean,
): GroupKey {
  return `${layerId}|${shape}|${color}|${transparent ? 't' : 'o'}`;
}

/**
 * Bucket every brick into its layer, then into its (shape, color,
 * transparent) slot. Bricks with a missing/unknown layerId fall into
 * the default layer (legacy scenes).
 */
export function buildTree(bricks: Map<string, Brick>, layers: Layer[]): TreeLayer[] {
  const layerIndex = new Map<string, Map<GroupKey, TreeGroup>>();
  for (const l of layers) layerIndex.set(l.id, new Map());

  for (const b of bricks.values()) {
    const transparent = b.transparent === true;
    const lid =
      b.layerId && layerIndex.has(b.layerId) ? b.layerId : DEFAULT_LAYER_ID;
    let groups = layerIndex.get(lid);
    if (!groups) {
      // Shouldn't happen: default is always in layerIndex. Safety net.
      groups = new Map();
      layerIndex.set(lid, groups);
    }
    const key = groupKey(lid, b.shape, b.color, transparent);
    let g = groups.get(key);
    if (!g) {
      g = { key, shape: b.shape, color: b.color, transparent, bricks: [] };
      groups.set(key, g);
    }
    g.bricks.push(b);
  }

  const result: TreeLayer[] = [];
  for (const layer of layers) {
    const groups = layerIndex.get(layer.id);
    if (!groups) {
      result.push({ layer, groups: [], total: 0 });
      continue;
    }
    const groupList = Array.from(groups.values());
    // Sort groups by (category order → shape → color → opaque-before-trans)
    // so the tree lists in a predictable skim order.
    groupList.sort((a, b) => {
      const ca = SHAPE_CATEGORY[a.shape];
      const cb = SHAPE_CATEGORY[b.shape];
      if (ca !== cb) return CATEGORY_ORDER[ca] - CATEGORY_ORDER[cb];
      if (a.shape !== b.shape) return a.shape.localeCompare(b.shape);
      if (a.color !== b.color) return a.color.localeCompare(b.color);
      return Number(a.transparent) - Number(b.transparent);
    });
    // Sort bricks inside each group by position — bottom-up, front-to-back.
    for (const g of groupList) {
      g.bricks.sort((a, b) => {
        if (a.gy !== b.gy) return a.gy - b.gy;
        if (a.gz !== b.gz) return a.gz - b.gz;
        return a.gx - b.gx;
      });
    }
    const total = groupList.reduce((acc, g) => acc + g.bricks.length, 0);
    result.push({ layer, groups: groupList, total });
  }
  return result;
}

const CATEGORY_ORDER: Record<string, number> = {
  Bricks: 0,
  Plates: 1,
  Tiles: 2,
  Round: 3,
  Specialty: 4,
};

/** Human-readable shape label, with category suffix where it reads naturally. */
export function shapeDisplayName(shape: BrickShape): string {
  const label = SHAPE_LABEL[shape];
  const cat = SHAPE_CATEGORY[shape];
  switch (cat) {
    case 'Bricks':
      return `${label} brick`;
    case 'Plates':
      return `${label} plate`;
    case 'Tiles':
      return `${label} tile`;
    case 'Round':
    case 'Specialty':
      // SHAPE_LABEL for these already reads standalone — e.g. "1×1 round plate",
      // "45° 2×2", "30° cheese", "Window 1×2×2".
      return label;
  }
}

/** camelCase color keys → Title Case display ("lightBlue" → "Light Blue"). */
export function prettyColor(color: BrickColor): string {
  const spaced = color.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function groupDisplayName(shape: BrickShape, color: BrickColor, transparent: boolean): string {
  const prefix = transparent ? 'Clear ' : '';
  return `${prefix}${prettyColor(color)} ${shapeDisplayName(shape)}`;
}

/** Compact coord display used on individual brick rows. */
export function positionLabel(brick: Brick): string {
  return `(${brick.gx}, ${brick.gy}, ${brick.gz})`;
}
