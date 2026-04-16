import { create } from 'zustand';
import {
  cellKey,
  footprintCells,
  type Brick,
  type BrickColor,
  type BrickShape,
  type Rotation,
} from '@brick/shared';

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

const HOTBAR_SIZE = 9;

type EditorState = {
  bricks: Map<string, Brick>;
  /** Every occupied cell → brickId. Multi-layer bricks register one entry per plate-layer they span. */
  cellIndex: Map<string, string>;

  selectedShape: BrickShape;
  selectedColor: BrickColor;
  rotation: Rotation;
  mode: EditorMode;
  /** Extra layers added on top of the raycast-derived target gy. */
  layerOffset: number;
  /** LRU of recently-selected shapes; keys 1..9 map to this array. */
  recentShapes: BrickShape[];

  addBrick: (input: PlacementInput) => string | null;
  /** Re-insert a brick with its original id (undo/redo path). Returns true on success. */
  restoreBrick: (brick: Brick) => boolean;
  removeBrickById: (id: string) => boolean;

  setShape: (shape: BrickShape) => void;
  setColor: (color: BrickColor) => void;
  setMode: (mode: EditorMode) => void;
  rotateCursor: () => void;
  bumpLayer: (delta: number) => void;
  resetLayer: () => void;

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
  layerOffset: 0,
  recentShapes: ['brick_2x4'],

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
  rotateCursor: () => set((s) => ({ rotation: ((s.rotation + 1) % 4) as Rotation })),
  bumpLayer: (delta) => set((s) => ({ layerOffset: Math.max(0, s.layerOffset + delta) })),
  resetLayer: () => set({ layerOffset: 0 }),
}));
