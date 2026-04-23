import { useEditorStore } from '../state/editorStore';
import {
  BASEPLATE_COLOR_HEX,
  BASEPLATE_COLOR_LABEL,
  BASEPLATE_COLOR_ORDER,
  type BaseplateColor,
} from '../state/constants';

/**
 * Visibility toggles for scene elements that aren't about brick content
 * — the baseplate and the stud bumps on every brick. Both are on by
 * default; hiding them produces clean presentation renders.
 */
export function ViewSection() {
  const baseplateVisible = useEditorStore((s) => s.baseplateVisible);
  const studsVisible = useEditorStore((s) => s.studsVisible);
  const baseplateColor = useEditorStore((s) => s.baseplateColor);
  const setBaseplateVisible = useEditorStore((s) => s.setBaseplateVisible);
  const setStudsVisible = useEditorStore((s) => s.setStudsVisible);
  const setBaseplateColor = useEditorStore((s) => s.setBaseplateColor);

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
        hint="Render the stud bumps on bricks and the baseplate. Hide for a smooth-block look."
        checked={studsVisible}
        onChange={setStudsVisible}
      />
      <div
        className={`slider-row${baseplateVisible ? '' : ' slider-row--disabled'}`}
        style={{ marginTop: 6 }}
      >
        <div className="slider-row__label">
          <span>Baseplate colour</span>
          <span className="slider-row__value">{BASEPLATE_COLOR_LABEL[baseplateColor]}</span>
        </div>
        <div className="color-row">
          {BASEPLATE_COLOR_ORDER.map((c) => (
            <BaseplateSwatch
              key={c}
              color={c}
              active={baseplateColor === c}
              disabled={!baseplateVisible}
              onSelect={setBaseplateColor}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BaseplateSwatch({
  color,
  active,
  disabled,
  onSelect,
}: {
  color: BaseplateColor;
  active: boolean;
  disabled: boolean;
  onSelect: (c: BaseplateColor) => void;
}) {
  return (
    <button
      type="button"
      className={`swatch${active ? ' swatch--active' : ''}`}
      style={{ background: BASEPLATE_COLOR_HEX[color] }}
      onClick={() => onSelect(color)}
      disabled={disabled}
      title={BASEPLATE_COLOR_LABEL[color]}
      aria-label={`Baseplate colour: ${BASEPLATE_COLOR_LABEL[color]}`}
      aria-pressed={active}
    />
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
