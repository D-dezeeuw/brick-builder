import { SHAPE_CATALOG, footprintOf, type Brick, type Creation } from '@brick/shared';
import { useEditorStore } from './editorStore';
import { markPlaced, playPlacementSound } from './placementFeedback';
import { useToastStore } from './toastStore';

/**
 * Refuse an edit if the brick sits on a locked layer. Returns true when
 * the edit is blocked — callers should bail. Emits a user-visible toast
 * so the reason is obvious (otherwise the cursor just "doesn't work").
 */
function isLockedByLayer(brick: Brick): boolean {
  if (!brick.layerId) return false;
  const layer = useEditorStore.getState().layers.find((l) => l.id === brick.layerId);
  if (!layer?.locked) return false;
  useToastStore.getState().show(`Layer "${layer.name}" is locked`, 'error');
  return true;
}

/** Admin observe = silent read-only. Every mutation entry point bails early. */
function isObserving(): boolean {
  return useEditorStore.getState().observeMode;
}

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
  if (isObserving()) return null;
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
  if (isObserving()) return false;
  const snapshot = useEditorStore.getState().bricks.get(id);
  if (!snapshot) return false;
  if (isLockedByLayer(snapshot)) return false;
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
 * "Pick up" a placed brick and enter carrying mode.
 *
 * This is a session-level state transition, *not* a commandStack
 * entry. The brick is removed from the scene and held in
 * `state.carrying` until one of:
 *   - `dropCarriedBrick` commits it at a new cell (pushes one
 *     atomic "move" command)
 *   - `cancelCarry` restores it in place (no history step)
 * This way a completed move is a single Ctrl-Z step, and a
 * cancelled move leaves the history untouched.
 */
export function pickUpBrick(id: string): boolean {
  if (isObserving()) return false;
  const s = useEditorStore.getState();
  const snapshot = s.bricks.get(id);
  if (!snapshot) return false;
  if (isLockedByLayer(snapshot)) return false;

  s.removeBrickById(snapshot.id);
  s.setCarrying(snapshot);
  s.setMode('build');
  s.setShape(snapshot.shape);
  s.setColor(snapshot.color);
  s.setTransparentMode(snapshot.transparent === true);
  // rotation isn't in the simple setter family — set directly.
  useEditorStore.setState({ rotation: snapshot.rotation });
  return true;
}

type DropInput = {
  gx: number;
  gy: number;
  gz: number;
  rotation: Brick['rotation'];
  shape: Brick['shape'];
  color: Brick['color'];
  transparent: boolean;
};

/**
 * Commit a carry into a single undoable "move" command.
 *
 * The dropped brick reuses the original id — peers see
 * DELETE (from pickup) + INSERT (from drop) for the same id, which
 * the outbound diff already handles correctly. Undo reverses the
 * whole thing atomically.
 *
 * Returns false (and leaves the carrying state intact) if the drop
 * target is blocked.
 */
export function dropCarriedBrick(input: DropInput): boolean {
  if (isObserving()) return false;
  const s = useEditorStore.getState();
  const carried = s.carrying;
  if (!carried) return false;

  const dropped: Brick = {
    id: carried.id,
    shape: input.shape,
    color: input.color,
    gx: input.gx,
    gy: input.gy,
    gz: input.gz,
    rotation: input.rotation,
    transparent: input.transparent,
    // Preserve the carried brick's layer assignment — a move should
    // keep organisational state, not silently reassign to the active
    // layer.
    layerId: carried.layerId,
  };

  // Use the collision check in restoreBrick — it refuses overlap
  // with existing bricks and leaves the store untouched on failure.
  if (!s.restoreBrick(dropped)) return false;
  s.setCarrying(null);
  s.expandBaseplateFor(dropped);

  commandStack.run({
    do: () => {
      // Redo: ensure state matches post-drop. Idempotent — if the
      // brick is already where `dropped` says, nothing happens.
      const st = useEditorStore.getState();
      const current = st.bricks.get(dropped.id);
      if (
        current &&
        current.gx === dropped.gx &&
        current.gy === dropped.gy &&
        current.gz === dropped.gz
      ) {
        return;
      }
      if (current) st.removeBrickById(dropped.id);
      st.restoreBrick(dropped);
    },
    undo: () => {
      const st = useEditorStore.getState();
      if (st.bricks.has(dropped.id)) st.removeBrickById(dropped.id);
      st.restoreBrick(carried);
    },
  });
  return true;
}

/**
 * Bulk-delete every currently-selected brick as a single undo step.
 * Bricks on locked layers are skipped (a toast names the count). The
 * selection scrubs itself naturally via removeBrickById's existing
 * scrub behaviour, so after this the selection is empty.
 *
 * Returns the number of bricks actually removed (0 if nothing eligible).
 */
