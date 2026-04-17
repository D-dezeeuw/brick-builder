/**
 * Shared WebAudio primitives — lazy AudioContext + reusable white-
 * noise buffer. Kept here instead of duplicated across
 * placementFeedback and wooshSound so both sound layers share one
 * context (browsers cap the number), one noise buffer (~44kB), and
 * one lazy-init entry point.
 *
 * No React. Every import is a plain module function.
 */

let audioCtx: AudioContext | null = null;

export function ensureAudioCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  if (typeof window === 'undefined') return null;
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

let noiseBuffer: AudioBuffer | null = null;

/**
 * White-noise buffer. `seconds` is the minimum length required; we
 * keep the longest one ever requested so the woosh (which loops a
 * multi-second buffer) and the placement click (which samples random
 * slices) share a single allocation.
 */
export function getNoiseBuffer(ctx: AudioContext, seconds = 1): AudioBuffer {
  if (noiseBuffer && noiseBuffer.duration >= seconds && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }
  const frames = Math.ceil(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}
