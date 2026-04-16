import type { Brick } from '@brick/shared';
import { useEditorStore } from './editorStore';

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
