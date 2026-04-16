import { validateCreation, type Creation } from '@brick/shared';
import { loadCreationWithHistoryReset } from './commandStack';
import { useToastStore } from './toastStore';

/** Slug a title for use as a filename. Falls back to "creation". */
export function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return s || 'creation';
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Safari needs the element in the DOM before click()
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on a microtask tick so Safari has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportCreationAsJson(creation: Creation): void {
  const blob = new Blob([JSON.stringify(creation, null, 2)], {
    type: 'application/json',
  });
  triggerDownload(blob, `${slugify(creation.title)}.json`);
}

/**
 * Capture the current WebGL canvas as PNG. Depends on the renderer being
 * created with `preserveDrawingBuffer: true` (see Scene.tsx). Works both in
 * normal render and path-traced render mode — the pathtracer writes to the
 * same canvas.
 */
/**
 * Read a dropped/selected file as a Creation and load it. Emits user-visible
 * toasts for the outcome. Resilient to malformed JSON and schema mismatch —
 * the current scene is preserved until load succeeds.
 */
export async function importCreationFromFile(file: File): Promise<boolean> {
  const { show } = useToastStore.getState();
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    const creation = validateCreation(parsed);
    if (!creation) {
      show('Invalid creation file — not loaded', 'error');
      return false;
    }
    loadCreationWithHistoryReset(creation);
    show(`Imported "${creation.title}"`, 'success');
    return true;
  } catch (err) {
    console.warn('[import] failed:', err);
    show('Could not read file', 'error');
    return false;
  }
}

export async function exportCanvasAsPng(titleForFilename: string): Promise<boolean> {
  const canvas = document.querySelector('.canvas-host canvas') as HTMLCanvasElement | null;
  if (!canvas) return false;
  return new Promise<boolean>((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(false);
          return;
        }
        triggerDownload(blob, `${slugify(titleForFilename)}.png`);
        resolve(true);
      },
      'image/png',
    );
  });
}
