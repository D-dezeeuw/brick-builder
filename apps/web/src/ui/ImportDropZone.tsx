import { useEffect, useState } from 'react';

/**
 * Window-level drag-drop handler. Shows a full-canvas overlay while a JSON
 * file is dragged in, and loads it on drop. Leaves text-drop / other drags
 * alone (the checks on `dataTransfer.types` and the dropped file type).
 */
export function ImportDropZone() {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let dragDepth = 0;

    const hasFile = (dt: DataTransfer | null): boolean =>
      !!dt && Array.from(dt.types).includes('Files');

    const onDragEnter = (e: DragEvent) => {
      if (!hasFile(e.dataTransfer)) return;
      e.preventDefault();
      dragDepth++;
      setDragging(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasFile(e.dataTransfer)) return;
      e.preventDefault();
      // Ensure the browser doesn't interpret the drop as navigation.
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const onDragLeave = (e: DragEvent) => {
      if (!hasFile(e.dataTransfer)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDragging(false);
    };

    const onDrop = async (e: DragEvent) => {
      if (!hasFile(e.dataTransfer)) return;
      e.preventDefault();
      dragDepth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const { importCreationFromFile } = await import('../state/exporters');
      await importCreationFromFile(file);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  if (!dragging) return null;
  return (
    <div className="drop-zone" aria-hidden="true">
      <div className="drop-zone__pill">Drop JSON to import</div>
    </div>
  );
}
