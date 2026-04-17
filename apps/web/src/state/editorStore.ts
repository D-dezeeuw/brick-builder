import { create } from 'zustand';
import {
  CURRENT_SCHEMA_VERSION,
  cellKey,
  footprintCells,
  type BaseplateBounds,
  type Brick,
  type BrickColor,
  type BrickShape,
  type Creation,
  type Rotation,
} from '@brick/shared';
import { EFFECT_DEFAULTS } from './quality';
import { setPlacementSoundEnabled } from './placementFeedback';

/**
 * Brick IDs: 10 random base36 chars from crypto.getRandomValues.
 *
 * We used to mint ids from a client-side counter (`b1, b2, b3, ...`).
 * That worked fine for solo creations but broke the instant two
 * clients joined the same room — both start at `b1` and collide on
 * the server's `bricks_pkey` primary-key constraint (SQLSTATE 23505).
 *
 * 36^10 ≈ 3.7e15 values; at our 10k-bricks-per-creation cap the
 * birthday collision probability is negligible. No cross-client
 * coordination needed, existing counter-based ids remain valid
 * strings in loaded creations (we just stop minting them).
 */
const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 10;
function nextId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < ID_LENGTH; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return out;
}

type PlacementInput = Omit<Brick, 'id'>;

export type EditorMode = 'build' | 'erase';
export type Quality = 'low' | 'medium' | 'high' | 'ultra';

const HOTBAR_SIZE = 9;

/** Baseplate auto-expansion tuning. */
const EDGE_MARGIN_STUDS = 4; // trigger expansion when placement is within this many studs of edge
const EXPANSION_CHUNK_STUDS = 16;
const INITIAL_HALF = 16; // initial baseplate is ±16 studs = 32x32

export type { BaseplateBounds };

