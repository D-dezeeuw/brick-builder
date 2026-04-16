import { useEditorStore } from '../state/editorStore';

/**
 * DOM overlay shown while path-tracing. Samples counter is pumped into the
 * store each frame by PathtracerSampleReporter (mounted inside the
 * Pathtracer's context), so this stays a plain consumer component.
 */
export function RenderOverlay() {
  const renderMode = useEditorStore((s) => s.renderMode);
  const samples = useEditorStore((s) => s.pathtracerSamples);
  const setRenderMode = useEditorStore((s) => s.setRenderMode);
  if (!renderMode) return null;
  return (
    <div className="render-overlay" role="status" aria-live="polite">
      <span className="render-overlay__dot" />
      <span className="render-overlay__text">
        Path-traced render ·{' '}
        <span className="render-overlay__count">{Math.round(samples)} samples</span>
      </span>
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
