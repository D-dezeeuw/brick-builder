import { ensureAudioCtx, getNoiseBuffer } from './audio';
import { useEditorStore } from './editorStore';

/**
 * Camera-rotation "woosh". A continuous filtered-noise voice whose
 * gain + bandpass cutoff are driven by the camera's angular velocity.
 * Still camera → silent; fast flick → breathy hiss that tracks the
 * motion and tails off with OrbitControls' damping.
 *
 * Design choices:
 *   - Looped noise buffer, not re-triggered per frame. One
 *     BufferSource runs for the whole session; we only modulate
 *     filter + gain. Starts on first non-zero speed so we don't
 *     allocate WebAudio until the user actually rotates.
 *   - `setTargetAtTime` with a 50 ms constant on both gain and
 *     filter freq so parameter updates sound like a smooth breath,
 *     not stepped. Ears are sensitive to zipper noise otherwise.
 *   - Respect both `wooshSoundEnabled` and the master `audioMuted`
 *     from the store on every call. A mute mid-whoosh ramps gain
 *     back to 0 instead of hard-cutting.
 *
 * The one global voice is cheap (< 0.1 % CPU at silent). We don't
 * stop/start per gesture; it stays alive for the session.
 */

let source: AudioBufferSourceNode | null = null;
let filter: BiquadFilterNode | null = null;
let gainNode: GainNode | null = null;

const MAX_RAD_PER_SEC = 4; // flick speed — anything faster saturates
const MAX_GAIN = 0.08; // 33% lower peak than before — less shouty
const MIN_CUTOFF = 350; // Hz — barely-moving rumble
const MAX_CUTOFF = 2200; // Hz — fast-flick brightness
const SMOOTH_CONST = 0.07; // seconds for param smoothing (τ) — longer tail
/**
 * Power curve applied to normalised velocity before it hits gain.
 * Higher exponents make slow rotations quieter while preserving full
 * punch on flicks, widening the perceived dynamic range. 1 = linear,
 * 2 = aggressively quiet at low speed. 1.7 is a "present but not
 * chatty" midpoint.
 */
const GAIN_CURVE = 1.7;

function ensureGraph(): boolean {
  if (source) return true;
  const ctx = ensureAudioCtx();
  if (!ctx) return false;
  if (ctx.state === 'suspended') void ctx.resume();

  // Needs a multi-second buffer so the loop isn't perceptibly
  // periodic (1 s is short enough to hear pitch artefacts as a hum).
  const noise = getNoiseBuffer(ctx, 4);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.8;
  bp.frequency.value = MIN_CUTOFF;

  const gn = ctx.createGain();
  gn.gain.value = 0;

  src.connect(bp).connect(gn).connect(ctx.destination);
  src.start();

  source = src;
  filter = bp;
  gainNode = gn;
  return true;
}

/**
 * Update the woosh to reflect the camera's current angular velocity
 * (in radians / second). Called from Scene.tsx's useFrame.
 */
export function setWooshSpeed(radPerSec: number): void {
  const store = useEditorStore.getState();
  const silenced = store.audioMuted || !store.wooshSoundEnabled;

  if (silenced) {
    if (gainNode) {
      const ctx = ensureAudioCtx();
      if (ctx) gainNode.gain.setTargetAtTime(0, ctx.currentTime, SMOOTH_CONST);
    }
    return;
  }

  if (!ensureGraph()) return;
  const ctx = ensureAudioCtx();
  if (!ctx || !filter || !gainNode) return;

  const n = Math.max(0, Math.min(1, radPerSec / MAX_RAD_PER_SEC));
  // Below this threshold we want absolute silence — otherwise tiny
  // drifts from damping would keep a faint hiss going indefinitely.
  const gainTarget = n < 0.04 ? 0 : Math.pow(n, GAIN_CURVE) * MAX_GAIN;
  const cutoffTarget = MIN_CUTOFF + n * (MAX_CUTOFF - MIN_CUTOFF);

  const t = ctx.currentTime;
  gainNode.gain.setTargetAtTime(gainTarget, t, SMOOTH_CONST);
  filter.frequency.setTargetAtTime(cutoffTarget, t, SMOOTH_CONST);
}
