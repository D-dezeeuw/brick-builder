import { useEditorStore, type Quality } from '../state/editorStore';
import { QUALITY_LABEL, QUALITY_ORDER } from '../state/quality';

export function QualitySection() {
  const quality = useEditorStore((s) => s.quality);
  const setQuality = useEditorStore((s) => s.setQuality);

  return (
    <div className="sidebar-section">
      <h2 className="sidebar-heading">Quality</h2>
      <div className="quality-row" role="tablist" aria-label="Render quality">
        {QUALITY_ORDER.map((q) => (
          <QualityButton
            key={q}
            label={QUALITY_LABEL[q]}
            value={q}
            active={quality === q}
            onSelect={setQuality}
          />
        ))}
      </div>
    </div>
  );
}

function QualityButton({
  label,
  value,
  active,
  onSelect,
}: {
  label: string;
  value: Quality;
  active: boolean;
  onSelect: (q: Quality) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`mode-btn${active ? ' mode-btn--active' : ''}`}
      onClick={() => onSelect(value)}
    >
      {label}
    </button>
  );
}
