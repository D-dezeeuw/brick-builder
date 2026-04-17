import { useEffect, useState } from 'react';
import { useEditorStore } from './editorStore';

/**
 * Detects user idleness and returns `active: boolean`. Scene.tsx maps
 * this to `<Canvas frameloop={active ? 'always' : 'never'}>` — the
 * WebGL context stops rendering entirely when idle, but the browser
 * keeps the last frame on the canvas, so visually nothing changes.
 *
 * Wake triggers:
 *   - Any pointer / key / wheel / touch event on the window.
 *   - Tab returns to the foreground (visibilitychange).
 *   - Any useEditorStore state change (covers multiplayer inbound
 *     edits, undo/redo, programmatic loads).
 *
 * When the feature is toggled off in settings, always reports active.
 * Respects SSR by no-op'ing on missing window/document.
 */
const IDLE_MS = 30_000;

const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export function useIdlePause(): boolean {
  const enabled = useEditorStore((s) => s.idlePauseEnabled);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setActive(true);
      return;
    }

    let timer: number | undefined;
    let cancelled = false;

    const schedulePause = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!cancelled) setActive(false);
      }, IDLE_MS);
    };

    const wake = () => {
      if (cancelled) return;
      setActive((prev) => (prev ? prev : true));
      schedulePause();
    };

    ACTIVITY_EVENTS.forEach((e) => {
      window.addEventListener(e, wake, { passive: true });
    });
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener('visibilitychange', onVisibility);
    // Any store mutation (peer brick insert, undo, title change, etc.)
    // wakes the canvas so the change actually renders.
    const unsubStore = useEditorStore.subscribe(() => wake());

    // Start the timer so we pause after IDLE_MS of no activity at all.
    schedulePause();

    return () => {
      cancelled = true;
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, wake));
      document.removeEventListener('visibilitychange', onVisibility);
      unsubStore();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [enabled]);

  return active;
}
