import { create } from 'zustand';
import { cellKey, type Brick, type BrickColor, type Rotation } from '@brick/shared';

let idCounter = 0;
const nextId = () => `b${(++idCounter).toString(36)}`;

type PlacementInput = Omit<Brick, 'id'>;

type EditorState = {
  bricks: Map<string, Brick>;
  /** Reverse index: cell → brickId. Footprint-aware (Phase 2 will populate >1 cell). */
  cellIndex: Map<string, string>;

  selectedColor: BrickColor;
  rotation: Rotation;

  addBrick: (input: PlacementInput) => string | null;
  removeBrickAt: (gx: number, gy: number, gz: number) => boolean;
  removeBrickById: (id: string) => boolean;
  setColor: (color: BrickColor) => void;
  rotateCursor: () => void;

  /** True if the cell is free (Phase 1: single-cell footprints only). */
  canPlaceAt: (gx: number, gy: number, gz: number) => boolean;
};

export const useEditorStore = create<EditorState>((set, get) => ({
  bricks: new Map(),
  cellIndex: new Map(),
  selectedColor: 'red',
  rotation: 0,

  addBrick: (input) => {
    const { bricks, cellIndex } = get();
    const key = cellKey(input.gx, input.gy, input.gz);
    if (cellIndex.has(key)) return null;

    const id = nextId();
    const brick: Brick = { id, ...input };
    const nextBricks = new Map(bricks);
    nextBricks.set(id, brick);
    const nextIndex = new Map(cellIndex);
    nextIndex.set(key, id);
    set({ bricks: nextBricks, cellIndex: nextIndex });
    return id;
  },

  removeBrickAt: (gx, gy, gz) => {
    const { cellIndex } = get();
    const key = cellKey(gx, gy, gz);
    const id = cellIndex.get(key);
    if (!id) return false;
    return get().removeBrickById(id);
  },

  removeBrickById: (id) => {
    const { bricks, cellIndex } = get();
    const brick = bricks.get(id);
    if (!brick) return false;
    const nextBricks = new Map(bricks);
    nextBricks.delete(id);
    const nextIndex = new Map(cellIndex);
    nextIndex.delete(cellKey(brick.gx, brick.gy, brick.gz));
    set({ bricks: nextBricks, cellIndex: nextIndex });
    return true;
  },

  setColor: (color) => set({ selectedColor: color }),
  rotateCursor: () =>
    set((s) => ({ rotation: (((s.rotation + 1) % 4) as Rotation) })),

  canPlaceAt: (gx, gy, gz) => !get().cellIndex.has(cellKey(gx, gy, gz)),
}));
