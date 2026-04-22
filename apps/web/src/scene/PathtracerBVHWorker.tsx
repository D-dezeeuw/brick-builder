import { useEffect } from 'react';
import { GenerateMeshBVHWorker, ParallelMeshBVHWorker } from 'three-mesh-bvh/worker';
import { usePathtracer } from '@react-three/gpu-pathtracer';

/**
 * Attach a Web Worker to the path tracer so BVH builds run off the
 * main thread. Without this, every re-expansion triggered by
 * PathtracingExpansion (camera moved past the cached frustum) rebuilds
 * the BVH synchronously — visible as a dropped-frame hitch on 10k-brick
 * scenes.
 *
 * ParallelMeshBVHWorker spreads work across `hardwareConcurrency`
 * workers but requires SharedArrayBuffer, which in turn needs
 * cross-origin isolation (COOP/COEP response headers). Our Netlify +
 * Pages hosts don't set those today, so we feature-detect and fall
 * back to the single-worker GenerateMeshBVHWorker — still off-thread,
 * just not parallel. Either one eliminates the main-thread freeze.
 *
 * Lifecycle: the parent <Pathtracer> only mounts while renderMode is
 * true, so the worker is created on PT-mode entry and terminated on
 * exit. The initial setScene() call the R3F wrapper makes is still
 * synchronous (the wrapper doesn't use setSceneAsync), but
 * PathtracingExpansion triggers async rebuilds via setSceneAsync on
 * every re-expansion.
 */
export function PathtracerBVHWorker() {
  const { pathtracer } = usePathtracer();

  useEffect(() => {
    let worker: GenerateMeshBVHWorker | ParallelMeshBVHWorker;
    try {
      // ParallelMeshBVHWorker throws in its constructor if SAB is not
      // available, so we wrap in try/catch rather than duplicating the
      // detection heuristic.
      worker = new ParallelMeshBVHWorker();
    } catch {
      worker = new GenerateMeshBVHWorker();
    }

    // `setBVHWorker` is declared on WebGLPathTracer but not on the
    // wrapper's forwarded ref type — the R3F package re-exports the
    // instance through usePathtracer() but its .d.ts stops short. Cast
    // the minimal shape we need rather than the whole class.
    (pathtracer as unknown as { setBVHWorker: (w: unknown) => void }).setBVHWorker(worker);

    return () => {
      (worker as unknown as { dispose?: () => void }).dispose?.();
    };
  }, [pathtracer]);

  return null;
}
