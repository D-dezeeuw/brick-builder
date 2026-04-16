import { useEffect } from 'react';
import { useEditorStore } from './editorStore';
import { commandStack } from './commandStack';
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

      if (e.key === 'r' || e.key === 'R') {
        store.rotateCursor();
        e.preventDefault();
        return;
      }
      if (e.key === 'q' || e.key === 'Q') {
        store.bumpLayer(-1);
        e.preventDefault();
        return;
      }
      if (e.key === 'e' || e.key === 'E') {
        store.bumpLayer(1);
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
