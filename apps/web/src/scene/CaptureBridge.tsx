import { useFrame } from '@react-three/fiber';
import {
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { claimPendingCapture } from '../state/captureBus';

/**
 * Watches for PNG-capture requests and services them with a render-to-target
 * pass against a fresh WebGLRenderTarget — sidesteps the `preserveDrawingBuffer`
 * requirement that would otherwise be needed to read the swap-chain buffer
 * from a UI click.
 *
 * Render mode caveat: the GPU pathtracer writes to the main swap chain, not
 * our offscreen target. In render mode this bridge still runs a fresh
 * rasterized render to the target — meaning exported PNGs reflect the
 * rasterized view even when the user is looking at a path-traced preview.
 * Acceptable for now; high-quality screenshots can exit render mode first.
 */
export function CaptureBridge() {
  useFrame(({ gl, scene, camera }) => {
    const waiter = claimPendingCapture();
    if (!waiter) return;
    captureToBlob(gl, scene, camera).then((blob) => waiter(blob));
  });
  return null;
}

async function captureToBlob(
  gl: WebGLRenderer,
  scene: Scene,
  camera: Camera,
): Promise<Blob | null> {
  // Match the on-screen resolution so exports look like what the user sees.
  const size = gl.getDrawingBufferSize(new Vector2());
  const width = Math.max(1, Math.round(size.x));
  const height = Math.max(1, Math.round(size.y));

  const target = new WebGLRenderTarget(width, height);
  const prev = gl.getRenderTarget();
  try {
    gl.setRenderTarget(target);
    gl.render(scene, camera);
    const pixels = new Uint8Array(width * height * 4);
    gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    return pixelsToPngBlob(pixels, width, height);
  } finally {
    gl.setRenderTarget(prev);
    target.dispose();
  }
}

async function pixelsToPngBlob(
  pixels: Uint8Array,
  width: number,
  height: number,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const imageData = ctx.createImageData(width, height);
  // WebGL reads bottom-up; 2D canvas is top-down — flip rows on copy.
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    const dstRow = y * width * 4;
    imageData.data.set(pixels.subarray(srcRow, srcRow + width * 4), dstRow);
  }
  ctx.putImageData(imageData, 0, 0);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });
}
