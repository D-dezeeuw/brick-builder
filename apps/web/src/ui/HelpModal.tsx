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
      ['⚙', 'Open Quality / Lighting / Effects'],
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
      </div>
    </div>
  );
}
