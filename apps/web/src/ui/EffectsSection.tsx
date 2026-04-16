import { useEditorStore } from '../state/editorStore';

type ToggleProps = {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (b: boolean) => void;
};

function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  return (
    <label className="toggle-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span className="toggle-row__label">
        <span>{label}</span>
        <span className="toggle-row__hint">{hint}</span>
      </span>
    </label>
  );
}

export function EffectsSection() {
  const ao = useEditorStore((s) => s.aoEnabled);
  const bloom = useEditorStore((s) => s.bloomEnabled);
  const smaa = useEditorStore((s) => s.smaaEnabled);
  const renderMode = useEditorStore((s) => s.renderMode);
  const setAo = useEditorStore((s) => s.setAoEnabled);
  const setBloom = useEditorStore((s) => s.setBloomEnabled);
  const setSmaa = useEditorStore((s) => s.setSmaaEnabled);
  const setRenderMode = useEditorStore((s) => s.setRenderMode);

  return (
    <div className="sidebar-section">
      <h2 className="sidebar-heading">Effects</h2>
      <Toggle
        label="Ambient occlusion"
        hint="Soft contact shadows in stud gaps"
        checked={ao}
        onChange={setAo}
      />
      <Toggle
        label="Bloom"
        hint="Subtle glow on bright highlights"
        checked={bloom}
        onChange={setBloom}
      />
      <Toggle
        label="Anti-aliasing"
        hint="SMAA post-filter"
        checked={smaa}
        onChange={setSmaa}
      />

      <button
        type="button"
        className={`render-btn${renderMode ? ' render-btn--active' : ''}`}
        onClick={() => setRenderMode(!renderMode)}
        title={
          renderMode
            ? 'Exit path-traced render mode'
            : 'Switch to GPU path tracer — non-interactive, converges over a few seconds'
        }
      >
        {renderMode ? 'Exit render mode' : 'Path-traced render'}
      </button>
    </div>
  );
}
