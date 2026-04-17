import type { WebGLRenderTarget } from 'three';

/**
 * Module-level handle to the live GPU pathtracer so code outside the
 * <Pathtracer> React context (CaptureBridge, specifically) can tell whether
 * render mode is active and, if so, grab the accumulated framebuffer for
 * PNG export.
 *
 * Populated by PathtracerBusBridge which sits inside <Pathtracer> and
 * thus has access to usePathtracer(). Cleared on unmount (i.e. when the
 * user exits render mode).
 */

export type PathtracerHandle = {
  samples: number;
  target: WebGLRenderTarget;
};

let active: PathtracerHandle | null = null;

export function setActivePathtracer(handle: PathtracerHandle | null): void {
  active = handle;
}

export function getActivePathtracer(): PathtracerHandle | null {
  return active;
}
