import type { BrickColor } from '@brick/shared';
import { useEditorStore, type EditorMode } from '../state/editorStore';
import { BRICK_COLOR_HEX, BRICK_COLOR_ORDER } from '../state/constants';
import { BrickBrowser } from './BrickBrowser';

export function Sidebar() {
  const selected = useEditorStore((s) => s.selectedColor);
  const setColor = useEditorStore((s) => s.setColor);
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);
  const transparentMode = useEditorStore((s) => s.transparentMode);
  const setTransparentMode = useEditorStore((s) => s.setTransparentMode);

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
              transparent={transparentMode}
            />
          ))}
        </div>
        <label className="toggle-row" style={{ marginTop: 4 }}>
          <input
            type="checkbox"
            checked={transparentMode}
            onChange={(e) => setTransparentMode(e.currentTarget.checked)}
          />
          <span className="toggle-row__label">
            <span>Clear plastic</span>
            <span className="toggle-row__hint">Place transmissive glass bricks</span>
          </span>
        </label>
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
          <kbd>Q</kbd>/<kbd>E</kbd> layer · <kbd>1</kbd>–<kbd>9</kbd> recent
        </p>
        <p className="hint">
          <kbd>?</kbd> help · <kbd>⌘/Ctrl+Z</kbd> undo
        </p>
      </div>
    </div>
  );
}

function ColorSwatch({
  color,
  active,
  onSelect,
  transparent,
}: {
  color: BrickColor;
  active: boolean;
  onSelect: () => void;
  transparent: boolean;
}) {
  return (
    <button
      type="button"
      className={`swatch${active ? ' swatch--active' : ''}${transparent ? ' swatch--clear' : ''}`}
      style={{ background: BRICK_COLOR_HEX[color] }}
      onClick={onSelect}
      title={transparent ? `Select clear ${color}` : color}
      aria-label={`Select ${transparent ? 'clear ' : ''}${color}`}
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
