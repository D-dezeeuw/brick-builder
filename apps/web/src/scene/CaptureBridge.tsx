import { useFrame } from '@react-three/fiber';
import {
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { claimPendingCapture } from '../state/captureBus';
import { getDenoiseTexture } from '../state/denoiseBus';
import { getActivePathtracer } from '../state/pathtracerBus';

/**
 * Watches for PNG-capture requests and services them with a render-to-target
 * pass against a fresh WebGLRenderTarget — sidesteps the `preserveDrawingBuffer`
 * requirement that would otherwise be needed to read the swap-chain buffer
 * from a UI click.
 *
 * Render mode: when the GPU path tracer is active and has accumulated at
 * least one sample, we blit its HDR target through the renderer's tone
 * mapper into an LDR target and read that. This means a PNG saved during
 * render mode captures the path-traced image, not a rasterized re-render.
 * Falls back to rasterization when the tracer isn't ready (idle or zero
 * samples).
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
  const size = gl.getDrawingBufferSize(new Vector2());
  const width = Math.max(1, Math.round(size.x));
  const height = Math.max(1, Math.round(size.y));

  // Prefer, in order:
  //   1. The denoised target — already LDR sRGB, fastest readback, matches
  //      what the user is looking at post-convergence.
  //   2. The raw PT accumulator — HDR, needs a tone-map blit.
  //   3. The rasterized scene — when not in render mode at all.
  const denoise = getDenoiseTexture();
  const pathtracer = getActivePathtracer();
  let pixels: Uint8Array;
  if (denoise) {
    pixels = readDenoiseTexture(gl, denoise, width, height);
  } else if (pathtracer && pathtracer.samples > 0) {
    pixels = readTonemapped(gl, pathtracer.target.texture, width, height);
  } else {
    pixels = rasterizeToPixels(gl, scene, camera, width, height);
  }

  return pixelsToPngBlob(pixels, width, height);
}

/**
 * Identity blit from the denoise target. The source is already tone-
 * mapped + sRGB-encoded, so we just copy it to an LDR target and read
 * the bytes — no extra tone mapping.
 */
function readDenoiseTexture(
  gl: WebGLRenderer,
  source: Texture,
  width: number,
  height: number,
): Uint8Array {
  const rig = getBlitRig();
  rig.material.toneMapped = false;
  rig.material.map = source;
  rig.material.needsUpdate = true;
  const target = makeSrgbTarget(width, height);
  const prev = gl.getRenderTarget();
  try {
    gl.setRenderTarget(target);
    gl.render(rig.scene, rig.camera);
    const pixels = new Uint8Array(width * height * 4);
    gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    return pixels;
  } finally {
    gl.setRenderTarget(prev);
    rig.material.map = null;
    rig.material.toneMapped = true;
    target.dispose();
  }
}

function rasterizeToPixels(
  gl: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  width: number,
  height: number,
): Uint8Array {
  const target = makeSrgbTarget(width, height);
  const prev = gl.getRenderTarget();
  try {
    gl.setRenderTarget(target);
    gl.render(scene, camera);
    const pixels = new Uint8Array(width * height * 4);
    gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    return pixels;
  } finally {
    gl.setRenderTarget(prev);
    target.dispose();
  }
}

/**
 * New WebGLRenderTargets default to NoColorSpace. Rendering into one
 * writes linear values — which when saved as 8-bit PNG come out
 * noticeably dark and desaturated vs. what the user sees on the sRGB
 * canvas. Flagging the target's texture as SRGBColorSpace makes three
 * apply the sRGB encode on the final fragment write, matching the
 * on-screen result byte-for-byte.
 */
function makeSrgbTarget(width: number, height: number): WebGLRenderTarget {
  const target = new WebGLRenderTarget(width, height);
  target.texture.colorSpace = SRGBColorSpace;
  return target;
}

/**
 * Renders a full-screen quad sampling `source` to an LDR render target.
 * Because the renderer has ACESFilmic tone mapping + sRGB output
 * configured, the HDR floats coming out of the path tracer get properly
 * tone-mapped and gamma-corrected during the write, yielding pixels that
 * match what the user sees on screen.
 */
function readTonemapped(
  gl: WebGLRenderer,
  source: Texture,
  width: number,
  height: number,
): Uint8Array {
  const rig = getBlitRig();
  rig.material.map = source;
  rig.material.needsUpdate = true;
  const target = makeSrgbTarget(width, height);
  const prev = gl.getRenderTarget();
  try {
    gl.setRenderTarget(target);
    gl.render(rig.scene, rig.camera);
    const pixels = new Uint8Array(width * height * 4);
    gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    return pixels;
  } finally {
    gl.setRenderTarget(prev);
    rig.material.map = null;
    target.dispose();
  }
}

type BlitRig = {
  scene: Scene;
  camera: OrthographicCamera;
  material: MeshBasicMaterial;
};

let blitRig: BlitRig | null = null;

function getBlitRig(): BlitRig {
  if (blitRig) return blitRig;
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new MeshBasicMaterial({ toneMapped: true });
  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  scene.add(mesh);
  blitRig = { scene, camera, material };
  return blitRig;
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