type EditorState = {
  /** Human-readable creation title — shown editable in the top bar. */
  title: string;

  bricks: Map<string, Brick>;
  /** Every occupied cell → brickId. Multi-layer bricks register one entry per plate-layer they span. */
  cellIndex: Map<string, string>;

  selectedShape: BrickShape;
  selectedColor: BrickColor;
  /**
   * When true, bricks placed from now on use the clear-plastic variant
   * of their colour (transmissive tinted glass). Purely an input-mode
   * flag — each brick persists its own `transparent` value.
   */
  transparentMode: boolean;
  /**
   * Symmetry axis for auto-mirrored placement. 'off' = normal, 'x' =
   * reflect across the X=0 plane (left↔right), 'z' = reflect across
   * Z=0 (front↔back). Purely an input mode — placed bricks don't know
   * they came from a mirror pair.
   */
  mirrorAxis: 'off' | 'x' | 'z';
  rotation: Rotation;
  mode: EditorMode;
  quality: Quality;
  /** Directional-light intensity multiplier (0..2). */
  lightIntensity: number;
  /** Directional-light warmth (-1 cool / blueish, 0 neutral, 1 warm / amber). */
  lightWarmth: number;
  /** IBL environment-map intensity (0..2). 0 disables reflections from the HDRI. */
  envIntensity: number;
  /**
   * Single "how glossy are the bricks" knob (0..1) — drives roughness,
   * clearcoat, and clearcoatRoughness together for both the realtime
   * and path-traced materials. 0 = fully matte ABS, 1 = wet/mirror.
   */
  brickReflectivity: number;

  // --- Post-processing effect toggles (independent of quality preset) ---
  aoEnabled: boolean;
  bloomEnabled: boolean;
  smaaEnabled: boolean;

  /** When true, scene renders via GPU path tracer (non-interactive preview). */
  renderMode: boolean;
  /** Live sample count reported by the path tracer; 0 when idle. */
  pathtracerSamples: number;
  /**
   * Max accumulation samples the pathtracer targets before it stops.
   * Higher = cleaner but slower to converge; 32 is a solid default for
   * this scene scale. User-adjustable via a slider next to the render
   * button; range 1–128.
   */
  pathtracerMaxSamples: number;
  /** When true, the bilateral denoise pass runs after convergence. */
  denoiseEnabled: boolean;
  /** When true, placing a brick plays the synthesized click. */
  placementSoundEnabled: boolean;
  /** When true, rotating the camera plays the filtered-noise whoosh. */
  wooshSoundEnabled: boolean;
  /** Master audio mute — silences every sound the app makes. */
  audioMuted: boolean;
  /**
   * When true, the WebGL canvas stops rendering after 30s of no user
   * input — the last frame stays visible on screen, GPU goes idle.
   * Off by default on rooms where peer edits are frequent and the
   * user wants live updates without re-interacting.
   */
  idlePauseEnabled: boolean;

  // --- Multiplayer / room state ---
  /** Current room id when connected; null for solo editing. */
  roomId: string | null;
  /** Connection phase for the UI (status pill, disable writes on error). */
  roomStatus: 'idle' | 'connecting' | 'connected' | 'error';
  /** True when the joined room requires a password. Drives the lock icon UI. */
  roomHasPassword: boolean;
  /**
   * Server-side timestamp of the last password change; diffed against the
   * server UPDATE stream to detect password rotations (which kick everyone
   * except the caller). Opaque ISO string — we compare equality only.
   */
  roomPasswordSetAt: string | null;
  /**
   * When true, the next store mutation is being applied from an inbound
   * realtime event — the room-sync outbound wrapper should skip it to avoid
   * echoing the change back to the server.
   */
  isRemoteApplying: boolean;
  /** Extra layers added on top of the raycast-derived target gy. */
  layerOffset: number;
  /**
   * Horizontal nudge applied on top of the raycast-derived gx/gz. Driven by
   * the arrow keys while a piece is held under the cursor — lets the user
   * fine-tune placement without jiggling the mouse. Resets to (0,0) on any
   * pointer move, after a successful place, and when leaving build mode.
   */
  placementOffset: { gx: number; gz: number };
  /** LRU of recently-selected shapes; keys 1..9 map to this array. */
  recentShapes: BrickShape[];
  /** Current baseplate extent in grid coords (auto-grows as bricks reach the edge). */
  baseplateBounds: BaseplateBounds;

  addBrick: (input: PlacementInput) => string | null;
  /** Re-insert a brick with its original id (undo/redo path). Returns true on success. */
  restoreBrick: (brick: Brick) => boolean;
  removeBrickById: (id: string) => boolean;

  setTitle: (title: string) => void;
  setShape: (shape: BrickShape) => void;
  setColor: (color: BrickColor) => void;
  setTransparentMode: (b: boolean) => void;
  setMirrorAxis: (a: EditorState['mirrorAxis']) => void;
  setMode: (mode: EditorMode) => void;
  setQuality: (q: Quality) => void;
  setLightIntensity: (n: number) => void;
  setLightWarmth: (n: number) => void;
  setEnvIntensity: (n: number) => void;
  setBrickReflectivity: (n: number) => void;
  setAoEnabled: (b: boolean) => void;
  setBloomEnabled: (b: boolean) => void;
  setSmaaEnabled: (b: boolean) => void;
  setRenderMode: (b: boolean) => void;
  setPathtracerSamples: (n: number) => void;
  setPathtracerMaxSamples: (n: number) => void;
  setDenoiseEnabled: (b: boolean) => void;
  setPlacementSoundEnabled: (b: boolean) => void;
  setWooshSoundEnabled: (b: boolean) => void;
  setAudioMuted: (b: boolean) => void;
  setIdlePauseEnabled: (b: boolean) => void;
  setRoomId: (id: string | null) => void;
  setRoomStatus: (s: EditorState['roomStatus']) => void;
  setRoomPasswordState: (hasPassword: boolean, passwordSetAt: string | null) => void;
  /** Run a mutation with isRemoteApplying=true so the outbound sync wrapper skips it. */
  withRemoteApply: <T>(fn: () => T) => T;
  rotateCursor: () => void;
  bumpLayer: (delta: number) => void;
  resetLayer: () => void;
  bumpPlacementOffset: (dgx: number, dgz: number) => void;
  resetPlacementOffset: () => void;
  /** Expand the baseplate if a placement would land within the edge margin. */
  expandBaseplateFor: (brick: Brick) => void;

  /** Flatten current scene to a serialisable Creation (for save/share/export). */
  serializeCreation: () => Creation;
  /** Replace the entire scene with a loaded Creation. Clears layer offset. */
  loadCreation: (creation: Creation) => void;

  /** True iff every cell in the prospective footprint is free and gy >= 0. */
  canPlaceAt: (
    shape: BrickShape,
    gx: number,
    gy: number,
    gz: number,
    rotation: Rotation,
  ) => boolean;
};

