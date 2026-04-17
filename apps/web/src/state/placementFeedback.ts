/**
 * Placement feedback: a synthesized "tok" sound + the animation state
 * that drives a brick dropping into place over ~180ms.
 *
 * No audio assets — the click is a descending triangle-wave chirp
 * (900Hz → 400Hz over 80ms) with an exponential amplitude decay.
 * Tiny, plastic-y, and lets us ship the feature without adding a
 * binary to the repo or a CDN dependency.
 */

const ANIMATION_DURATION_MS = 180;
const placements = new Map<string, number>();

export function markPlaced(id: string): void {
  placements.set(id, performance.now());
}

/**
 * Returns animation progress in [0, 1] or null if this id isn't
 * animating. When progress crosses 1 we delete the entry *but still
 * return 1* on that call, giving callers one final frame to write the
 * resting-state matrix before the next getProgress returns null.
 */
export function getPlacementProgress(id: string, now: number): number | null {
  const start = placements.get(id);
  if (start === undefined) return null;
  const p = (now - start) / ANIMATION_DURATION_MS;
  if (p >= 1) {
    placements.delete(id);
    return 1;
  }
  return p;
}

export function hasActivePlacementAnimations(): boolean {
  return placements.size > 0;
}

export function clearPlacementAnimations(): void {
  placements.clear();
}

// ----- Sound -----

let audioCtx: AudioContext | null = null;
let soundEnabled = true;

export function setPlacementSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

function ensureCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  } catch {
    return null;
  }
  return audioCtx;
}

export function playPlacementSound(): void {
  if (!soundEnabled) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  // Browsers often suspend AudioContext until user interaction —
  // placement itself *is* a user gesture, so resume is permitted.
  if (ctx.state === 'suspended') void ctx.resume();

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(900, now);
  osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.16);
}