export function deleteSelection(): number {
  if (isObserving()) return 0;
  const state = useEditorStore.getState();
  const ids = Array.from(state.selectedIds);
  if (ids.length === 0) return 0;

  const layerById = new Map(state.layers.map((l) => [l.id, l]));
  const snapshots: Brick[] = [];
  let lockedSkipped = 0;
  for (const id of ids) {
    const b = state.bricks.get(id);
    if (!b) continue;
    const layer = b.layerId ? layerById.get(b.layerId) : null;
    if (layer?.locked) {
      lockedSkipped++;
      continue;
    }
    snapshots.push(b);
  }
  if (snapshots.length === 0) {
    if (lockedSkipped > 0) {
      useToastStore.getState().show(`All ${lockedSkipped} selected are on locked layers`, 'error');
    }
    return 0;
  }

  commandStack.run({
    do: () => {
      const s = useEditorStore.getState();
      for (const b of snapshots) {
        if (s.bricks.has(b.id)) s.removeBrickById(b.id);
      }
    },
    undo: () => {
      const s = useEditorStore.getState();
      for (const b of snapshots) {
        if (!s.bricks.has(b.id)) s.restoreBrick(b);
      }
    },
  });

  if (lockedSkipped > 0) {
    useToastStore
      .getState()
      .show(`Deleted ${snapshots.length}, skipped ${lockedSkipped} locked`, 'success');
  }
  return snapshots.length;
}

/**
 * Duplicate every currently-selected brick, offset by a few studs on
 * the (+gx, +gz) diagonal so the copies are visible. Tries offsets
 * of 1, 2, 3, 4, 5 studs until every duplicate fits without collision;
 * bails with a toast if none fit.
 *
 * Pushes ONE compound undo step (the whole paste reverses together).
 * After success the selection swaps to the new bricks so the user can
 * immediately move them as a group.
 *
 * Returns the number of bricks duplicated (0 if nothing fit).
 */
export function duplicateSelection(): number {
  if (isObserving()) return 0;
  const s = useEditorStore.getState();
  const ids = Array.from(s.selectedIds);
  if (ids.length === 0) return 0;

  const sources: Brick[] = [];
  for (const id of ids) {
    const b = s.bricks.get(id);
    if (b) sources.push(b);
  }
  if (sources.length === 0) return 0;

  // Try offsets until every source's copy fits at once — all-or-nothing
  // so the paste keeps its original shape rather than dropping a few.
  const OFFSETS: Array<[number, number]> = [
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
  ];
  let chosen: [number, number] | null = null;
  for (const [ox, oz] of OFFSETS) {
    const st = useEditorStore.getState();
    let fits = true;
    for (const src of sources) {
      if (!st.canPlaceAt(src.shape, src.gx + ox, src.gy, src.gz + oz, src.rotation)) {
        fits = false;
        break;
      }
    }
    if (fits) {
      chosen = [ox, oz];
      break;
    }
  }
  if (!chosen) {
    useToastStore.getState().show('No room to duplicate — move the selection first', 'error');
    return 0;
  }

  const [ox, oz] = chosen;
  const placed: Brick[] = [];
  for (const src of sources) {
    const store = useEditorStore.getState();
    const id = store.addBrick({
      shape: src.shape,
      color: src.color,
      gx: src.gx + ox,
      gy: src.gy,
      gz: src.gz + oz,
      rotation: src.rotation,
      transparent: src.transparent,
      layerId: src.layerId,
    });
    if (!id) continue;
    const snap = store.bricks.get(id);
    if (snap) {
      placed.push(snap);
      store.expandBaseplateFor(snap);
    }
  }
  if (placed.length === 0) return 0;

  commandStack.run({
    do: () => {
      const st = useEditorStore.getState();
      for (const b of placed) {
        if (!st.bricks.has(b.id)) st.restoreBrick(b);
      }
    },
    undo: () => {
      const st = useEditorStore.getState();
      for (const b of placed) {
        if (st.bricks.has(b.id)) st.removeBrickById(b.id);
      }
    },
  });

  // Swap selection to the new bricks so the user can keep moving.
  useEditorStore.setState({ selectedIds: new Set(placed.map((b) => b.id)) });
  return placed.length;
}

/**
 * Abandon a carry — put the brick back where it was and clear the
 * carrying state. No history entry created. Safe to call when
 * not carrying (no-op).
 */
export function cancelCarry(): void {
  const s = useEditorStore.getState();
  const carried = s.carrying;
  if (!carried) return;
  s.restoreBrick(carried);
  s.setCarrying(null);
}
