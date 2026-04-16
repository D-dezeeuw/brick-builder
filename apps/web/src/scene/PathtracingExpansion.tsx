import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { InstancedMesh, Matrix4, Mesh } from 'three';

/**
 * three-gpu-pathtracer@0.0.23 (the last release compatible with three 0.171)
 * pre-dates InstancedMesh support: its BVH generator ignores per-instance
 * matrices and treats each InstancedMesh as a single identity-positioned
 * mesh — collapsing every brick to the origin and hiding the baseplate's
 * 1024 studs.
 *
 * This component sits inside <Pathtracer> and, on mount, expands every
 * visible InstancedMesh into individual Mesh clones at each instance's
 * transform. The originals are hidden for the duration of render mode and
 * restored on unmount. The pathtracer's own setScene() call runs AFTER this
 * (parent layout effects commit after children), so the expanded meshes are
 * in the scene graph by the time the BVH is built.
 *
 * Trade-off: per-instance colour jitter is lost in render mode (all clones
 * share the base material). The pathtracer's own physical BRDF + IBL carries
 * more than enough variation for the "render" use case.
 */
export function PathtracingExpansion() {
  const scene = useThree((s) => s.scene);

  useLayoutEffect(() => {
    const clones: Mesh[] = [];
    const hidden: InstancedMesh[] = [];
    const m = new Matrix4();

    scene.traverse((obj) => {
      const im = obj as InstancedMesh;
      if (!im.isInstancedMesh || im.count === 0 || !im.parent) return;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        const clone = new Mesh(im.geometry, im.material);
        clone.matrixAutoUpdate = false;
        // Instance matrix is in the InstancedMesh's local space. Our
        // InstancedMeshes sit at identity relative to their parent, so
        // the instance matrix is also the clone's local matrix.
        clone.matrix.copy(m);
        clone.castShadow = im.castShadow;
        clone.receiveShadow = im.receiveShadow;
        im.parent.add(clone);
        clone.updateMatrixWorld(true);
        clones.push(clone);
      }
      im.visible = false;
      hidden.push(im);
    });
    scene.updateMatrixWorld(true);

    return () => {
      for (const clone of clones) clone.parent?.remove(clone);
      for (const im of hidden) im.visible = true;
    };
  }, [scene]);

  return null;
}
