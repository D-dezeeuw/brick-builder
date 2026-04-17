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
 * "Pick up" a placed brick: removes it from the scene and switches
 * the editor into Build mode with the brick's shape / colour /
 * rotation / transparent flag copied into the current selection. A
 * ghost of the picked brick then follows the cursor, ready to be
 * dropped somewhere else with a normal build-mode click.
 *
 * Undo restores the original brick at its exact old position so
 * Ctrl-Z after a pickup is a single "oh wait, put it back" step.
 * We deliberately do NOT revert the shape/color/rotation selection
 * changes — the user just intentionally adopted them.
 */
export function pickUpBrick(id: string): boolean {
  const store = useEditorStore.getState();
  const snapshot = store.bricks.get(id);
  if (!snapshot) return false;

  // Previous mode may or may not be 'select'; we still flip back to
  // build on undo since the user was presumably picking up to move
  // and undoing means "oops, put it back". Mode after undo = build
  // is fine — they can re-enter hand mode if needed.
  commandStack.run({
    do: () => {
      const s = useEditorStore.getState();
      s.removeBrickById(snapshot.id);
      s.setMode('build');
      s.setShape(snapshot.shape);
      s.setColor(snapshot.color);
      s.setTransparentMode(snapshot.transparent === true);
      // rotation isn't in the simple setter family — set directly.
      useEditorStore.setState({ rotation: snapshot.rotation });
    },
    undo: () => {
      useEditorStore.getState().restoreBrick(snapshot);
    },
  });
  return true;
}
