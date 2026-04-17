import { useEffect } from 'react';
import { useEditorStore } from './editorStore';
import { commandStack, eraseBrick, moveBrickCmd, rotateBrickCmd } from './commandStack';
import { useHelpStore } from './helpStore';

/** Global keyboard shortcuts. Ignores events from form fields. */
export function useKeybindings() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return;
      }

      // Undo / Redo.
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        if (e.shiftKey) commandStack.redo();
        else commandStack.undo();
        e.preventDefault();
        return;
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        commandStack.redo();
        e.preventDefault();
        return;
      }

      // Shift+? (the '?' key on most layouts) toggles the help modal.
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        useHelpStore.getState().toggle();
        e.preventDefault();
        return;
      }

      // Plain-key shortcuts — ignore when a modifier is held.
      if (mod || e.altKey) return;

      const store = useEditorStore.getState();
      const selected =
        store.mode === 'select' && store.selectedBrickId ? store.selectedBrickId : null;

      // Esc deselects in select mode — always handled, no other use
      // of Esc at this layer.
      if (e.key === 'Escape' && selected) {
        store.setSelectedBrickId(null);
        e.preventDefault();
        return;
      }

      // Delete / Backspace remove the selected brick.
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        eraseBrick(selected);
        e.preventDefault();
        return;
      }

      if (e.key === 'r' || e.key === 'R') {
        if (selected) rotateBrickCmd(selected);
        else store.rotateCursor();
        e.preventDefault();
        return;
      }
      if (e.key === 'q' || e.key === 'Q') {
        if (selected) moveBrickCmd(selected, 0, -1, 0);
        else store.bumpLayer(-1);
        e.preventDefault();
        return;
      }
      if (e.key === 'e' || e.key === 'E') {
        if (selected) moveBrickCmd(selected, 0, 1, 0);
        else store.bumpLayer(1);
        e.preventDefault();
        return;
      }

      // 1..9 → select Nth most-recently-used shape.
      if (e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1;
        const shape = store.recentShapes[idx];
        if (shape) {
          store.setShape(shape);
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
