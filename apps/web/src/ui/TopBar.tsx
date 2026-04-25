import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useHelpStore } from '../state/helpStore';
import { useSettingsStore } from '../state/settingsStore';
import { computeStats } from '../state/stats';
import { getPathTraceSupport } from '../state/webglCaps';
import { ExportMenu } from './ExportMenu';
import { RoomControl } from './RoomControl';
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
  const renderMode = useEditorStore((s) => s.renderMode);
  const setRenderMode = useEditorStore((s) => s.setRenderMode);
  const openHelp = useHelpStore((s) => s.setOpen);
  const openSettings = useSettingsStore((s) => s.setOpen);
  const ptSupport = getPathTraceSupport();

  const stats = useMemo(() => computeStats(bricks.values()), [bricks]);

  // Uncontrolled contentEditable — see comment in commitTitle.
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

  // Mobile overflow panel: collapses Room/Export/Share/Settings/Help into one
  // kebab button below 768px so the top bar doesn't overflow. Desktop CSS
  // keeps .top-bar-actions inline regardless of `overflowOpen`.
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const overflowBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!overflowOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (overflowRef.current?.contains(t) || overflowBtnRef.current?.contains(t)) return;
      setOverflowOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverflowOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [overflowOpen]);

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
        <button
          type="button"
          className={`render-toggle${renderMode ? ' render-toggle--active' : ''}`}
          onClick={() => setRenderMode(!renderMode)}
          disabled={!ptSupport.supported && !renderMode}
          title={
            renderMode
              ? 'Exit path-traced render mode'
              : ptSupport.supported
                ? 'Switch to GPU path tracer — non-interactive, converges over a few seconds'
                : ptSupport.reason
          }
          aria-pressed={renderMode}
        >
          <RenderIcon />
          <span className="render-toggle__label">
            {renderMode ? 'Exit render' : 'Render'}
          </span>
        </button>
        <div
          ref={overflowRef}
          className="top-bar-actions"
          data-open={overflowOpen ? 'true' : 'false'}
        >
          <RoomControl />
          <ExportMenu />
          <ShareButton />
          <button
            type="button"
            className="icon-btn"
            aria-label="Graphics settings"
            title="Graphics settings"
            onClick={() => {
              setOverflowOpen(false);
              openSettings(true);
            }}
          >
            <CogIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Keyboard shortcuts and help"
            title="Keyboard shortcuts (?)"
            onClick={() => {
              setOverflowOpen(false);
              openHelp(true);
            }}
          >
            ?
          </button>
        </div>
        <button
          ref={overflowBtnRef}
          type="button"
          className="icon-btn top-bar__overflow-btn"
          aria-label={overflowOpen ? 'Close actions menu' : 'Open actions menu'}
          aria-expanded={overflowOpen}
          onClick={() => setOverflowOpen((v) => !v)}
        >
          <KebabIcon />
        </button>
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

function RenderIcon() {
  // Sparkle / aperture mark — visually distinct from the export
  // camera icon so users don't confuse them. The four small accents
  // hint at "ray sampling".
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <circle
        cx="12"
        cy="12"
        r="4.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M6.7 6.7l2.1 2.1M15.2 15.2l2.1 2.1M6.7 17.3l2.1-2.1M15.2 8.8l2.1-2.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
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

function KebabIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <circle cx="12" cy="5.5" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="18.5" r="1.8" fill="currentColor" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M19.4 13.5a7.5 7.5 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2h-4l-.4 3a7.6 7.6 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 3h4l.4-3a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
