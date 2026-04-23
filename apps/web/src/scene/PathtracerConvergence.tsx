import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { usePathtracer } from '@react-three/gpu-pathtracer';
import { type PerspectiveCamera, type WebGLRenderTarget } from 'three';
import { useEditorStore } from '../state/editorStore';
import {
  blitTextureToTarget,
  computeCacheKey,
  createCacheTarget,
  getCached,
  putCached,
} from './pathtraceCache';

// Convergence detection for the path tracer. Each check reads a
// REGION_SIZE² float window from the centre of pathtracer.target and
// computes an RMS delta against the previous read; when the delta
// stays below EPSILON for STABLE_CHECKS consecutive reads we consider
// the image converged and clamp the effective sample cap to the
// current sample count. Users stop guessing max-samples — the tracer
// stops as soon as adding more samples stops changing the picture.
//
// Trade-offs chosen:
// - Centre window, not full downsample: readRenderTargetPixels of a
//   128×128×float region is ~256KB and skips the render-pass +
//   shader material we'd need for a proper downsample. Convergence
//   on the subject is what the user cares about; corner flicker
//   (e.g. low-sampled caustics on an edge brick) isn't.
// - Check cadence in SAMPLES, not frames: the wrapper emits one
//   sample per rAF, but renderDelay + tile spreading mean wall-clock
//   spacing varies. Sample-based cadence is monotonic and stable.
// - Reset detection is implicit: pathtracer.samples decreasing means
//   the tracer reset (camera moved, scene mutated, prop changed). We
//   clear local state + clear earlyStopAt in the store so the next
//   convergence is measured fresh.
const REGION_SIZE = 128;
const CHECK_EVERY_SAMPLES = 4;
const MIN_SAMPLES_BEFORE_CHECK = 8;
const EPSILON = 1e-3;
const STABLE_CHECKS_REQUIRED = 2;

export function PathtracerConvergence() {
  const { pathtracer } = usePathtracer();
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  const prevBuf = useRef(new Float32Array(REGION_SIZE * REGION_SIZE * 4));
  const curBuf = useRef(new Float32Array(REGION_SIZE * REGION_SIZE * 4));
  const lastSamples = useRef(0);
  const lastCheckedAt = useRef(-1);
  const stableCount = useRef(0);
  const hasPrev = useRef(false);
  const snapshotTaken = useRef(false);

  useFrame(() => {
    const samples = pathtracer.samples ?? 0;

    // PT reset (samples went down): drop cached state and let the
    // tracer run until we detect the next convergence.
    if (samples < lastSamples.current) {
      stableCount.current = 0;
      hasPrev.current = false;
      lastCheckedAt.current = -1;
      snapshotTaken.current = false;
      if (useEditorStore.getState().pathtracerEarlyStopAt !== null) {
        useEditorStore.getState().setPathtracerEarlyStopAt(null);
      }
    }
    lastSamples.current = samples;

    if (samples < MIN_SAMPLES_BEFORE_CHECK) return;
    if (samples % CHECK_EVERY_SAMPLES !== 0) return;
    if (samples === lastCheckedAt.current) return;

    const target = pathtracer.target as { width: number; height: number } | undefined;
    if (!target) return;
    const x = Math.floor((target.width - REGION_SIZE) / 2);
    const y = Math.floor((target.height - REGION_SIZE) / 2);
    if (x < 0 || y < 0) return;

    gl.readRenderTargetPixels(
      pathtracer.target as Parameters<typeof gl.readRenderTargetPixels>[0],
      x,
      y,
      REGION_SIZE,
      REGION_SIZE,
      curBuf.current,
    );
    lastCheckedAt.current = samples;

    if (!hasPrev.current) {
      prevBuf.current.set(curBuf.current);
      hasPrev.current = true;
      return;
    }

    let sumSq = 0;
    const len = curBuf.current.length;
    for (let i = 0; i < len; i++) {
      const d = curBuf.current[i] - prevBuf.current[i];
      sumSq += d * d;
    }
    const rms = Math.sqrt(sumSq / len);
    prevBuf.current.set(curBuf.current);

    if (rms < EPSILON) {
      stableCount.current++;
      if (stableCount.current >= STABLE_CHECKS_REQUIRED) {
        useEditorStore.getState().setPathtracerEarlyStopAt(samples);
        // Snapshot the converged target into the pose-keyed cache
        // so re-entering PT mode (or orbiting back) skips re-sampling
        // entirely. Run this once per convergence episode — if we're
        // still stable on subsequent checks, there's nothing new to
        // save. The cache module handles LRU eviction + disposal.
        if (!snapshotTaken.current) {
          snapshotTaken.current = true;
          takeCacheSnapshot(
            pathtracer.target as WebGLRenderTarget,
            gl,
            camera as PerspectiveCamera,
            useEditorStore.getState().pathtracerResolutionScale,
          );
        }
      }
    } else {
      stableCount.current = 0;
    }
  });

  return null;
}

function takeCacheSnapshot(
  ptTarget: WebGLRenderTarget,
  gl: Parameters<typeof blitTextureToTarget>[0],
  camera: PerspectiveCamera,
  resolutionScale: number,
): void {
  const key = computeCacheKey(camera, resolutionScale);
  if (getCached(key)) return; // already cached for this exact key
  const rt = createCacheTarget(ptTarget.width, ptTarget.height);
  blitTextureToTarget(gl, ptTarget.texture, rt);
  putCached(key, rt);
}
