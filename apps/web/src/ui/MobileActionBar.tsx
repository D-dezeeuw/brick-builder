import { useEditorStore } from '../state/editorStore';
import { commandStack } from '../state/commandStack';

/**
 * Mobile-only floating action bar in the bottom-right corner. Surfaces
 * the five most-used keyboard actions that mobile users have no way to
 * reach: Rotate, Layer down, Layer up, Eyedropper, Undo. Hidden on
 * desktop (≥ 768px) where the real keyboard lives.
 *
 * Eyedropper is a one-shot toggle: pressing the button "arms" the
 * cursor so the next tap on a brick copies its shape / colour /
 * transparent state instead of placing. Self-clears after one use, or
 * if the user taps empty space.
 */
export function MobileActionBar() {
  const layerOffset = useEditorStore((s) => s.layerOffset);
  const eyedropperArmed = useEditorStore((s) => s.eyedropperArmed);
  const rotateCursor = useEditorStore((s) => s.rotateCursor);
  const bumpLayer = useEditorStore((s) => s.bumpLayer);
  const setEyedropperArmed = useEditorStore((s) => s.setEyedropperArmed);

  return (
    <div className="mobile-action-bar" aria-label="Mobile shortcuts">
      <button
        type="button"
        className="mobile-action-btn"
        onClick={() => rotateCursor()}
        title="Rotate (R)"
        aria-label="Rotate brick"
      >
        <RotateIcon />
      </button>
      <button
        type="button"
        className="mobile-action-btn"
        onClick={() => bumpLayer(-1)}
        disabled={layerOffset === 0}
        title="Layer down (Q)"
        aria-label="Lower target layer"
      >
        <ChevronIcon direction="down" />
      </button>
      <div className="mobile-action-bar__layer-badge" aria-hidden="true">
        {layerOffset === 0 ? '·' : `+${layerOffset}`}
      </div>
      <button
        type="button"
        className="mobile-action-btn"
        onClick={() => bumpLayer(1)}
        title="Layer up (E)"
        aria-label="Raise target layer"
      >
        <ChevronIcon direction="up" />
      </button>
      <button
        type="button"
        className={`mobile-action-btn${eyedropperArmed ? ' mobile-action-btn--armed' : ''}`}
        onClick={() => setEyedropperArmed(!eyedropperArmed)}
        title="Eyedropper — tap a brick to copy its properties (Alt-click on desktop)"
        aria-label={eyedropperArmed ? 'Cancel eyedropper' : 'Arm eyedropper'}
        aria-pressed={eyedropperArmed}
      >
        <EyedropperIcon />
      </button>
      <button
        type="button"
        className="mobile-action-btn"
        onClick={() => commandStack.undo()}
        title="Undo (⌘/Ctrl + Z)"
        aria-label="Undo last action"
      >
        <UndoIcon />
      </button>
    </div>
  );
}

function RotateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path
        d="M4 13a8 8 0 1 0 2.3-5.7L4 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 4v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: 'up' | 'down' }) {
  const d = direction === 'up' ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6';
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyedropperIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path
        d="M14 4l6 6-3 3-6-6zM14 10l-8 8v3h3l8-8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M4 10l4-4M4 10l4 4M4 10h10a6 6 0 0 1 0 12h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