export const useEditorStore = create<EditorState>((set, get) => ({
  title: 'Untitled Creation',

  bricks: new Map(),
  cellIndex: new Map(),

  selectedShape: 'brick_2x4',
  selectedColor: 'red',
  transparentMode: false,
  mirrorAxis: 'off',
  rotation: 0,
  mode: 'build',
  quality: 'high',
  lightIntensity: 1.0,
  lightWarmth: 0,
  // Studio HDRI from pmndrs/assets is quite bright; 0.3 gives a plausible
  // plastic highlight without washing out direct shading.
  envIntensity: 0.3,
  // Mid-gloss ABS by default — satin clearcoat, not quite wet.
  brickReflectivity: 0.6,
  // Effect defaults seeded from the High preset to match initial `quality: 'high'`.
  aoEnabled: EFFECT_DEFAULTS.high.ao,
  bloomEnabled: EFFECT_DEFAULTS.high.bloom,
  smaaEnabled: EFFECT_DEFAULTS.high.smaa,
  renderMode: false,
  pathtracerSamples: 0,
  pathtracerMaxSamples: 32,
  denoiseEnabled: true,
  placementSoundEnabled: true,
  wooshSoundEnabled: true,
  audioMuted: false,
  idlePauseEnabled: true,
  roomId: null,
  roomStatus: 'idle',
  roomHasPassword: false,
  roomPasswordSetAt: null,
  isRemoteApplying: false,
  layerOffset: 0,
  placementOffset: { gx: 0, gz: 0 },
  recentShapes: ['brick_2x4'],
  baseplateBounds: {
    minGx: -INITIAL_HALF,
    maxGx: INITIAL_HALF,
    minGz: -INITIAL_HALF,
    maxGz: INITIAL_HALF,
  },

  canPlaceAt: (shape, gx, gy, gz, rotation) => {
    if (gy < 0) return false;
    const { cellIndex } = get();
    const cells = footprintCells(shape, gx, gy, gz, rotation);
    for (const c of cells) {
      if (cellIndex.has(cellKey(c.gx, c.gy, c.gz))) return false;
    }
    return true;
  },

  addBrick: (input) => {
    if (!get().canPlaceAt(input.shape, input.gx, input.gy, input.gz, input.rotation)) {
      return null;
    }
    const { bricks, cellIndex } = get();
    const cells = footprintCells(input.shape, input.gx, input.gy, input.gz, input.rotation);
    const id = nextId();
    const brick: Brick = { id, ...input };
    const nextBricks = new Map(bricks);
    nextBricks.set(id, brick);
    const nextIndex = new Map(cellIndex);
    for (const c of cells) nextIndex.set(cellKey(c.gx, c.gy, c.gz), id);
    set({ bricks: nextBricks, cellIndex: nextIndex });
    return id;
  },

  restoreBrick: (brick) => {
    const { bricks, cellIndex } = get();
    if (bricks.has(brick.id)) return false;
    const cells = footprintCells(brick.shape, brick.gx, brick.gy, brick.gz, brick.rotation);
    for (const c of cells) {
      if (cellIndex.has(cellKey(c.gx, c.gy, c.gz))) return false;
    }
    const nextBricks = new Map(bricks);
    nextBricks.set(brick.id, brick);
    const nextIndex = new Map(cellIndex);
    for (const c of cells) nextIndex.set(cellKey(c.gx, c.gy, c.gz), brick.id);
    set({ bricks: nextBricks, cellIndex: nextIndex });
    return true;
  },

  removeBrickById: (id) => {
    const { bricks, cellIndex } = get();
    const brick = bricks.get(id);
    if (!brick) return false;
    const cells = footprintCells(brick.shape, brick.gx, brick.gy, brick.gz, brick.rotation);
    const nextBricks = new Map(bricks);
    nextBricks.delete(id);
    const nextIndex = new Map(cellIndex);
    for (const c of cells) nextIndex.delete(cellKey(c.gx, c.gy, c.gz));
    set({ bricks: nextBricks, cellIndex: nextIndex });
    return true;
  },

  setTitle: (title) => set({ title }),
  setShape: (shape) =>
    set((s) => ({
      selectedShape: shape,
      recentShapes: [shape, ...s.recentShapes.filter((x) => x !== shape)].slice(0, HOTBAR_SIZE),
    })),
  setColor: (color) => set({ selectedColor: color }),
  setTransparentMode: (b) => set({ transparentMode: b }),
  setMirrorAxis: (a) => set({ mirrorAxis: a }),
  setMode: (mode) => set({ mode }),
  setQuality: (quality) => {
    // Quality switch re-seeds the effect toggles from the preset so Low really
    // feels Low and Ultra really feels Ultra; explicit per-effect overrides
    // survive only within the same quality level.
    const defaults = EFFECT_DEFAULTS[quality];
    set({
      quality,
      aoEnabled: defaults.ao,
      bloomEnabled: defaults.bloom,
      smaaEnabled: defaults.smaa,
    });
  },
  setLightIntensity: (n) => set({ lightIntensity: Math.max(0, Math.min(2, n)) }),
  setLightWarmth: (n) => set({ lightWarmth: Math.max(-1, Math.min(1, n)) }),
  setEnvIntensity: (n) => set({ envIntensity: Math.max(0, Math.min(2, n)) }),
  setBrickReflectivity: (n) => set({ brickReflectivity: Math.max(0, Math.min(1, n)) }),
  setAoEnabled: (b) => set({ aoEnabled: b }),
  setBloomEnabled: (b) => set({ bloomEnabled: b }),
  setSmaaEnabled: (b) => set({ smaaEnabled: b }),
  setRenderMode: (b) => set({ renderMode: b, pathtracerSamples: 0 }),
  setPathtracerSamples: (n) => set({ pathtracerSamples: n }),
  setPathtracerMaxSamples: (n) =>
    set({ pathtracerMaxSamples: Math.max(1, Math.min(128, Math.round(n))) }),
  setDenoiseEnabled: (b) => set({ denoiseEnabled: b }),
  setPlacementSoundEnabled: (b) => {
    set({ placementSoundEnabled: b });
    setPlacementSoundEnabled(b);
  },
  setWooshSoundEnabled: (b) => set({ wooshSoundEnabled: b }),
  setAudioMuted: (b) => set({ audioMuted: b }),
  setIdlePauseEnabled: (b) => set({ idlePauseEnabled: b }),
  setRoomId: (roomId) => set({ roomId }),
  setRoomStatus: (roomStatus) => set({ roomStatus }),
  setRoomPasswordState: (hasPassword, passwordSetAt) =>
    set({ roomHasPassword: hasPassword, roomPasswordSetAt: passwordSetAt }),
  withRemoteApply: (fn) => {
    set({ isRemoteApplying: true });
    try {
      return fn();
    } finally {
      set({ isRemoteApplying: false });
    }
  },
  rotateCursor: () => set((s) => ({ rotation: ((s.rotation + 1) % 4) as Rotation })),
  bumpLayer: (delta) => set((s) => ({ layerOffset: Math.max(0, s.layerOffset + delta) })),
  resetLayer: () => set({ layerOffset: 0 }),
  bumpPlacementOffset: (dgx, dgz) =>
    set((s) => ({
      placementOffset: { gx: s.placementOffset.gx + dgx, gz: s.placementOffset.gz + dgz },
    })),
  resetPlacementOffset: () =>
    set((s) =>
      s.placementOffset.gx === 0 && s.placementOffset.gz === 0
        ? s
        : { placementOffset: { gx: 0, gz: 0 } },
    ),

  serializeCreation: () => {
    const { title, bricks, baseplateBounds } = get();
    return {
      version: CURRENT_SCHEMA_VERSION,
      title,
      createdAt: Date.now(),
      bricks: Array.from(bricks.values()),
      baseplateBounds,
    };
  },

  loadCreation: (creation) => {
    const nextBricks = new Map<string, Brick>();
    const nextIndex = new Map<string, string>();
    for (const b of creation.bricks) {
      nextBricks.set(b.id, b);
      const cells = footprintCells(b.shape, b.gx, b.gy, b.gz, b.rotation);
      for (const c of cells) nextIndex.set(cellKey(c.gx, c.gy, c.gz), b.id);
    }
    set({
      title: creation.title,
      bricks: nextBricks,
      cellIndex: nextIndex,
      baseplateBounds: creation.baseplateBounds,
      layerOffset: 0,
    });
  },

  expandBaseplateFor: (brick) => {
    const { baseplateBounds } = get();
    const cells = footprintCells(brick.shape, brick.gx, brick.gy, brick.gz, brick.rotation);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const c of cells) {
      if (c.gx < minX) minX = c.gx;
      if (c.gx > maxX) maxX = c.gx;
      if (c.gz < minZ) minZ = c.gz;
      if (c.gz > maxZ) maxZ = c.gz;
    }
    let { minGx, maxGx, minGz, maxGz } = baseplateBounds;
    let changed = false;
    while (minX < minGx + EDGE_MARGIN_STUDS) {
      minGx -= EXPANSION_CHUNK_STUDS;
      changed = true;
    }
    while (maxX >= maxGx - EDGE_MARGIN_STUDS) {
      maxGx += EXPANSION_CHUNK_STUDS;
      changed = true;
    }
    while (minZ < minGz + EDGE_MARGIN_STUDS) {
      minGz -= EXPANSION_CHUNK_STUDS;
      changed = true;
    }
    while (maxZ >= maxGz - EDGE_MARGIN_STUDS) {
      maxGz += EXPANSION_CHUNK_STUDS;
      changed = true;
    }
    if (changed) set({ baseplateBounds: { minGx, maxGx, minGz, maxGz } });
  },
}));
