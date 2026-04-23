/**
 * Shared platform heuristics for the path-tracer subtree. UA sniffing
 * is pragmatic — a proper WebGL compile-time probe would be cleaner
 * but a lot more code for a hobby feature, and the only branches that
 * depend on it are mobile shader-budget workarounds and the tile
 * count in <Pathtracer>.
 */
export const IS_MOBILE =
  typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
