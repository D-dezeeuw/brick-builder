import { create } from 'zustand';
import {
  cellKey,
  footprintCells,
  type Brick,
  type BrickColor,
  type BrickShape,
  type Rotation,
} from '@brick/shared';
import { EFFECT_DEFAULTS } from './quality';

let idCounter = 0;
const nextId = () => `b${(++idCounter).toString(36)}`;
const absorbId = (id: string): void => {
  // Bump the counter so generated ids never collide with a restored one.
  const m = /^b([0-9a-z]+)$/.exec(id);
  if (!m) return;
  const n = parseInt(m[1], 36);
  if (Number.isFinite(n) && n > idCounter) idCounter = n;
};

type PlacementInput = Omit<Brick, 'id'>;

export type EditorMode = 'build' | 'erase';
export type Quality = 'low' | 'medium' | 'high' | 'ultra';

const HOTBAR_SIZE = 9;

/** Baseplate auto-expansion tuning. */
const EDGE_MARGIN_STUDS = 4; // trigger expansion when placement is within this many studs of edge
const EXPANSION_CHUNK_STUDS = 16;
const INITIAL_HALF = 16; // initial baseplate is ±16 studs = 32x32

export type BaseplateBounds = {
  minGx: number; // inclusive
  maxGx: number; // exclusive
  minGz: number;
  maxGz: number;
};

type EditorState = {
  bricks: Map<string, Brick>;
  /** Every occupied cell → brickId. Multi-layer bricks register one entry per plate-layer they span. */
  cellIndex: Map<string, string>;

  selectedShape: BrickShape;
  selectedColor: BrickColor;
  rotation: Rotation;
  mode: EditorMode;
  quality: Quality;
  /** Directional-light intensity multiplier (0..2). */
  lightIntensity: number;
  /** Directional-light warmth (-1 cool / blueish, 0 neutral, 1 warm / amber). */
  lightWarmth: number;
  /** IBL environment-map intensity (0..2). 0 disables reflections from the HDRI. */
  envIntensity: number;

  // --- Post-processing effect toggles (independent of quality preset) ---
  aoEnabled: boolean;
  bloomEnabled: boolean;
  smaaEnabled: boolean;

  /** When true, scene renders via GPU path tracer (non-interactive preview). */
  renderMode: boolean;
  /** Extra layers added on top of the raycast-derived target gy. */
  layerOffset: number;
  /** LRU of recently-selected shapes; keys 1..9 map to this array. */
  recentShapes: BrickShape[];
  /** Current baseplate extent in grid coords (auto-grows as bricks reach the edge). */
  baseplateBounds: BaseplateBounds;

  addBrick: (input: PlacementInput) => string | null;
  /** Re-insert a brick with its original id (undo/redo path). Returns true on success. */
  restoreBrick: (brick: Brick) => boolean;
  removeBrickById: (id: string) => boolean;

  setShape: (shape: BrickShape) => void;
  setColor: (color: BrickColor) => void;
  setMode: (mode: EditorMode) => void;
  setQuality: (q: Quality) => void;
  setLightIntensity: (n: number) => void;
  setLightWarmth: (n: number) => void;
  setEnvIntensity: (n: number) => void;
  setAoEnabled: (b: boolean) => void;
  setBloomEnabled: (b: boolean) => void;
  setSmaaEnabled: (b: boolean) => void;
  setRenderMode: (b: boolean) => void;
  rotateCursor: () => void;
  bumpLayer: (delta: number) => void;
  resetLayer: () => void;
  /** Expand the baseplate if a placement would land within the edge margin. */
  expandBaseplateFor: (brick: Brick) => void;

  /** True iff every cell in the prospective footprint is free and gy >= 0. */
  canPlaceAt: (
    shape: BrickShape,
    gx: number,
    gy: number,
    gz: number,
    rotation: Rotation,
  ) => boolean;
};

