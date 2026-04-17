import type { ReactNode } from 'react';
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
  const mirrorAxis = useEditorStore((s) => s.mirrorAxis);
  const setMirrorAxis = useEditorStore((s) => s.setMirrorAxis);

  return (
    <div className="sidebar-content">
      <div className="sidebar-section">
        <h2 className="sidebar-heading">Mode</h2>
        <div className="mode-row" role="tablist" aria-label="Editor mode">
          <ModeButton label="Build" value="build" active={mode === 'build'} onSelect={setMode} />
          <ModeButton label="Erase" value="erase" active={mode === 'erase'} onSelect={setMode} />
          <ModeButton
            label={
              <span className="mode-btn__hand">
                <HandIcon />
                <span>Hand</span>
              </span>
            }
            value="select"
            active={mode === 'select'}
            onSelect={setMode}
          />
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
        <h2 className="sidebar-heading">Mirror</h2>
        <div className="mode-row" role="tablist" aria-label="Mirror axis">
          <MirrorButton
            label="Off"
            value="off"
            active={mirrorAxis === 'off'}
            onSelect={setMirrorAxis}
          />
          <MirrorButton label="X" value="x" active={mirrorAxis === 'x'} onSelect={setMirrorAxis} />
          <MirrorButton label="Z" value="z" active={mirrorAxis === 'z'} onSelect={setMirrorAxis} />
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

function MirrorButton({
  label,
  value,
  active,
  onSelect,
}: {
  label: string;
  value: 'off' | 'x' | 'z';
  active: boolean;
  onSelect: (v: 'off' | 'x' | 'z') => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`mode-btn${active ? ' mode-btn--active' : ''}`}
      onClick={() => onSelect(value)}
      title={value === 'off' ? 'No mirror' : `Mirror across ${value.toUpperCase()}=0 plane`}
    >
      {label}
    </button>
  );
}

function HandIcon() {
  // Stylised open-palm — fingers spread, thumb out. Sized to match
  // the existing text-label heights so the button row stays vertically
  // balanced.
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <path
        d="M8 11V4.5a1.5 1.5 0 0 1 3 0V10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M11 10V3.5a1.5 1.5 0 0 1 3 0V10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M14 10V4.5a1.5 1.5 0 0 1 3 0V11.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M17 11.5V8.5a1.5 1.5 0 0 1 3 0v6.5a6 6 0 0 1-6 6h-2.5a6 6 0 0 1-5.3-3.2l-2-3.8a1.6 1.6 0 0 1 2.4-2l2.4 2.2V8.5a1.5 1.5 0 0 1 3 0V11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ModeButton({
  label,
  value,
  active,
  onSelect,
}: {
  label: ReactNode;
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
