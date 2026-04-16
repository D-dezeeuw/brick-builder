import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useToastStore } from '../state/toastStore';
import { exportCanvasAsPng, exportCreationAsJson } from '../state/exporters';

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const title = useEditorStore((s) => s.title);
  const serializeCreation = useEditorStore((s) => s.serializeCreation);
  const showToast = useToastStore((s) => s.show);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onJson = () => {
    exportCreationAsJson(serializeCreation());
    setOpen(false);
    showToast('JSON exported', 'success');
  };

  const onPng = async () => {
    setOpen(false);
    const ok = await exportCanvasAsPng(title);
    if (ok) showToast('Screenshot saved', 'success');
    else showToast('Screenshot failed — canvas not ready', 'error');
  };

  return (
    <div ref={rootRef} className="export-menu">
      <button
        type="button"
        className="icon-btn icon-btn--text"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Export ▾
      </button>
      {open && (
        <div className="export-menu__panel" role="menu">
          <button type="button" role="menuitem" onClick={onJson}>
            <span>JSON</span>
            <span className="export-menu__hint">.json of the creation</span>
          </button>
          <button type="button" role="menuitem" onClick={onPng}>
            <span>Screenshot</span>
            <span className="export-menu__hint">.png of the current view</span>
          </button>
        </div>
      )}
    </div>
  );
}
