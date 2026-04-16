/**
 * Map a warmth value in [-1, 1] to an RGB color.
 *  -1 → cool blueish (~7000 K overcast sky)
 *   0 → neutral white
 *  +1 → warm amber (~2700 K incandescent)
 *
 * Linear lerp between two hand-picked endpoints — not a physically accurate
 * blackbody curve, but feels right across the slider and keeps the
 * computation branch-free.
 */

export function warmthToRgb(warmth: number): [number, number, number] {
  const w = Math.max(-1, Math.min(1, warmth));
  if (w >= 0) {
    // Toward warm amber.
    return [1.0, 1.0 - 0.18 * w, 1.0 - 0.37 * w];
  }
  const t = -w;
  // Toward cool blue.
  return [1.0 - 0.22 * t, 1.0 - 0.1 * t, 1.0];
}

/** Convert warmth to a hex string — handy for driving a CSS gradient preview. */
export function warmthToHex(warmth: number): string {
  const [r, g, b] = warmthToRgb(warmth);
  const hx = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}
