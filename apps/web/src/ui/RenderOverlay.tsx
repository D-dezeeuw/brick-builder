import { useEditorStore } from '../state/editorStore';
import { useToastStore } from '../state/toastStore';
import { exportCanvasAsPng } from '../state/exporters';

/**
 * DOM overlay shown while path-tracing. Samples counter is pumped into the
 * store each frame by PathtracerSampleReporter (mounted inside the
 * Pathtracer's context), so this stays a plain consumer component.
 *
 * The camera button on the right saves the current path-traced frame as a
 * PNG. The capture pipeline (CaptureBridge) reads from the pathtracer's
 * target directly (preferring the denoised target once convergence runs),
 * falling back to the rasterized render if neither is available.
 */
export function RenderOverlay() {
  const renderMode = useEditorStore((s) => s.renderMode);
  const samples = useEditorStore((s) => s.pathtracerSamples);
  const target = useEditorStore((s) => s.pathtracerMaxSamples);
  const title = useEditorStore((s) => s.title);
  const setRenderMode = useEditorStore((s) => s.setRenderMode);
  const showToast = useToastStore((s) => s.show);
  if (!renderMode) return null;
  const shown = Math.min(Math.round(samples), target);
  const done = shown >= target;

  const onShot = async () => {
    const ok = await exportCanvasAsPng(`${title}-rendered`);
    if (!ok) showToast('Screenshot failed', 'error');
    else showToast('Render saved', 'success');
  };

  return (
    <div className="render-overlay" role="status" aria-live="polite">
      <span className={`render-overlay__dot${done ? ' render-overlay__dot--done' : ''}`} />
      <span className="render-overlay__text">
        {done ? 'Path-traced render · converged' : 'Path-traced render · converging…'}{' '}
        <span className="render-overlay__count">
          {shown} / {target}
        </span>
      </span>
      <button
        type="button"
        className="render-overlay__shot"
        onClick={onShot}
        aria-label="Download render as PNG"
        title="Download render as PNG"
      >
        <CameraIcon />
      </button>
      <button type="button" className="render-overlay__exit" onClick={() => setRenderMode(false)}>
        Exit
      </button>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <path
        d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
