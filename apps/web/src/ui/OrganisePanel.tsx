import { useMemo, useState } from 'react';
import type { Layer, SavedView } from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { useToastStore } from '../state/toastStore';
import {
  requestApplyView,
  requestCaptureCurrentView,
} from '../state/cameraViewBus';

/**
 * The Organise sidebar tab — layers (visibility, lock, active target) and
 * saved camera views. State lives in the editor store so both travel
 * with the Creation JSON on export/import/URL share.
 */
export function OrganisePanel() {
  return (
    <div className="organise-panel">
      <LayersSection />
      <ViewsSection />
    </div>
  );
}

function LayersSection() {
  const layers = useEditorStore((s) => s.layers);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const bricks = useEditorStore((s) => s.bricks);
  const createLayer = useEditorStore((s) => s.createLayer);

  // Brick counts per layer — cheap to recompute, keeps the UI honest
  // without threading extra state through the store.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bricks.values()) {
      const lid = b.layerId ?? layers[0]?.id ?? 'default';
      m.set(lid, (m.get(lid) ?? 0) + 1);
    }
    return m;
  }, [bricks, layers]);

  return (
    <section className="organise-section">
      <header className="organise-section__header">
        <h2 className="sidebar-heading">Layers</h2>
        <button
          type="button"
          className="organise-section__add"
          onClick={() => createLayer(defaultLayerName(layers))}
          title="Create a new layer and make it active"
        >
          + New
        </button>
      </header>
      <div className="organise-list">
        {layers.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            active={layer.id === activeLayerId}
            count={counts.get(layer.id) ?? 0}
          />
        ))}
      </div>
      <p className="organise-hint">
        New bricks drop into the active layer. Hide a layer to work around it;
        lock one to freeze it from edits.
      </p>
    </section>
  );
}

function defaultLayerName(existing: Layer[]): string {
  // "Layer 2", "Layer 3", … — skip names that already exist.
  const names = new Set(existing.map((l) => l.name));
  let n = existing.length + 1;
  while (names.has(`Layer ${n}`)) n++;
  return `Layer ${n}`;
}

function LayerRow({ layer, active, count }: { layer: Layer; active: boolean; count: number }) {
  const setLayerVisibility = useEditorStore((s) => s.setLayerVisibility);
  const setLayerLocked = useEditorStore((s) => s.setLayerLocked);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const renameLayer = useEditorStore((s) => s.renameLayer);
  const deleteLayer = useEditorStore((s) => s.deleteLayer);

  const isDefault = layer.id === 'default';

  return (
    <div className={`organise-row organise-row--layer${active ? ' organise-row--active' : ''}`}>
      <button
        type="button"
        className={`organise-icon-btn${layer.visible ? '' : ' organise-icon-btn--off'}`}
        onClick={() => setLayerVisibility(layer.id, !layer.visible)}
        title={layer.visible ? 'Hide layer' : 'Show layer'}
        aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
      >
        {layer.visible ? <EyeIcon /> : <EyeOffIcon />}
      </button>
      <button
        type="button"
        className={`organise-icon-btn${layer.locked ? ' organise-icon-btn--on' : ''}`}
        onClick={() => setLayerLocked(layer.id, !layer.locked)}
        title={layer.locked ? 'Unlock layer' : 'Lock layer'}
        aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
      >
        {layer.locked ? <LockIcon /> : <UnlockIcon />}
      </button>
      <button
        type="button"
        className="organise-row__target"
        onClick={() => setActiveLayer(layer.id)}
        title={active ? 'Active — new bricks land here' : 'Make this the active layer'}
        aria-pressed={active}
      >
        <span className={`organise-row__dot${active ? ' organise-row__dot--on' : ''}`} aria-hidden="true" />
      </button>
      <EditableName
        value={layer.name}
        onCommit={(next) => renameLayer(layer.id, next)}
        ariaLabel={`Rename layer ${layer.name}`}
      />
      <span className="organise-row__count" title={`${count} brick${count === 1 ? '' : 's'}`}>
        {count}
      </span>
      <button
        type="button"
        className="organise-row__delete"
        onClick={() => !isDefault && deleteLayer(layer.id)}
        disabled={isDefault}
        title={isDefault ? 'The default layer cannot be deleted' : 'Delete layer (bricks move to Default)'}
        aria-label="Delete layer"
      >
        ×
      </button>
    </div>
  );
}

function ViewsSection() {
  const views = useEditorStore((s) => s.views);
  const addView = useEditorStore((s) => s.addView);
  const [saving, setSaving] = useState(false);

  const captureAndSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const snap = await requestCaptureCurrentView();
      if (!snap) {
        useToastStore.getState().show('Could not read camera', 'error');
        return;
      }
      const id = cryptoRandomId();
      const name = defaultViewName(views);
      addView({ id, name, position: snap.position, target: snap.target });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="organise-section">
      <header className="organise-section__header">
        <h2 className="sidebar-heading">Views</h2>
        <button
          type="button"
          className="organise-section__add"
          onClick={captureAndSave}
          disabled={saving}
          title="Save the current camera as a named view"
        >
          + Save
        </button>
      </header>
      {views.length === 0 ? (
        <p className="organise-hint">
          Save the current camera angle so you can return to it, or compare a
          before/after view of your build.
        </p>
      ) : (
        <div className="organise-list">
          {views.map((view) => (
            <ViewRow key={view.id} view={view} />
          ))}
        </div>
      )}
    </section>
  );
}

function defaultViewName(existing: SavedView[]): string {
  const names = new Set(existing.map((v) => v.name));
  let n = existing.length + 1;
  while (names.has(`View ${n}`)) n++;
  return `View ${n}`;
}

function ViewRow({ view }: { view: SavedView }) {
  const renameView = useEditorStore((s) => s.renameView);
  const deleteView = useEditorStore((s) => s.deleteView);

  return (
    <div className="organise-row organise-row--view">
      <button
        type="button"
        className="organise-icon-btn"
        onClick={() => requestApplyView(view)}
        title="Go to this view"
        aria-label={`Apply view ${view.name}`}
      >
        <CameraIcon />
      </button>
      <EditableName
        value={view.name}
        onCommit={(next) => renameView(view.id, next)}
        ariaLabel={`Rename view ${view.name}`}
      />
      <button
        type="button"
        className="organise-row__delete"
        onClick={() => deleteView(view.id)}
        title="Delete view"
        aria-label="Delete view"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Editable name field — plain text until clicked/focused, then edits
 * in place. Commits on blur or Enter; Escape reverts.
 */
function EditableName({
  value,
  onCommit,
  ariaLabel,
}: {
  value: string;
  onCommit: (next: string) => void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(value);
  // Sync if the external value changes while we're not editing.
  const [editing, setEditing] = useState(false);
  if (!editing && draft !== value) setDraft(value);

  return (
    <input
      type="text"
      className="organise-row__name"
      value={draft}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false);
        if (draft.trim()) onCommit(draft);
        else setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      aria-label={ariaLabel}
      maxLength={64}
    />
  );
}

function cryptoRandomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(36).padStart(2, '0');
  }
  return out;
}

// ---------- Icons ----------

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M10.5 6.3A11 11 0 0 1 12 6c6.5 0 10 6 10 6a15 15 0 0 1-3.2 3.6M6.7 7.6A15 15 0 0 0 2 12s3.5 6 10 6c1.5 0 2.9-.3 4.1-.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 11V7a4 4 0 0 1 7.5-1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
