import { useMemo, useState } from 'react';
import { BRICK_COLOR_HEX, type Brick, type Layer, type SavedView } from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { useToastStore } from '../state/toastStore';
import {
  requestApplyView,
  requestCaptureCurrentView,
} from '../state/cameraViewBus';
import {
  buildTree,
  groupDisplayName,
  positionLabel,
  shapeDisplayName,
  type GroupKey,
  type TreeGroup,
  type TreeLayer,
} from './organiseTree';

/**
 * The Organise sidebar tab — layers (visibility, lock, active target) and
 * saved camera views. State lives in the editor store so both travel
 * with the Creation JSON on export/import/URL share.
 */
export function OrganisePanel() {
  return (
    <div className="organise-panel">
      <SelectionSection />
      <LayersSection />
      <ViewsSection />
    </div>
  );
}

/**
 * Only renders when a multi-selection exists. Shows the count and a
 * "Move to…" layer chooser. Selection is populated via Hand-mode
 * shift-click in the scene.
 */
function SelectionSection() {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const layers = useEditorStore((s) => s.layers);
  const moveSelectionToLayer = useEditorStore((s) => s.moveSelectionToLayer);
  const clearSelection = useEditorStore((s) => s.clearSelection);

  if (selectedIds.size === 0) return null;

  const count = selectedIds.size;

  return (
    <section className="organise-section organise-selection">
      <header className="organise-section__header">
        <h2 className="sidebar-heading">Selection</h2>
        <button
          type="button"
          className="organise-section__add"
          onClick={clearSelection}
          title="Clear selection (Esc)"
        >
          Clear
        </button>
      </header>
      <div className="organise-selection__body">
        <div className="organise-selection__count">
          <strong>{count}</strong> brick{count === 1 ? '' : 's'} selected
        </div>
        <label className="organise-selection__move">
          <span>Move to</span>
          <select
            className="organise-selection__select"
            value=""
            onChange={(e) => {
              const id = e.currentTarget.value;
              if (!id) return;
              moveSelectionToLayer(id);
              // Reset the select so picking the same layer twice works.
              e.currentTarget.value = '';
            }}
          >
            <option value="" disabled>
              Choose layer…
            </option>
            {layers.map((l) => (
              <option key={l.id} value={l.id} disabled={l.locked}>
                {l.name}
                {l.locked ? ' (locked)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="organise-hint">
        Shift-click in Hand mode to add/remove. Esc clears.
      </p>
    </section>
  );
}

function LayersSection() {
  const layers = useEditorStore((s) => s.layers);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const bricks = useEditorStore((s) => s.bricks);
  const createLayer = useEditorStore((s) => s.createLayer);

  const tree = useMemo(() => buildTree(bricks, layers), [bricks, layers]);

  // Expansion state is local to the panel — not persisted, so a fresh
  // session starts with everything collapsed (keeps large scenes snappy).
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(() => new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<GroupKey>>(() => new Set());

  const toggleLayer = (id: string) =>
    setExpandedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleGroup = (key: GroupKey) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
      <div className="organise-list organise-tree">
        {tree.map((node) => (
          <LayerNode
            key={node.layer.id}
            node={node}
            active={node.layer.id === activeLayerId}
            expanded={expandedLayers.has(node.layer.id)}
            expandedGroups={expandedGroups}
            onToggleLayer={toggleLayer}
            onToggleGroup={toggleGroup}
          />
        ))}
      </div>
      <p className="organise-hint">
        New bricks drop into the active layer. Hide a layer to work around it;
        lock one to freeze it from edits. Expand a layer to select individual
        pieces from the tree.
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

function LayerNode({
  node,
  active,
  expanded,
  expandedGroups,
  onToggleLayer,
  onToggleGroup,
}: {
  node: TreeLayer;
  active: boolean;
  expanded: boolean;
  expandedGroups: Set<GroupKey>;
  onToggleLayer: (id: string) => void;
  onToggleGroup: (key: GroupKey) => void;
}) {
  const { layer, groups, total } = node;
  return (
    <div className="organise-node">
      <LayerRow
        layer={layer}
        active={active}
        count={total}
        expanded={expanded}
        hasChildren={groups.length > 0}
        onToggle={() => onToggleLayer(layer.id)}
      />
      {expanded && groups.length > 0 && (
        <div className="organise-tree__children">
          {groups.map((group) => (
            <GroupNode
              key={group.key}
              layerId={layer.id}
              group={group}
              expanded={expandedGroups.has(group.key)}
              onToggle={() => onToggleGroup(group.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LayerRow({
  layer,
  active,
  count,
  expanded,
  hasChildren,
  onToggle,
}: {
  layer: Layer;
  active: boolean;
  count: number;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
}) {
  const setLayerVisibility = useEditorStore((s) => s.setLayerVisibility);
  const setLayerLocked = useEditorStore((s) => s.setLayerLocked);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const renameLayer = useEditorStore((s) => s.renameLayer);
  const deleteLayer = useEditorStore((s) => s.deleteLayer);
  const selectAllOnLayer = useEditorStore((s) => s.selectAllOnLayer);

  const isDefault = layer.id === 'default';

  return (
    <div className={`organise-row organise-row--layer${active ? ' organise-row--active' : ''}`}>
      <button
        type="button"
        className={`organise-chevron${hasChildren ? '' : ' organise-chevron--empty'}`}
        onClick={onToggle}
        disabled={!hasChildren}
        aria-label={expanded ? 'Collapse layer' : 'Expand layer'}
        aria-expanded={expanded}
        title={hasChildren ? (expanded ? 'Collapse' : 'Expand') : 'Layer is empty'}
      >
        <ChevronIcon open={expanded} />
      </button>
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
      <button
        type="button"
        className="organise-row__count organise-row__count--btn"
        onClick={() => selectAllOnLayer(layer.id)}
        title={`Select all ${count} brick${count === 1 ? '' : 's'} on this layer`}
        aria-label={`Select all bricks on ${layer.name}`}
        disabled={count === 0}
      >
        {count}
      </button>
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

function GroupNode({
  layerId,
  group,
  expanded,
  onToggle,
}: {
  layerId: string;
  group: TreeGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const toggleGroupSelection = useEditorStore((s) => s.toggleGroupSelection);

  // Are all bricks in this group currently selected? Drives the
  // select-all toggle feel — clicking the row deselects the whole
  // group once it's fully selected.
  const allSelected = useMemo(() => {
    if (group.bricks.length === 0) return false;
    for (const b of group.bricks) if (!selectedIds.has(b.id)) return false;
    return true;
  }, [group.bricks, selectedIds]);
  const someSelected = useMemo(() => {
    if (allSelected) return true;
    for (const b of group.bricks) if (selectedIds.has(b.id)) return true;
    return false;
  }, [allSelected, group.bricks, selectedIds]);

  const name = groupDisplayName(group.shape, group.color, group.transparent);
  const hex = BRICK_COLOR_HEX[group.color];

  return (
    <div className="organise-node organise-node--group">
      <div
        className={`organise-row organise-row--group${allSelected ? ' organise-row--selected' : someSelected ? ' organise-row--partial' : ''}`}
      >
        <button
          type="button"
          className="organise-chevron"
          onClick={onToggle}
          aria-label={expanded ? 'Collapse group' : 'Expand group'}
          aria-expanded={expanded}
        >
          <ChevronIcon open={expanded} />
        </button>
        <span
          className={`organise-swatch${group.transparent ? ' organise-swatch--trans' : ''}`}
          style={{ background: hex }}
          aria-hidden="true"
        />
        <button
          type="button"
          className="organise-row__group-body"
          onClick={() =>
            toggleGroupSelection(layerId, group.shape, group.color, group.transparent)
          }
          title={
            allSelected
              ? `Deselect all ${group.bricks.length} ${name}`
              : `Select all ${group.bricks.length} ${name}`
          }
        >
          <span className="organise-row__group-name">{name}</span>
          <span className="organise-row__group-count">× {group.bricks.length}</span>
        </button>
      </div>
      {expanded && (
        <div className="organise-tree__children organise-tree__children--bricks">
          {group.bricks.map((brick) => (
            <BrickNode key={brick.id} brick={brick} groupName={name} />
          ))}
        </div>
      )}
    </div>
  );
}

function BrickNode({ brick, groupName }: { brick: Brick; groupName: string }) {
  const selected = useEditorStore((s) => s.selectedIds.has(brick.id));
  const toggleBrickSelected = useEditorStore((s) => s.toggleBrickSelected);
  const label = shapeDisplayName(brick.shape);
  const pos = positionLabel(brick);

  return (
    <button
      type="button"
      className={`organise-row organise-row--brick${selected ? ' organise-row--selected' : ''}`}
      onClick={() => toggleBrickSelected(brick.id)}
      title={`${groupName} at ${pos}`}
    >
      <span className="organise-row__brick-dot" aria-hidden="true" />
      <span className="organise-row__brick-name">{label}</span>
      <span className="organise-row__brick-pos">{pos}</span>
    </button>
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

function ChevronIcon({ open }: { open: boolean }) {
  // Rotates via CSS transform so the open/close states read as one
  // continuous widget rather than two different icons.
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      aria-hidden="true"
      className={`organise-chevron__svg${open ? ' organise-chevron__svg--open' : ''}`}
    >
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
