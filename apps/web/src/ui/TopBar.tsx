import { useEffect, useMemo, useRef } from 'react';
import { useEditorStore } from '../state/editorStore';
import { computeStats } from '../state/stats';
import { ExportMenu } from './ExportMenu';
import { ShareButton } from './ShareButton';

type Props = {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export function TopBar({ sidebarOpen, onToggleSidebar }: Props) {
  const bricks = useEditorStore((s) => s.bricks);
  const title = useEditorStore((s) => s.title);
  const setTitle = useEditorStore((s) => s.setTitle);
  const layerOffset = useEditorStore((s) => s.layerOffset);

  const stats = useMemo(() => computeStats(bricks.values()), [bricks]);

  // Uncontrolled contentEditable: we render the title once and never let
  // React rewrite it while the user is typing (React's DOM diff would move
  // the caret). A one-way sync updates the DOM when the title changes from
  // the outside (e.g. a shared URL loads a creation).
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (el && el.textContent !== title) el.textContent = title;
  }, [title]);

  const commitTitle = (el: HTMLElement) => {
    const next = (el.textContent ?? '').trim() || 'Untitled Creation';
    if (next !== title) setTitle(next);
    if (el.textContent !== next) el.textContent = next;
  };

  return (
    <>
      <h1
        ref={titleRef}
        className="title"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        aria-label="Creation title"
        onBlur={(e) => commitTitle(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            if (titleRef.current) titleRef.current.textContent = title;
            e.currentTarget.blur();
          }
        }}
      >
        {/* Initial content only. Subsequent renders leave the DOM untouched. */}
        {title}
      </h1>
      <div className="top-bar-right">
        {layerOffset > 0 && (
          <span className="stats stats--accent" title="Layer offset (Q/E)">
            +{layerOffset} layer{layerOffset === 1 ? '' : 's'}
          </span>
        )}
        <StatChip label="bricks" value={stats.brickCount} />
        {stats.extent && (
          <StatChip
            label="size"
            value={`${stats.extent.w}×${stats.extent.d}×${stats.extent.h}`}
            title="width × depth in studs × height in plate layers"
          />
        )}
        {stats.uniqueColors > 1 && <StatChip label="colors" value={stats.uniqueColors} />}
        <ExportMenu />
        <ShareButton />
        <button
          type="button"
          className="icon-btn"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Open sidebar'}
          aria-pressed={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <PaletteIcon />
        </button>
      </div>
    </>
  );
}

function StatChip({
  label,
  value,
  title,
}: {
  label: string;
  value: number | string;
  title?: string;
}) {
  return (
    <span className="stats" title={title}>
      <span className="stats__value">{value}</span> {label}
    </span>
  );
}

function PaletteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M12 3c4.97 0 9 3.58 9 8 0 2.76-2.24 5-5 5h-1.5a1.5 1.5 0 0 0-1.06 2.56c.37.37.56.87.56 1.44 0 1.1-.9 2-2 2-4.97 0-9-4.03-9-9s4.03-10 9-10Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="11" r="1.25" fill="currentColor" />
      <circle cx="10.5" cy="7.5" r="1.25" fill="currentColor" />
      <circle cx="14.5" cy="7.5" r="1.25" fill="currentColor" />
      <circle cx="17" cy="11" r="1.25" fill="currentColor" />
    </svg>
  );
}
