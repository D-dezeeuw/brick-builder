import { SHAPE_LABEL } from '@brick/shared';
import { useEditorStore } from '../state/editorStore';

/**
 * Mirrors the 1–9 number-key hotbar. Shows each recent shape with its key
 * badge; click/tap to select. Visible on both desktop (redundant but
 * discoverable) and mobile (where numeric hotkeys aren't reachable).
 */
export function Hotbar() {
  const recent = useEditorStore((s) => s.recentShapes);
  const selected = useEditorStore((s) => s.selectedShape);
  const setShape = useEditorStore((s) => s.setShape);

  if (recent.length === 0) return null;

  return (
    <div className="hotbar" role="toolbar" aria-label="Recent shapes">
      {recent.map((shape, i) => (
        <button
          key={shape}
          type="button"
          className={`hotbar__slot${shape === selected ? ' hotbar__slot--active' : ''}`}
          onClick={() => setShape(shape)}
          title={`${SHAPE_LABEL[shape]} — press ${i + 1}`}
        >
          <span className="hotbar__slot-key" aria-hidden="true">
            {i + 1}
          </span>
          <span className="hotbar__slot-label">{SHAPE_LABEL[shape]}</span>
        </button>
      ))}
    </div>
  );
}
