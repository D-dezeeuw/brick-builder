import { useEditorStore } from '../state/editorStore';
import { deleteSelection, duplicateSelection } from '../state/commandStack';

/**
 * Floating action bar that appears when a multi-selection is active.
 * Visible on both desktop and mobile so the two bulk operations
 * (Delete, Duplicate) are discoverable without menu diving — mobile
 * has no keyboard at all, and on desktop the button is faster than
 * remembering Ctrl-D.
 *
 * Positioned top-centre under the observe banner if one is present;
 * CSS handles the vertical stacking.
 */
export function SelectionActionBar() {
  const count = useEditorStore((s) => s.selectedIds.size);
  const clearSelection = useEditorStore((s) => s.clearSelection);

  if (count === 0) return null;

  return (
    <div className="selection-bar" role="toolbar" aria-label={`Selection actions, ${count} brick${count === 1 ? '' : 's'} selected`}>
      <span className="selection-bar__count">
        <strong>{count}</strong> selected
      </span>
      <div className="selection-bar__actions">
        <button
          type="button"
          className="selection-bar__btn"
          onClick={() => duplicateSelection()}
          title="Duplicate (⌘/Ctrl + D)"
        >
          Duplicate
        </button>
        <button
          type="button"
          className="selection-bar__btn selection-bar__btn--danger"
          onClick={() => deleteSelection()}
          title="Delete (Delete / Backspace)"
        >
          Delete
        </button>
        <button
          type="button"
          className="selection-bar__btn selection-bar__btn--ghost"
          onClick={() => clearSelection()}
          title="Clear selection (Esc)"
          aria-label="Clear selection"
        >
          ×
        </button>
      </div>
    </div>
  );
}
