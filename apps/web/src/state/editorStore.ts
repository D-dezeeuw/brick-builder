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

type PlacementInput = Omit<Brick, 'id'>;

type EditorState = {
  bricks: Map<string, Brick>;
  /** Every occupied cell → brickId. Multi-layer bricks register one entry per plate-layer they span. */
  cellIndex: Map<string, string>;

  selectedShape: BrickShape;
  selectedColor: BrickColor;
  rotation: Rotation;

  addBrick: (input: PlacementInput) => string | null;
  removeBrickById: (id: string) => boolean;

  setShape: (shape: BrickShape) => void;
  setColor: (color: BrickColor) => void;
  rotateCursor: () => void;

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

  selectedShape: '1x1',
  selectedColor: 'red',
  rotation: 0,

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

  setShape: (shape) => set({ selectedShape: shape }),
  setColor: (color) => set({ selectedColor: color }),
  rotateCursor: () => set((s) => ({ rotation: ((s.rotation + 1) % 4) as Rotation })),
}));
