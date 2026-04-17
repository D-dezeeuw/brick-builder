import { validateCreation, type Creation } from '@brick/shared';
import { loadCreationWithHistoryReset } from './commandStack';
import { requestPngCapture } from './captureBus';
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
 * Hard ceiling on imported JSON size. A valid creation with 10k bricks is
 * well under 2 MB; 10 MB is a generous envelope that still keeps a hostile
 * drop (e.g. a multi-GB "JSON" file) from OOM'ing the tab before parse.
 */
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/**
 * Read a dropped/selected file as a Creation and load it. Emits user-visible
 * toasts for the outcome. Resilient to malformed JSON and schema mismatch —
 * the current scene is preserved until load succeeds.
 */
export async function importCreationFromFile(file: File): Promise<boolean> {
  const { show } = useToastStore.getState();
  if (file.size > MAX_IMPORT_BYTES) {
    show('File too large (max 10 MB)', 'error');
    return false;
  }
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

/**
 * Capture the current scene as PNG via an offscreen WebGLRenderTarget (see
 * scene/CaptureBridge.tsx). Works without `preserveDrawingBuffer: true` —
 * which otherwise conflicts with N8AO's normal-pass blit.
 *
 * Render-mode note: the path tracer writes to the main canvas only, so
 * exporting while render mode is on captures a fresh rasterized render of
 * the current camera, not the accumulated path-traced image. Exit render
 * mode first if a rasterized screenshot is not what you want.
 */
export async function exportCanvasAsPng(titleForFilename: string): Promise<boolean> {
  const blob = await requestPngCapture();
  if (!blob) return false;
  triggerDownload(blob, `${slugify(titleForFilename)}.png`);
  return true;
}
