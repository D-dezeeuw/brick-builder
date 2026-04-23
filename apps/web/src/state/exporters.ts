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

function isMobile(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

/**
 * On mobile, the default "download" behaviour parks the PNG in the
 * Files app — which most users don't know how to find. The Web Share
 * API with files opens the native iOS / Android share sheet, from
 * which users can tap "Save Image" (iOS) or "Save to Photos" /
 * "Download" (Android) and land the shot in their photo roll directly.
 *
 * Desktop keeps the direct-download behaviour since its download
 * folder is discoverable and a share sheet is a worse UX for power
 * users who just want the file. Browsers without share-with-files
 * support (Firefox on any platform, older WebKit) fall through to
 * download automatically.
 *
 * AbortError from `navigator.share` means the user dismissed the
 * sheet — we treat that as success (they made a choice), not a
 * silent fallback to download.
 */
async function shareOrDownload(blob: Blob, filename: string): Promise<void> {
  if (isMobile() && typeof navigator.canShare === 'function') {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Anything else (NotAllowedError, unknown failure): fall
        // through to direct download so the user still gets the file.
      }
    }
  }
  triggerDownload(blob, filename);
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
  await shareOrDownload(blob, `${slugify(titleForFilename)}.png`);
  return true;
}
