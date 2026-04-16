import { useEffect } from 'react';
import { validateCreation } from '@brick/shared';
import { useEditorStore } from './editorStore';
import { loadCreationWithHistoryReset } from './commandStack';

const STORAGE_KEY = 'brick-builder:creation';
const AUTOSAVE_DEBOUNCE_MS = 500;

function hydrate(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as unknown;
    const creation = validateCreation(parsed);
    if (!creation) {
      // Stored payload exists but is stale/corrupt — purge so the next save
      // doesn't look like a successful hydration to observers.
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    loadCreationWithHistoryReset(creation);
    return true;
  } catch (err) {
    console.warn('[persistence] hydrate failed:', err);
    return false;
  }
}

function save(): void {
  try {
    const creation = useEditorStore.getState().serializeCreation();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creation));
  } catch (err) {
    // localStorage can throw (quota, Safari private mode). Don't take the app
    // down — autosave is a nice-to-have, not a requirement.
    console.warn('[persistence] autosave failed:', err);
  }
}

/**
 * One-shot hydration + debounced autosave. Hydrates from localStorage first,
 * then attaches the subscriber — so the initial load doesn't trigger a save
 * that would thrash the storage entry.
 *
 * Exported as a hook so the app can opt in at a single mount point.
 */
export function usePersistence(): void {
  useEffect(() => {
    hydrate();

    let timer: number | null = null;
    const scheduleSave = () => {
      if (timer !== null) clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        save();
      }, AUTOSAVE_DEBOUNCE_MS);
    };

    const unsub = useEditorStore.subscribe(scheduleSave);
    return () => {
      if (timer !== null) clearTimeout(timer);
      unsub();
    };
  }, []);
}

/** Wipe the saved creation (used by Import flow before loading a fresh one). */
export function clearPersistedCreation(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Swallow — same rationale as save()
  }
}
