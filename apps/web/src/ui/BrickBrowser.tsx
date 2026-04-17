import { useMemo } from 'react';
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

  return (
    <div className="brick-browser">
      {CATEGORY_ORDER.map((cat) => (
        <section key={cat} className="brick-browser__section">
          <h3 className="brick-browser__heading">{cat}</h3>
          <div className="brick-browser__grid">
            {grouped[cat].map((id) => (
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
        </section>
      ))}
    </div>
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
