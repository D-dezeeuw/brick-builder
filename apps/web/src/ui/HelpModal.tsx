import { useEffect, useRef } from 'react';

const SECTIONS: Array<{
  heading: string;
  rows: Array<[key: string, description: string]>;
}> = [
  {
    heading: 'Building',
    rows: [
      ['Tap / L-click', 'Place the selected brick'],
      ['R-click / Erase mode', 'Remove a brick'],
      ['Alt + click', 'Eyedropper — copy shape, colour, clear flag'],
      ['B / X / H', 'Switch mode: Build / eXit (erase) / Hand'],
      ['R', 'Rotate the ghost'],
      ['Q / E', 'Lower / raise target layer'],
      ['Arrow keys', 'Nudge ghost ±1 stud (resets on mouse move)'],
      ['1 – 9', 'Select recent shape'],
    ],
  },
  {
    heading: 'Camera',
    rows: [
      ['Drag', 'Orbit'],
      ['Middle-drag', 'Pan'],
      ['Space + drag', 'Pan with left mouse'],
      ['Wheel', 'Zoom'],
      ['Two fingers', 'Pan + pinch zoom (touch)'],
    ],
  },
  {
    heading: 'Hand mode',
    rows: [
      ['Click a brick', 'Pick it up — flips to Build, copies shape/colour/rotation'],
      ['Next click', 'Drop the carried brick at the cursor'],
      ['R / Q / E', 'Rotate / layer-down / layer-up the carried ghost'],
      ['⌘ / Ctrl + Z', 'Undo the pickup — brick returns to its old spot'],
    ],
  },
  {
    heading: 'Editing',
    rows: [
      ['⌘ / Ctrl + Z', 'Undo'],
      ['⌘ / Ctrl + Shift + Z', 'Redo'],
      ['File ▾', 'Import / export JSON + PNG'],
      ['Share', 'Copy a link to this creation'],
    ],
  },
  {
    heading: 'Multiplayer',
    rows: [
      ['Start room', 'Create a live room and share the link'],
      ['?r=…', 'Open a room URL to join a live session'],
    ],
  },
  {
    heading: 'Graphics',
    rows: [
      ['⚙', 'Open Quality / View / Lighting / Effects'],
      ['View', 'Hide the baseplate or stud bumps for clean screenshots'],
      ['Ultra', 'Enables GPU path-traced render mode'],
    ],
  },
  {
    heading: 'This help panel',
    rows: [
      ['?', 'Open this at any time'],
      ['Esc', 'Close'],
    ],
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function HelpModal({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="help-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
      onMouseDown={(e) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
      }}
    >
      <div ref={panelRef} className="help-panel">
        <header className="help-panel__header">
          <h2 id="help-title">Brick Builder — keyboard & controls</h2>
          <button type="button" className="icon-btn" aria-label="Close help" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="help-panel__grid">
          {SECTIONS.map((section) => (
            <section key={section.heading} className="help-panel__section">
              <h3>{section.heading}</h3>
              <dl>
                {section.rows.map(([k, v]) => (
                  <div key={k} className="help-row">
                    <dt>
                      <kbd>{k}</kbd>
                    </dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <footer className="help-panel__footer">
          <span>
            Made by{' '}
            <a href="https://nekomedia.nl" target="_blank" rel="noopener noreferrer">
              Neko Media
            </a>
          </span>
          <a
            href="https://github.com/D-dezeeuw/brick-builder"
            target="_blank"
            rel="noopener noreferrer"
            className="help-panel__github"
          >
            <GithubIcon />
            <span>D-dezeeuw/brick-builder</span>
          </a>
        </footer>
      </div>
    </div>
  );
}

function GithubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <path d="M12 .5a11.5 11.5 0 0 0-3.63 22.41c.57.1.79-.25.79-.55v-1.95c-3.2.7-3.88-1.55-3.88-1.55-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.27-5.24-5.65 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a11 11 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.82 1.18 3.07 0 4.39-2.7 5.36-5.27 5.64.41.36.78 1.06.78 2.13v3.16c0 .31.21.66.79.55A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}
