import { useEditorStore } from '../state/editorStore';

/**
 * Banner shown at the top of the canvas whenever the client is in
 * admin observe mode — a silent read-only session. No writes leave
 * the client, and all local edit entry points refuse.
 *
 * "Take over" flips observeMode off so subsequent edits sync normally.
 * There's no "exit to observer" toggle — once you take over, you leave
 * observe mode for the life of the session. To re-enter observe mode,
 * re-open the admin panel and click Observe again.
 */
export function ObserveBanner() {
  const observeMode = useEditorStore((s) => s.observeMode);
  const setObserveMode = useEditorStore((s) => s.setObserveMode);
  const roomId = useEditorStore((s) => s.roomId);

  if (!observeMode) return null;

  return (
    <div className="observe-banner" role="status" aria-live="polite">
      <span className="observe-banner__dot" aria-hidden="true" />
      <span className="observe-banner__text">
        <strong>Observing</strong> — no edits are being sent
        {roomId && <span className="observe-banner__room"> · {roomId}</span>}
      </span>
      <button
        type="button"
        className="observe-banner__btn"
        onClick={() => setObserveMode(false)}
        title="Stop observing and let local edits sync normally"
      >
        Take over
      </button>
    </div>
  );
}
