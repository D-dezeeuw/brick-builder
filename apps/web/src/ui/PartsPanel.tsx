import { useMemo, useState } from 'react';
import { bricklinkUrl } from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { useToastStore } from '../state/toastStore';
import {
  buildInventory,
  groupInventory,
  totalPieces,
  uniqueSkus,
  type GroupBy,
  type InventoryRow,
} from '../state/inventory';
import { inventoryToBricklinkXml, inventoryToCsv } from '../state/partsExport';
import { slugify } from '../state/exporters';

const GROUP_LABELS: Record<GroupBy, string> = {
  category: 'Category',
  color: 'Color',
  shape: 'Shape',
};

export function PartsPanel() {
  const bricks = useEditorStore((s) => s.bricks);
  const title = useEditorStore((s) => s.title);
  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => buildInventory(bricks), [bricks]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => matchesQuery(r, q));
  }, [rows, query]);
  const groups = useMemo(() => groupInventory(filtered, groupBy), [filtered, groupBy]);

  const total = totalPieces(filtered);
  const unique = uniqueSkus(filtered);

  const filename = slugify(title) || 'parts';

  return (
    <div className="parts-panel">
      <div className="parts-panel__summary">
        <strong>{total.toLocaleString()}</strong> pieces · {unique} unique
        {query && <span className="parts-panel__summary-hint"> (filtered)</span>}
      </div>

      {rows.length === 0 ? (
        <div className="parts-panel__empty">Place some bricks to see the parts list.</div>
      ) : (
        <>
          <div className="parts-panel__controls">
            <div className="mode-row" role="tablist" aria-label="Group by">
              {(Object.keys(GROUP_LABELS) as GroupBy[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  role="tab"
                  aria-selected={groupBy === g}
                  className={`mode-btn${groupBy === g ? ' mode-btn--active' : ''}`}
                  onClick={() => setGroupBy(g)}
                >
                  {GROUP_LABELS[g]}
                </button>
              ))}
            </div>
            <input
              type="search"
              className="parts-panel__search"
              placeholder="Filter by part or color…"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              aria-label="Filter parts list"
            />
          </div>

          <div className="parts-panel__list">
            {groups.map((group) => (
              <section key={group.label} className="parts-panel__group">
                <h3 className="parts-panel__group-heading">
                  {group.label}
                  <span className="parts-panel__group-count">
                    {totalPieces(group.rows).toLocaleString()}
                  </span>
                </h3>
                {group.rows.map((row) => (
                  <PartRow key={row.key} row={row} />
                ))}
              </section>
            ))}
          </div>

          <div className="parts-panel__actions">
            <button
              type="button"
              className="mode-btn"
              onClick={() => downloadText(inventoryToBricklinkXml(rows), `${filename}.xml`, 'application/xml')}
              title="Download a BrickLink mass-upload XML (bricklink.com/v2/wanted/upload.page)"
            >
              BrickLink XML
            </button>
            <button
              type="button"
              className="mode-btn"
              onClick={() => downloadText(inventoryToCsv(rows), `${filename}.csv`, 'text/csv')}
              title="Download a CSV of the parts list"
            >
              CSV
            </button>
            <button
              type="button"
              className="mode-btn"
              onClick={() => copyCsv(rows)}
              title="Copy CSV to clipboard"
            >
              Copy CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PartRow({ row }: { row: InventoryRow }) {
  const { hex, qty, part, blColor, transparent, color } = row;
  const href = blColor ? bricklinkUrl(part.blId, blColor.id) : null;

  return (
    <div className="parts-row" title={part.note}>
      <span
        className={`parts-row__swatch${transparent ? ' parts-row__swatch--trans' : ''}`}
        style={{ background: hex }}
        aria-hidden="true"
      />
      <span className="parts-row__qty">{qty}×</span>
      <span className="parts-row__body">
        <span className="parts-row__name">{part.name}</span>
        <span className="parts-row__meta">
          <span>{blColor ? blColor.name : `${transparent ? 'trans ' : ''}${color} (no BL match)`}</span>
          <span className="parts-row__dot">·</span>
          <span className="parts-row__id">#{part.blId}</span>
          {part.note && <span className="parts-row__warn" title={part.note}>⚠</span>}
          {!blColor && <span className="parts-row__warn" title="No BrickLink color match — excluded from XML export.">⚠</span>}
        </span>
      </span>
      {href ? (
        <a
          className="parts-row__link"
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          title="Open on BrickLink"
          aria-label={`Open ${part.name} on BrickLink`}
        >
          ↗
        </a>
      ) : (
        <span className="parts-row__link parts-row__link--disabled" aria-hidden="true">
          ↗
        </span>
      )}
    </div>
  );
}

function matchesQuery(r: InventoryRow, q: string): boolean {
  if (r.part.name.toLowerCase().includes(q)) return true;
  if (r.part.blId.toLowerCase().includes(q)) return true;
  if (r.blColor && r.blColor.name.toLowerCase().includes(q)) return true;
  if (r.color.toLowerCase().includes(q)) return true;
  if (r.category.toLowerCase().includes(q)) return true;
  return false;
}

function downloadText(body: string, filename: string, mime: string): void {
  const blob = new Blob([body], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function copyCsv(rows: InventoryRow[]): Promise<void> {
  const csv = inventoryToCsv(rows);
  const { show } = useToastStore.getState();
  try {
    await navigator.clipboard.writeText(csv);
    show('Parts list copied as CSV', 'success');
  } catch {
    show('Copy failed — your browser may have blocked clipboard access', 'error');
  }
}
