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
  // size-scaled: tiny plate → crisp tick, big brick → fuller thud.
  markPlaced(id);
  const fp = footprintOf(SHAPE_CATALOG[input.shape]);
  playPlacementSound(fp.w * fp.d * fp.layers);

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
