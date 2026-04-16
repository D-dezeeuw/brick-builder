import { useEditorStore } from '../state/editorStore';

type Props = {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export function TopBar({ sidebarOpen, onToggleSidebar }: Props) {
  const brickCount = useEditorStore((s) => s.bricks.size);
  return (
    <>
      <h1 className="title">Untitled Creation</h1>
      <div className="top-bar-right">
        <span className="stats">{brickCount} bricks</span>
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
