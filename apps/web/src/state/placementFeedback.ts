/**
 * Placement feedback: a procedurally synthesized hollow-plastic click
 * + the animation state that drives a brick dropping into place over
 * ~180ms.
 *
 * The click is two parallel voices summed at play time — no audio
 * assets:
 *   1) Noise burst, bandpassed — the mechanical transient ("tack")
 *      of the impact.
 *   2) Sine body sweeping down — the hollow resonance of the brick
 *      shell.
 *
 * Both voices are scaled by the brick's footprint volume
 * (w × d × layers). Small pieces get a higher-pitched, shorter,
 * less-hollow click; big pieces get a lower, longer, more-resonant
 * thud. Matches the intuition that physics works on real plastic:
 * a 1×1 stud click-snap has almost no body; a 2×8 brick settling
 * rings briefly.
 *
 * On top of the size-scaling we jitter every parameter ±10% per play
 * so even successive identical bricks don't produce a metronomic
 * click. That's the payoff for procedural synthesis — no sample
 * banks to rotate through, each click is uniquely tuned.
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

/**
 * Play the placement click. `size` is the brick's footprint volume
 * (`w × d × layers` in stud cells). Defaulted to 6 (≈1×2 brick) for
 * callers that don't have shape info. Expected range in our catalog:
 * 1 (1×1 plate) → 48 (2×8 brick).
 */
export function playPlacementSound(size = 6): void {
  if (!soundEnabled) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  // Browsers often suspend AudioContext until user interaction —
  // placement itself *is* a user gesture, so resume is permitted.
  if (ctx.state === 'suspended') void ctx.resume();

  const now = ctx.currentTime;
  const dest = ctx.destination;

  // Logarithmic size mapping. `norm` is ~0 for the smallest piece
  // we have (1×1 plate/tile/round) and ~1 for the biggest (2×8
  // brick). log is used because perception of size/pitch is roughly
  // logarithmic.
  const norm = Math.max(0, Math.min(1, Math.log(Math.max(1, size)) / Math.log(48)));

  // Pitch interpolator uses a `pow(norm, 0.75)` curve so the small
  // end stretches — 1×1 tiles/plates sit clearly above 1×1 bricks
  // (which have size 3, norm ≈ 0.28). With linear interpolation the
  // gap was ~280 Hz; curved it's ~380 Hz. Volume and decay stay
  // linear because those don't need the extra spread.
  const pitchCurve = Math.pow(norm, 0.75);

  // Jitter tightened from ±8-20% down to ±2-5%. The looser numbers
  // were masking the size-based pitch identity — a jittered-low
  // 1×1 plate could overlap a jittered-high 1×1 brick. Now the size
  // signal stays clean while each click still has a touch of life.
  const bodyFreq = (2500 - pitchCurve * 1000) * jitter(0.02);
  const bodyEndFreq = bodyFreq * (0.82 - norm * 0.1); // bigger = bigger pitch drop
  const bodyDecay = (0.03 + norm * 0.05) * jitter(0.04); // 30→80 ms
  const bodyGainBase = 0.08 + norm * 0.12; // small = thin, large = full body
  const tackFreq = (3200 - pitchCurve * 1000) * jitter(0.015);
  const tackDecay = (0.015 + norm * 0.02) * jitter(0.05); // 15→35 ms
  const tackGainBase = 0.32 - norm * 0.08; // small pieces lean on the tack
  const bodyAttack = 0.002 + norm * 0.003; // bigger = slightly softer onset
  const masterGain = jitter(0.025);

  // --- Voice 1: noise transient (the "tack") ---
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  noise.loop = false;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = tackFreq;
  noiseFilter.Q.value = 1.5;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(tackGainBase * masterGain, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + tackDecay);
  noise.connect(noiseFilter).connect(noiseGain).connect(dest);
  // Random slice of the 1s cached noise buffer keeps the micro-
  // texture different each click even though the buffer is reused.
  const offset = Math.random() * 0.9;
  noise.start(now, offset, tackDecay + 0.01);

  // --- Voice 2: sine body resonance (the "hollow") ---
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(bodyFreq, now);
  body.frequency.exponentialRampToValueAtTime(bodyEndFreq, now + bodyDecay);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0, now);
  bodyGain.gain.linearRampToValueAtTime(bodyGainBase * masterGain, now + bodyAttack);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + bodyDecay);
  body.connect(bodyGain).connect(dest);
  body.start(now);
  body.stop(now + bodyDecay + 0.01);
}
