import type { BrickColor } from '@brick/shared';
import { useEditorStore, type EditorMode } from '../state/editorStore';
import { BRICK_COLOR_HEX, BRICK_COLOR_ORDER } from '../state/constants';
import { BrickBrowser } from './BrickBrowser';

export function Sidebar() {
  const selected = useEditorStore((s) => s.selectedColor);
  const setColor = useEditorStore((s) => s.setColor);
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);

  return (
    <div className="sidebar-content">
      <div className="sidebar-section">
        <h2 className="sidebar-heading">Mode</h2>
        <div className="mode-row" role="tablist" aria-label="Editor mode">
          <ModeButton label="Build" value="build" active={mode === 'build'} onSelect={setMode} />
          <ModeButton label="Erase" value="erase" active={mode === 'erase'} onSelect={setMode} />
        </div>
      </div>

      <div className="sidebar-section">
        <h2 className="sidebar-heading">Color</h2>
        <div className="color-row">
          {BRICK_COLOR_ORDER.map((color) => (
            <ColorSwatch
              key={color}
              color={color}
              active={selected === color}
              onSelect={() => setColor(color)}
            />
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <h2 className="sidebar-heading">Pieces</h2>
        <BrickBrowser />
      </div>

      <div className="sidebar-section sidebar-section--hints">
        <p className="hint">
          <kbd>Tap</kbd> place · <kbd>R-click</kbd> delete · <kbd>R</kbd> rotate
        </p>
        <p className="hint">
          <kbd>Drag</kbd> orbit · <kbd>Middle-drag</kbd> pan · <kbd>Wheel</kbd> zoom
        </p>
      </div>
    </div>
  );
}

function ColorSwatch({
  color,
  active,
  onSelect,
}: {
  color: BrickColor;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`swatch${active ? ' swatch--active' : ''}`}
      style={{ background: BRICK_COLOR_HEX[color] }}
      onClick={onSelect}
      title={color}
      aria-label={`Select ${color}`}
    />
  );
}

function ModeButton({
  label,
  value,
  active,
  onSelect,
}: {
  label: string;
  value: EditorMode;
  active: boolean;
  onSelect: (mode: EditorMode) => void;
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
