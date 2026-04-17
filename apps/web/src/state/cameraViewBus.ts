/**
 * Module-level bus for camera-view interactions between the UI (outside
 * the Canvas) and a driver component mounted inside the Canvas (which
 * has useThree access to the camera + OrbitControls). Mirrors the
 * existing captureBus / pathtracerBus pattern so all bridge wiring
 * looks the same.
 *
 * - `requestCaptureCurrentView()` — UI asks "what's the camera looking
 *   at right now?"; driver reads camera.position + controls.target and
 *   resolves.
 * - `requestApplyView(view)` — UI asks to tween to a saved view;
 *   driver interpolates over ~350ms.
 */

import type { SavedView } from '@brick/shared';

type Vec3 = [number, number, number];

type CaptureResolver = (snap: { position: Vec3; target: Vec3 } | null) => void;

let pendingCapture: CaptureResolver | null = null;
let pendingApply: SavedView | null = null;

export function requestCaptureCurrentView(): Promise<{ position: Vec3; target: Vec3 } | null> {
  return new Promise((resolve) => {
    if (pendingCapture) pendingCapture(null);
    pendingCapture = resolve;
  });
}

export function claimPendingCapture(): CaptureResolver | null {
  const r = pendingCapture;
  pendingCapture = null;
  return r;
}

export function requestApplyView(view: SavedView): void {
  pendingApply = view;
}

export function claimPendingApply(): SavedView | null {
  const v = pendingApply;
  pendingApply = null;
  return v;
}
