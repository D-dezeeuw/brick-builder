import { useEffect } from 'react';
import { useEditorStore } from './editorStore';
import {
  cancelCarry,
  commandStack,
  deleteSelection,
  duplicateSelection,
} from './commandStack';
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
        // Carrying a brick? Treat Ctrl-Z as "never mind, put it back"
        // — restore the carried snapshot, don't consume history. Only
        // the bare undo path does this; Ctrl-Shift-Z is a redo and
        // never conflicts with carry.
        if (!e.shiftKey && useEditorStore.getState().carrying) {
          cancelCarry();
          e.preventDefault();
          return;
        }
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

      // Cmd/Ctrl+D → duplicate selection. Browser default on mac is
      // "Bookmark this page"; we preventDefault before that runs.
      if (mod && (e.key === 'd' || e.key === 'D') && !e.shiftKey) {
        if (useEditorStore.getState().selectedIds.size > 0) {
          duplicateSelection();
          e.preventDefault();
          return;
        }
      }

      // Shift+? (the '?' key on most layouts) toggles the help modal.
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        useHelpStore.getState().toggle();
        e.preventDefault();
        return;
      }

      // Plain-key shortcuts — ignore when a modifier is held.
      if (mod || e.altKey) return;

      // Delete / Backspace — bulk-remove the current selection.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (useEditorStore.getState().selectedIds.size > 0) {
          deleteSelection();
          e.preventDefault();
          return;
        }
      }

      // Esc has layered semantics: if the user is carrying a brick
      // that's the primary cancel. Otherwise, a non-empty multi-
      // selection gets cleared — the user is almost always trying to
      // escape the most recent ephemeral state.
      if (e.key === 'Escape') {
        const s = useEditorStore.getState();
        if (s.carrying) {
          cancelCarry();
          e.preventDefault();
          return;
        }
        if (s.selectedIds.size > 0) {
          s.clearSelection();
          e.preventDefault();
          return;
        }
      }

      const store = useEditorStore.getState();

      // Mode switches — cancel any in-flight carry first so the user's
      // intent to change modes wins cleanly (matches the sidebar mode
      // buttons' behaviour). E is taken by layer-bump, so Erase uses X
      // (think "cross out").
      if (e.key === 'b' || e.key === 'B') {
        if (store.carrying) cancelCarry();
        store.setMode('build');
        e.preventDefault();
        return;
      }
      if (e.key === 'x' || e.key === 'X') {
        if (store.carrying) cancelCarry();
        store.setMode('erase');
        e.preventDefault();
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        if (store.carrying) cancelCarry();
        store.setMode('select');
        e.preventDefault();
        return;
      }

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
