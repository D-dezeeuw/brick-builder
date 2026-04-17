import type { Texture } from 'three';

/**
 * Module-level pointer to the post-convergence denoise texture. Written
 * by PathtracerDenoise once the bilateral pass has run at least once;
 * read by CaptureBridge so a render-mode screenshot saves the cleaned
 * image rather than the raw speckled accumulator. Null means "no
 * denoise result available yet" — either pre-convergence or path-trace
 * mode is off.
 */

let active: Texture | null = null;

export function setDenoiseTexture(texture: Texture | null): void {
  active = texture;
}

export function getDenoiseTexture(): Texture | null {
  return active;
}
