import { useMemo, useState } from 'react';
import {
  SHAPE_CATALOG,
  SHAPE_CATEGORY,
  SHAPE_IDS,
  SHAPE_LABEL,
  type BrickShape,
  type ShapeCategory,
} from '@brick/shared';
import { useEditorStore } from '../state/editorStore';

const CATEGORY_ORDER: ShapeCategory[] = ['Bricks', 'Plates', 'Tiles', 'Round', 'Specialty'];

/**
 * Categories are collapsible and start collapsed. Keeps the sidebar
 * compact when we add more shapes and lets the user expand just the
 * category they're working in. Expansion state is local to this
 * component — resets each mount (fresh session = tidy sidebar).
 */
export function BrickBrowser() {
  const selected = useEditorStore((s) => s.selectedShape);
  const setShape = useEditorStore((s) => s.setShape);

  const grouped = useMemo(() => {
    const groups: Record<ShapeCategory, BrickShape[]> = {
      Bricks: [],
      Plates: [],
      Tiles: [],
      Round: [],
      Specialty: [],
    };
    for (const id of SHAPE_IDS) groups[SHAPE_CATEGORY[id]].push(id);
    return groups;
  }, []);

  const [expanded, setExpanded] = useState<Set<ShapeCategory>>(() => new Set());
  const toggle = (cat: ShapeCategory) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  return (
    <div className="brick-browser">
      {CATEGORY_ORDER.map((cat) => {
        const isOpen = expanded.has(cat);
        const items = grouped[cat];
        const hasSelection = items.includes(selected);
        return (
          <section key={cat} className="brick-browser__section">
            <button
              type="button"
              className={`brick-browser__heading${isOpen ? ' brick-browser__heading--open' : ''}${hasSelection ? ' brick-browser__heading--has-selection' : ''}`}
              onClick={() => toggle(cat)}
              aria-expanded={isOpen}
              aria-controls={`brick-browser-${cat}`}
            >
              <ChevronIcon open={isOpen} />
              <span className="brick-browser__heading-label">{cat}</span>
              <span className="brick-browser__heading-count">{items.length}</span>
            </button>
            {isOpen && (
              <div id={`brick-browser-${cat}`} className="brick-browser__grid">
                {items.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`brick-btn${id === selected ? ' brick-btn--active' : ''}`}
                    title={`${id} — ${layersDescription(id)}`}
                    onClick={() => setShape(id)}
                  >
                    {SHAPE_LABEL[id]}
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="10"
      height="10"
      fill="none"
      aria-hidden="true"
      className={`brick-browser__chevron${open ? ' brick-browser__chevron--open' : ''}`}
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function layersDescription(id: BrickShape): string {
  const def = SHAPE_CATALOG[id];
  switch (def.kind) {
    case 'rect':
      return def.layers === 1 ? 'plate' : `${def.layers}-layer`;
    case 'round':
      return def.layers === 1 ? 'round plate' : 'round brick';
    case 'slope':
      return `${def.angle}° slope`;
    case 'curve':
      return `curved (${def.profile})`;
    case 'window':
      return `window ${def.w}×${def.d}×${def.layers}`;
  }
}
