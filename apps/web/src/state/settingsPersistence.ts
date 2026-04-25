import { useEffect } from 'react';
import { useEditorStore, type EditorState } from './editorStore';

/**
 * Local persistence for user settings — visual knobs, audio toggles,
 * quality preset, PT tuning, etc. Separate from creation persistence
 * (persistence.ts) because the payloads have different lifecycles:
 * creations are owned by the document being edited, settings are
 * owned by the browser profile. A user loading someone else's shared
 * link shouldn't adopt the sender's render samples or light warmth.
 *
 * Curated allowlist (PERSISTED_FIELDS) gates what crosses the
 * boundary — anything not on the list is left at store defaults on
 * hydrate. Keeps:
 *   - live session state (placement cursor, selection, carrying,
 *     renderMode, pathtracerSamples, multiplayerActive, etc.) out of
 *     the stored blob
 *   - future store type widenings from silently inheriting stale
 *     localStorage values
 */

const STORAGE_KEY = 'brick-builder:settings';
const AUTOSAVE_DEBOUNCE_MS = 250;
const VERSION = 1;

const PERSISTED_FIELDS = [
  'quality',
  'aoEnabled',
  'bloomEnabled',
  'smaaEnabled',
  'lightIntensity',
  'lightWarmth',
  'envIntensity',
  'envRotation',
  'envBackgroundVisible',
  'envBackgroundBlur',
  'envBackgroundIntensity',
  'toneMapping',
  'brickReflectivity',
  'baseplateVisible',
  'studsVisible',
  'baseplateColor',
  'pathtracerMaxSamples',
  'pathtracerBounces',
  'pathtracerResolutionScale',
  'pathtracerDofEnabled',
  'pathtracerFStop',
  'pathtracerApertureBlades',
  'denoiseEnabled',
  'denoiseAlgorithm',
  'denoiseStrength',
  'placementSoundEnabled',
  'wooshSoundEnabled',
  'audioMuted',
  'idlePauseEnabled',
] as const satisfies readonly (keyof EditorState)[];

type PersistedKey = (typeof PERSISTED_FIELDS)[number];
type PersistedSettings = Pick<EditorState, PersistedKey>;
type Envelope = { version: number; settings: PersistedSettings };

function snapshot(state: EditorState): PersistedSettings {
  const out: Partial<PersistedSettings> = {};
  for (const k of PERSISTED_FIELDS) {
    (out as Record<string, unknown>)[k] = state[k];
  }
  return out as PersistedSettings;
}

function hydrate(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Envelope>;
    if (parsed.version !== VERSION || !parsed.settings) return;
    // Build a surgical patch: pull only known keys, and only when
    // the stored type matches the store's current type for that
    // field. A user's rogue localStorage edit or an older VERSION
    // schema drift shouldn't be able to inject bad values.
    const currentState = useEditorStore.getState();
    const patch: Partial<EditorState> = {};
    for (const k of PERSISTED_FIELDS) {
      const incoming = (parsed.settings as Record<string, unknown>)[k];
      if (incoming === undefined) continue;
      if (typeof incoming !== typeof currentState[k]) continue;
      (patch as Record<string, unknown>)[k] = incoming;
    }
    useEditorStore.setState(patch);
  } catch (err) {
    console.warn('[settings-persistence] hydrate failed:', err);
  }
}

function save(): void {
  try {
    const env: Envelope = {
      version: VERSION,
      settings: snapshot(useEditorStore.getState()),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(env));
  } catch (err) {
    // localStorage can throw (quota, Safari private mode). Don't
    // take the app down — the failure mode is just "settings reset
    // on next reload", which is the same as not persisting at all.
    console.warn('[settings-persistence] save failed:', err);
  }
}

/**
 * One-shot hydration + debounced autosave. Mirrors the structure of
 * usePersistence (creation data) so both layers share an observable
 * shape. Paired with that hook in App.tsx — creation hydrates first
 * (the important one) then settings overlay on top.
 */
export function useSettingsPersistence(): void {
  useEffect(() => {
    hydrate();

    let timer: number | null = null;
    const schedule = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        save();
      }, AUTOSAVE_DEBOUNCE_MS);
    };

    const unsub = useEditorStore.subscribe(schedule);
    return () => {
      if (timer !== null) clearTimeout(timer);
      unsub();
    };
  }, []);
}
