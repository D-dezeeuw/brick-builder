/**
 * One-shot WebGL capability probe. Runs on first access and caches the result.
 * Used by EffectsSection to gate the path-traced render toggle — on devices
 * without float-texture support (many older iOS GPUs, some Android Mali
 * chips), the GPU path tracer falls back to a black/broken render, so we'd
 * rather disable the option up front than let users hit a dead end.
 */

export type PathTraceSupport = { supported: true } | { supported: false; reason: string };

let cached: PathTraceSupport | null = null;

export function getPathTraceSupport(): PathTraceSupport {
  if (cached) return cached;
  cached = probe();
  return cached;
}

function probe(): PathTraceSupport {
  if (typeof document === 'undefined') {
    return { supported: false, reason: 'No DOM available' };
  }
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
  if (!gl) {
    return { supported: false, reason: 'WebGL2 unavailable on this device' };
  }
  try {
    // Three-gpu-pathtracer requires float render targets for its
    // accumulation buffer and linear-filtered float textures for IBL.
    const colorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    const floatLinear = gl.getExtension('OES_texture_float_linear');
    if (!colorBufferFloat || !floatLinear) {
      return {
        supported: false,
        reason: 'GPU lacks float-texture support (common on older mobile GPUs)',
      };
    }
    return { supported: true };
  } finally {
    // Browsers cap concurrent WebGL2 contexts (Safari/iOS as low as 8).
    // Leaving the probe's context alive could evict the live R3F Canvas
    // context the next time anything else asks for a context — visible
    // as the scene going black on settings-modal open. Explicitly lose
    // it so this stays a one-time cost regardless of when probe() is
    // first called relative to Canvas mount.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
