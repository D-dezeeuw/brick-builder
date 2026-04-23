import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  type WebGLRenderTarget,
} from 'three';

/**
 * Fullscreen-quad view that draws a cached converged pathtrace target
 * directly to the canvas. Mounted in place of <Pathtracer> on a cache
 * hit so that re-entering render mode at a previously-converged pose
 * shows the image instantly — no BVH build, no sample accumulation.
 *
 * Uses priority 1 to match the Pathtracer wrapper's frameloop: R3F's
 * default auto-render is suppressed and we own the frame. The quad
 * covers NDC [-1, 1] regardless of canvas size, so it fills the
 * viewport without projection math.
 *
 * MeshBasicMaterial (toneMapped: true by default) lets the renderer's
 * ACES tone mapping + output encoding apply to the linear HDR texture
 * sampled from the cache — visually identical to what the live
 * pathtracer would have displayed for the same converged buffer.
 */
export function CachedPathtraceView({ target }: { target: WebGLRenderTarget }) {
  const gl = useThree((s) => s.gl);

  const { scene, camera, material, geometry } = useMemo(() => {
    const s = new Scene();
    const c = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const g = new PlaneGeometry(2, 2);
    const m = new MeshBasicMaterial({ depthTest: false, depthWrite: false });
    const mesh = new Mesh(g, m);
    mesh.frustumCulled = false;
    s.add(mesh);
    return { scene: s, camera: c, material: m, geometry: g };
  }, []);

  useEffect(() => {
    material.map = target.texture;
    material.needsUpdate = true;
  }, [target, material]);

  useFrame(() => {
    gl.render(scene, camera);
  }, 1);

  useEffect(
    () => () => {
      material.dispose();
      geometry.dispose();
    },
    [material, geometry],
  );

  return null;
}
