import { useEffect, useRef } from 'react';
import { EffectsSection } from './EffectsSection';
import { LightingSection } from './LightingSection';
import { QualitySection } from './QualitySection';
import { ViewSection } from './ViewSection';

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Graphics settings panel. Lives in a modal (not the sidebar) so the editing
 * surface stays focused on content — mode, colors, pieces — and display
 * knobs don't compete for the same scroll space. The scene is dimmed but
 * visible through the backdrop so tweaks to Quality / Lighting / Effects
 * can be judged in real time.
 */
export function SettingsModal({ open, onClose }: Props) {
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
      className="settings-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onMouseDown={(e) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
      }}
    >
      <div ref={panelRef} className="settings-panel">
        <header className="settings-panel__header">
          <h2 id="settings-title">Graphics settings</h2>
          <button type="button" className="icon-btn" aria-label="Close settings" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="settings-panel__body">
          <QualitySection />
          <ViewSection />
          <LightingSection />
          <EffectsSection />
        </div>
      </div>
    </div>
  );
}