export const useEditorStore = create<EditorState>((set, get) => ({
  bricks: new Map(),
  cellIndex: new Map(),

  selectedShape: 'brick_2x4',
  selectedColor: 'red',
  rotation: 0,
  mode: 'build',
  quality: 'high',
  lightIntensity: 1.0,
  lightWarmth: 0,
  // Studio HDRI from pmndrs/assets is quite bright; 0.3 gives a plausible
  // plastic highlight without washing out direct shading.
  envIntensity: 0.3,
  // Effect defaults seeded from the High preset to match initial `quality: 'high'`.
  aoEnabled: EFFECT_DEFAULTS.high.ao,
  bloomEnabled: EFFECT_DEFAULTS.high.bloom,
  smaaEnabled: EFFECT_DEFAULTS.high.smaa,
  renderMode: false,
  layerOffset: 0,
  recentShapes: ['brick_2x4'],
  baseplateBounds: {
    minGx: -INITIAL_HALF,
    maxGx: INITIAL_HALF,
    minGz: -INITIAL_HALF,
    maxGz: INITIAL_HALF,
  },

  canPlaceAt: (shape, gx, gy, gz, rotation) => {
    if (gy < 0) return false;
    const { cellIndex } = get();
    const cells = footprintCells(shape, gx, gy, gz, rotation);
    for (const c of cells) {
      if (cellIndex.has(cellKey(c.gx, c.gy, c.gz))) return false;
    }
    return true;
  },

  addBrick: (input) => {
    if (!get().canPlaceAt(input.shape, input.gx, input.gy, input.gz, input.rotation)) {
      return null;
    }
    const { bricks, cellIndex } = get();
    const cells = footprintCells(input.shape, input.gx, input.gy, input.gz, input.rotation);
    const id = nextId();
    const brick: Brick = { id, ...input };
    const nextBricks = new Map(bricks);
    nextBricks.set(id, brick);
    const nextIndex = new Map(cellIndex);
    for (const c of cells) nextIndex.set(cellKey(c.gx, c.gy, c.gz), id);
    set({ bricks: nextBricks, cellIndex: nextIndex });
    return id;
  },

  restoreBrick: (brick) => {
    const { bricks, cellIndex } = get();
    if (bricks.has(brick.id)) return false;
    const cells = footprintCells(brick.shape, brick.gx, brick.gy, brick.gz, brick.rotation);
    for (const c of cells) {
      if (cellIndex.has(cellKey(c.gx, c.gy, c.gz))) return false;
    }
    absorbId(brick.id);
    const nextBricks = new Map(bricks);
    nextBricks.set(brick.id, brick);
    const nextIndex = new Map(cellIndex);
    for (const c of cells) nextIndex.set(cellKey(c.gx, c.gy, c.gz), brick.id);
    set({ bricks: nextBricks, cellIndex: nextIndex });
    return true;
  },

  removeBrickById: (id) => {
    const { bricks, cellIndex } = get();
    const brick = bricks.get(id);
    if (!brick) return false;
    const cells = footprintCells(brick.shape, brick.gx, brick.gy, brick.gz, brick.rotation);
    const nextBricks = new Map(bricks);
    nextBricks.delete(id);
    const nextIndex = new Map(cellIndex);
    for (const c of cells) nextIndex.delete(cellKey(c.gx, c.gy, c.gz));
    set({ bricks: nextBricks, cellIndex: nextIndex });
    return true;
  },

  setShape: (shape) =>
    set((s) => ({
      selectedShape: shape,
      recentShapes: [shape, ...s.recentShapes.filter((x) => x !== shape)].slice(0, HOTBAR_SIZE),
    })),
  setColor: (color) => set({ selectedColor: color }),
  setMode: (mode) => set({ mode }),
  setQuality: (quality) => {
    // Quality switch re-seeds the effect toggles from the preset so Low really
    // feels Low and Ultra really feels Ultra; explicit per-effect overrides
    // survive only within the same quality level.
    const defaults = EFFECT_DEFAULTS[quality];
    set({
      quality,
      aoEnabled: defaults.ao,
      bloomEnabled: defaults.bloom,
      smaaEnabled: defaults.smaa,
    });
  },
  setLightIntensity: (n) => set({ lightIntensity: Math.max(0, Math.min(2, n)) }),
  setLightWarmth: (n) => set({ lightWarmth: Math.max(-1, Math.min(1, n)) }),
  setEnvIntensity: (n) => set({ envIntensity: Math.max(0, Math.min(2, n)) }),
  setAoEnabled: (b) => set({ aoEnabled: b }),
  setBloomEnabled: (b) => set({ bloomEnabled: b }),
  setSmaaEnabled: (b) => set({ smaaEnabled: b }),
  setRenderMode: (b) => set({ renderMode: b }),
  rotateCursor: () => set((s) => ({ rotation: ((s.rotation + 1) % 4) as Rotation })),
  bumpLayer: (delta) => set((s) => ({ layerOffset: Math.max(0, s.layerOffset + delta) })),
  resetLayer: () => set({ layerOffset: 0 }),

  expandBaseplateFor: (brick) => {
    const { baseplateBounds } = get();
    const cells = footprintCells(brick.shape, brick.gx, brick.gy, brick.gz, brick.rotation);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const c of cells) {
      if (c.gx < minX) minX = c.gx;
      if (c.gx > maxX) maxX = c.gx;
      if (c.gz < minZ) minZ = c.gz;
      if (c.gz > maxZ) maxZ = c.gz;
    }
    let { minGx, maxGx, minGz, maxGz } = baseplateBounds;
    let changed = false;
    while (minX < minGx + EDGE_MARGIN_STUDS) {
      minGx -= EXPANSION_CHUNK_STUDS;
      changed = true;
    }
    while (maxX >= maxGx - EDGE_MARGIN_STUDS) {
      maxGx += EXPANSION_CHUNK_STUDS;
      changed = true;
    }
    while (minZ < minGz + EDGE_MARGIN_STUDS) {
      minGz -= EXPANSION_CHUNK_STUDS;
      changed = true;
    }
    while (maxZ >= maxGz - EDGE_MARGIN_STUDS) {
      maxGz += EXPANSION_CHUNK_STUDS;
      changed = true;
    }
    if (changed) set({ baseplateBounds: { minGx, maxGx, minGz, maxGz } });
  },
}));
