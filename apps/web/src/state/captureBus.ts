/**
 * Module-level bus used to hand a PNG-capture request from the UI (outside
 * the Canvas) to a bridge component mounted inside the Canvas (which has
 * useFrame access to the renderer + scene + camera). Avoids the need for
 * preserveDrawingBuffer:true on the WebGL context, which otherwise combines
 * badly with N8AO's normal-pass blit.
 */
type Waiter = (blob: Blob | null) => void;

let waiter: Waiter | null = null;

/**
 * Request a PNG capture. Returns a promise that resolves when the bridge
 * inside the Canvas completes the render-to-target. Only one capture is
 * in-flight at a time — a second request while one is pending cancels
 * the first (resolves it with null).
 */
export function requestPngCapture(): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => {
    if (waiter) waiter(null);
    waiter = resolve;
  });
}

/** Take the pending request (if any) and hand it off to the bridge. */
export function claimPendingCapture(): Waiter | null {
  const w = waiter;
  waiter = null;
  return w;
}
