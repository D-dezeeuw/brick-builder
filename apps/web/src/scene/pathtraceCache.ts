import {
  FloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { useEditorStore } from '../state/editorStore';

/**
 * LRU cache of converged pathtrace render targets, keyed by camera
 * pose + resolution scale. Lets us re-display a previously-converged
 * image instantly when the user toggles render mode off and back on
 * at the same pose, or orbits back to a pose they've already traced.
 *
 * Scene-content invalidation: any brick, material, lighting, or
 * quality change means cached textures are no longer a faithful
 * representation. The store subscription at the bottom of this module
 * clears the whole cache on those transitions. We intentionally avoid
 * sprinkling bumpSceneRevision() calls across mutation sites — one
 * place, one policy.
 */

const CACHE_CAP = 4;

type Entry = { rt: WebGLRenderTarget; lastUsed: number };
const cache = new Map<string, Entry>();
let clock = 0;

function quant(n: number, decimals: number): number {
  const p = 10 ** decimals;
  return Math.round(n * p) / p;
}

/**
 * Cache key = quantized pose + resolution. Quantization granularity
 * is deliberately loose (1mm position, 4dp quaternion, 2dp fov) so
 * that subpixel jitter from OrbitControls damping still hits the
 * cache while a real orbit misses cleanly.
 */
export function computeCacheKey(
  camera: PerspectiveCamera,
  resolutionScale: number,
): string {
  const p = camera.position;
  const q = camera.quaternion;
  return (
    `${quant(p.x, 1)},${quant(p.y, 1)},${quant(p.z, 1)}|` +
    `${quant(q.x, 4)},${quant(q.y, 4)},${quant(q.z, 4)},${quant(q.w, 4)}|` +
    `${quant(camera.fov, 2)}|${quant(resolutionScale, 2)}`
  );
}

export function getCached(key: string): WebGLRenderTarget | null {
  const e = cache.get(key);
  if (!e) return null;
  e.lastUsed = ++clock;
  return e.rt;
}

/**
 * Look up the cached RT for a live camera pose. Convenience wrapper
 * around `computeCacheKey` + `getCached` for call sites (the capture
 * path, mainly) that have a camera + resolution scale but shouldn't
 * need to know how the key is built.
 */
export function getCachedForPose(
  camera: PerspectiveCamera,
  resolutionScale: number,
): WebGLRenderTarget | null {
  return getCached(computeCacheKey(camera, resolutionScale));
}

export function putCached(key: string, rt: WebGLRenderTarget): void {
  const existing = cache.get(key);
  if (existing) existing.rt.dispose();
  cache.set(key, { rt, lastUsed: ++clock });

  while (cache.size > CACHE_CAP) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of cache) {
      if (v.lastUsed < oldestTime) {
        oldestTime = v.lastUsed;
        oldestKey = k;
      }
    }
    if (!oldestKey) break;
    cache.get(oldestKey)?.rt.dispose();
    cache.delete(oldestKey);
  }
}

export function clearCache(): void {
  for (const e of cache.values()) e.rt.dispose();
  cache.clear();
}

/**
 * Allocate a render target matching the pathtracer's primary target
 * format (FloatType RGBA, linear). LinearSRGBColorSpace tells three
 * the texture is already linear — no inverse-sRGB decode at sample
 * time. The display component (CachedPathtraceView) applies the
 * renderer's tone mapping + output encoding to the sample.
 */
export function createCacheTarget(width: number, height: number): WebGLRenderTarget {
  const rt = new WebGLRenderTarget(width, height, {
    format: RGBAFormat,
    type: FloatType,
    magFilter: LinearFilter,
    minFilter: LinearFilter,
  });
  rt.texture.colorSpace = LinearSRGBColorSpace;
  return rt;
}

// ---- Shared fullscreen-quad blit (used by snapshot-on-convergence) ----

const blitScene = new Scene();
const blitCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
const blitMaterial = new ShaderMaterial({
  uniforms: { tMap: { value: null as Texture | null } },
  vertexShader:
    'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader:
    'uniform sampler2D tMap; varying vec2 vUv; void main() { gl_FragColor = texture2D(tMap, vUv); }',
  depthTest: false,
  depthWrite: false,
});
const blitMesh = new Mesh(new PlaneGeometry(2, 2), blitMaterial);
blitMesh.frustumCulled = false;
blitScene.add(blitMesh);

/** Copy `src` into `dst` via a fullscreen quad pass. Restores the
 * renderer's previous render target afterwards. */
export function blitTextureToTarget(
  gl: WebGLRenderer,
  src: Texture,
  dst: WebGLRenderTarget,
): void {
  blitMaterial.uniforms.tMap.value = src;
  const prev = gl.getRenderTarget();
  gl.setRenderTarget(dst);
  gl.render(blitScene, blitCamera);
  gl.setRenderTarget(prev);
  blitMaterial.uniforms.tMap.value = null;
}

// ---- Automatic invalidation on scene-content changes ----

type Snapshot = {
  bricks: unknown;
  baseplateVisible: boolean;
  studsVisible: boolean;
  brickReflectivity: number;
  lightIntensity: number;
  lightWarmth: number;
  envIntensity: number;
  envRotation: number;
  envBackgroundVisible: boolean;
  envBackgroundBlur: number;
  envBackgroundIntensity: number;
  toneMapping: string;
  quality: string;
  pathtracerBounces: number;
  pathtracerDofEnabled: boolean;
  pathtracerFStop: number;
  pathtracerApertureBlades: number;
};

function snap(state: ReturnType<typeof useEditorStore.getState>): Snapshot {
  return {
    bricks: state.bricks,
    baseplateVisible: state.baseplateVisible,
    studsVisible: state.studsVisible,
    brickReflectivity: state.brickReflectivity,
    lightIntensity: state.lightIntensity,
    lightWarmth: state.lightWarmth,
    envIntensity: state.envIntensity,
    envRotation: state.envRotation,
    envBackgroundVisible: state.envBackgroundVisible,
    envBackgroundBlur: state.envBackgroundBlur,
    envBackgroundIntensity: state.envBackgroundIntensity,
    toneMapping: state.toneMapping,
    quality: state.quality,
    pathtracerBounces: state.pathtracerBounces,
    pathtracerDofEnabled: state.pathtracerDofEnabled,
    pathtracerFStop: state.pathtracerFStop,
    pathtracerApertureBlades: state.pathtracerApertureBlades,
  };
}

let prevSnap: Snapshot = snap(useEditorStore.getState());
useEditorStore.subscribe((state) => {
  const next = snap(state);
  for (const k of Object.keys(next) as (keyof Snapshot)[]) {
    if (next[k] !== prevSnap[k]) {
      clearCache();
      prevSnap = next;
      return;
    }
  }
});
