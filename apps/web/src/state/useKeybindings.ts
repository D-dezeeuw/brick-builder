import { useEffect } from 'react';
import { useEditorStore } from './editorStore';

/** Global keyboard shortcuts. Ignores events from form fields. */
export function useKeybindings() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return;
      }
      if (e.key === 'r' || e.key === 'R') {
        useEditorStore.getState().rotateCursor();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
