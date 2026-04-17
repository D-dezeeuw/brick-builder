import { SHAPE_CATALOG, footprintOf, type Brick, type Creation } from '@brick/shared';
import { useEditorStore } from './editorStore';
import { markPlaced, playPlacementSound } from './placementFeedback';

type Command = {
  do: () => void;
  undo: () => void;
};

const MAX_HISTORY = 200;

class CommandStack {
  private past: Command[] = [];
  private future: Command[] = [];

  run(cmd: Command): void {
    cmd.do();
    this.past.push(cmd);
    if (this.past.length > MAX_HISTORY) this.past.shift();
    this.future.length = 0;
  }

  undo(): boolean {
    const cmd = this.past.pop();
    if (!cmd) return false;
    cmd.undo();
    this.future.push(cmd);
    return true;
  }

  redo(): boolean {
    const cmd = this.future.pop();
    if (!cmd) return false;
    cmd.do();
    this.past.push(cmd);
    return true;
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }
}

export const commandStack = new CommandStack();

type PlacementInput = Omit<Brick, 'id'>;

/**
 * Add a brick via the store to mint a new id, then register a command whose
 * `do` restores that snapshot (no-op on the initial run since the brick is
 * already present) and whose `undo` removes it. Redo cycles through
 * restoreBrick so the id stays stable.
 */
export function placeBrick(input: PlacementInput): string | null {
  const id = useEditorStore.getState().addBrick(input);
  if (!id) return null;
  const snapshot = useEditorStore.getState().bricks.get(id);
  if (!snapshot) return null;
  useEditorStore.getState().expandBaseplateFor(snapshot);

  // Feedback — register the drop-in animation and fire the click
  // sound. Inbound remote placements skip this (see roomSync), so
  // only the local builder hears and sees the flourish. Sound is
  // size-scaled (volume drives pitch/duration) and layer-scaled
  // (height drives hollowness): tiny plate → pure click, big
  // brick → full hollow thunk.
  markPlaced(id);
  const fp = footprintOf(SHAPE_CATALOG[input.shape]);
  playPlacementSound(fp.w * fp.d * fp.layers, fp.layers);

  commandStack.run({
    do: () => {
      const s = useEditorStore.getState();
      if (!s.bricks.has(snapshot.id)) {
        s.restoreBrick(snapshot);
        s.expandBaseplateFor(snapshot);
      }
    },
    undo: () => {
      useEditorStore.getState().removeBrickById(snapshot.id);
    },
  });
  return id;
}

/**
 * Load a Creation and wipe undo history — an imported scene has no history
 * worth keeping, and preserving the stack would let undo reintroduce the
 * pre-import scene in an incoherent way.
 */
export function loadCreationWithHistoryReset(creation: Creation): void {
  useEditorStore.getState().loadCreation(creation);
  commandStack.clear();
}

export function eraseBrick(id: string): boolean {
  const snapshot = useEditorStore.getState().bricks.get(id);
  if (!snapshot) return false;
  commandStack.run({
    do: () => {
      useEditorStore.getState().removeBrickById(snapshot.id);
    },
    undo: () => {
      useEditorStore.getState().restoreBrick(snapshot);
    },
  });
  return true;
}

/**
 * Move a brick by (dx, dy, dz). Rejects if the target footprint
 * collides with any other brick or lands below the baseplate. On
 * success registers an undoable command so arrow-key nudges are
 * individually reversible.
 */
export function moveBrickCmd(id: string, dx: number, dy: number, dz: number): boolean {
  const store = useEditorStore.getState();
  const before = store.bricks.get(id);
  if (!before) return false;
  const target = { gx: before.gx + dx, gy: before.gy + dy, gz: before.gz + dz };
  const ok = store.updateBrick(id, target);
  if (!ok) return false;
  commandStack.run({
    do: () => {
      useEditorStore.getState().updateBrick(id, target);
    },
    undo: () => {
      useEditorStore.getState().updateBrick(id, {
        gx: before.gx,
        gy: before.gy,
        gz: before.gz,
      });
    },
  });
  return true;
}

/**
 * Rotate a brick 90° clockwise around Y (so R cycles through 0→1→2→3→0).
 * Collision-checked; same command-stack pattern as move.
 */
export function rotateBrickCmd(id: string): boolean {
  const store = useEditorStore.getState();
  const before = store.bricks.get(id);
  if (!before) return false;
  const nextRot = ((before.rotation + 1) % 4) as unknown as Brick['rotation'];
  const ok = store.updateBrick(id, { rotation: nextRot });
  if (!ok) return false;
  commandStack.run({
    do: () => {
      useEditorStore.getState().updateBrick(id, { rotation: nextRot });
    },
    undo: () => {
      useEditorStore.getState().updateBrick(id, { rotation: before.rotation });
    },
  });
  return true;
}
