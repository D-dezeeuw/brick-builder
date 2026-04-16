import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useToastStore } from '../state/toastStore';
import {
  exportCanvasAsPng,
  exportCreationAsJson,
  importCreationFromFile,
} from '../state/exporters';

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const title = useEditorStore((s) => s.title);
  const serializeCreation = useEditorStore((s) => s.serializeCreation);
  const showToast = useToastStore((s) => s.show);

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

  const onImportClick = () => {
    fileInputRef.current?.click();
  };

  const onFileChosen: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    // Reset the input so choosing the same file twice in a row still fires
    // onChange; otherwise the second selection is silently a no-op.
    e.target.value = '';
    if (!file) return;
    setOpen(false);
    await importCreationFromFile(file);
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
        File ▾
      </button>
      {open && (
        <div className="export-menu__panel" role="menu">
          <button type="button" role="menuitem" onClick={onJson}>
            <span>Export JSON</span>
            <span className="export-menu__hint">download .json of this creation</span>
          </button>
          <button type="button" role="menuitem" onClick={onPng}>
            <span>Export Screenshot</span>
            <span className="export-menu__hint">download .png of the current view</span>
          </button>
          <div className="export-menu__divider" role="separator" />
          <button type="button" role="menuitem" onClick={onImportClick}>
            <span>Import JSON…</span>
            <span className="export-menu__hint">replaces the current scene</span>
          </button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={onFileChosen}
      />
    </div>
  );
}
