/**
 * One-shot WebGL 2 probe. Creates a throwaway canvas and tries to get a
 * WebGL 2 context; returns true iff that succeeds. Cached at module load so
 * the detection only runs once.
 */

function detect(): boolean {
  if (typeof document === 'undefined') return true; // SSR — assume OK
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    return !!gl;
  } catch {
    return false;
  }
}

export const hasWebGL2 = detect();
