import { useEditorStore } from '../state/editorStore';

/**
 * DOM overlay shown while path-tracing. The pathtracer samples counter lives
 * inside the Canvas context and can't be read from here without additional
 * plumbing; for now this just gives the user a clear "you're in render mode"
 * signal with a one-click exit.
 */
export function RenderOverlay() {
  const renderMode = useEditorStore((s) => s.renderMode);
  const setRenderMode = useEditorStore((s) => s.setRenderMode);
  if (!renderMode) return null;
  return (
    <div className="render-overlay" role="status" aria-live="polite">
      <span className="render-overlay__dot" />
      <span className="render-overlay__text">Path-traced render · converging…</span>
      <button
        type="button"
        className="render-overlay__exit"
        onClick={() => setRenderMode(false)}
      >
        Exit
      </button>
    </div>
  );
}
