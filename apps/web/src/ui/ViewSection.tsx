import { useEditorStore } from '../state/editorStore';

/**
 * Visibility toggles for scene elements that aren't about brick content
 * — the baseplate and the stud bumps on every brick. Both are on by
 * default; hiding them produces clean presentation renders.
 */
export function ViewSection() {
  const baseplateVisible = useEditorStore((s) => s.baseplateVisible);
  const studsVisible = useEditorStore((s) => s.studsVisible);
  const setBaseplateVisible = useEditorStore((s) => s.setBaseplateVisible);
  const setStudsVisible = useEditorStore((s) => s.setStudsVisible);

  return (
    <div className="sidebar-section">
      <h2 className="sidebar-heading">View</h2>
      <Toggle
        label="Show baseplate"
        hint="Hide the baseplate slab and its stud grid for clean screenshots"
        checked={baseplateVisible}
        onChange={setBaseplateVisible}
      />
      <Toggle
        label="Show studs"
        hint="Render the stud bumps on bricks. Hide for a smooth-block look."
        checked={studsVisible}
        onChange={setStudsVisible}
      />
    </div>
  );
}

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
