import { useEditorStore } from '../state/editorStore';

// Must match the `samples` prop on <Pathtracer> in Scene.tsx.
const PATHTRACE_TARGET_SAMPLES = 64;

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
  const shown = Math.min(Math.round(samples), PATHTRACE_TARGET_SAMPLES);
  const done = shown >= PATHTRACE_TARGET_SAMPLES;
  return (
    <div className="render-overlay" role="status" aria-live="polite">
      <span className={`render-overlay__dot${done ? ' render-overlay__dot--done' : ''}`} />
      <span className="render-overlay__text">
        {done ? 'Path-traced render · converged' : 'Path-traced render · converging…'}{' '}
        <span className="render-overlay__count">
          {shown} / {PATHTRACE_TARGET_SAMPLES}
        </span>
      </span>
      <button type="button" className="render-overlay__exit" onClick={() => setRenderMode(false)}>
        Exit
      </button>
    </div>
  );
}
