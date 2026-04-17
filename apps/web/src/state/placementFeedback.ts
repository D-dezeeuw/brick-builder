/**
 * Placement feedback: a procedurally synthesized hollow-plastic click
 * + the animation state that drives a brick dropping into place over
 * ~180ms.
 *
 * The click is two parallel voices summed at play time — no audio
 * assets:
 *   1) Noise burst, bandpassed around ~2.5 kHz — the mechanical
 *      transient ("tack") of the impact. ~25 ms decay.
 *   2) Sine body at ~1.8 kHz sweeping down to ~1.4 kHz — the hollow
 *      resonance of the brick shell. ~60 ms decay.
 *
 * Each play jitters a handful of the parameters (centre frequency,
 * sweep, gain, duration) inside ±10% of nominal so repeated clicks
 * don't feel mechanical. That's the payoff for procedural synthesis:
 * no sample banks to rotate through, and each click is uniquely tuned.
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

/**
 * 1s of white noise, regenerated once per AudioContext and reused
 * for every click's transient. Cheaper than creating new buffers.
 */
let noiseBuffer: AudioBuffer | null = null;
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const frames = ctx.sampleRate; // 1 second
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

/** Uniform random in [1 - amount, 1 + amount]. */
function jitter(amount: number): number {
  return 1 + (Math.random() * 2 - 1) * amount;
}

export function playPlacementSound(): void {
  if (!soundEnabled) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  // Browsers often suspend AudioContext until user interaction —
  // placement itself *is* a user gesture, so resume is permitted.
  if (ctx.state === 'suspended') void ctx.resume();

  const now = ctx.currentTime;
  const dest = ctx.destination;

  // Per-click randomness. ±8% on pitch reads as "different bricks
  // made of the same plastic" rather than "different instruments".
  // Anything wider starts to sound like a slide whistle.
  const bodyFreq = 1800 * jitter(0.08);
  const bodyEndFreq = bodyFreq * 0.78; // proportional downward sweep
  const bodyDecay = 0.06 * jitter(0.15);
  const tackFreq = 2500 * jitter(0.05);
  const tackDecay = 0.025 * jitter(0.2);
  const masterGain = jitter(0.1);

  // --- Voice 1: noise transient (the "tack") ---
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  // Random offset into the noise buffer gives each click a different
  // micro-texture even though the buffer itself is recycled.
  noise.loop = false;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = tackFreq;
  noiseFilter.Q.value = 1.5;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.28 * masterGain, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + tackDecay);
  noise.connect(noiseFilter).connect(noiseGain).connect(dest);
  const offset = Math.random() * 0.9; // pick a random slice of the 1s buffer
  noise.start(now, offset, tackDecay + 0.01);

  // --- Voice 2: sine body resonance (the "hollow") ---
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(bodyFreq, now);
  body.frequency.exponentialRampToValueAtTime(bodyEndFreq, now + bodyDecay);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0, now);
  bodyGain.gain.linearRampToValueAtTime(0.16 * masterGain, now + 0.003);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + bodyDecay);
  body.connect(bodyGain).connect(dest);
  body.start(now);
  body.stop(now + bodyDecay + 0.01);
}
