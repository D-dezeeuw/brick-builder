import type { BrickColor } from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { BRICK_COLOR_HEX, BRICK_COLOR_ORDER } from '../state/constants';

export function Sidebar() {
  const selected = useEditorStore((s) => s.selectedColor);
  const setColor = useEditorStore((s) => s.setColor);

  return (
    <div className="sidebar-content">
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
      <p className="hint">
        <kbd>L-click</kbd> place · <kbd>R-click</kbd> delete · <kbd>R</kbd> rotate
      </p>
      <p className="hint">
        <kbd>Drag</kbd> orbit · <kbd>Middle-drag</kbd> pan · <kbd>Wheel</kbd> zoom
      </p>
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
