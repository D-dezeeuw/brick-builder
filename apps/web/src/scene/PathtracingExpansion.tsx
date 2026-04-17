import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import {
  Color,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  type Material,
  type Texture,
} from 'three';
import { reflectivityToProps } from '../bricks/material';
import { useEditorStore } from '../state/editorStore';

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
 * restored on unmount.
 *
 * Materials are swapped to a PT-simplified MeshStandardMaterial variant keyed
 * on the base color. Reasons:
 * 1. three-gpu-pathtracer@0.0.23 reads `material.envMap` directly and does
 *    not implicitly fall back to `scene.environment` the way the rasterizer
 *    does. Without an explicit envMap assignment, IBL contribution is zero
 *    — which on mobile (where HDR float textures are flaky) shows up as
 *    flat-black bricks. We assign `scene.environment` explicitly here.
 * 2. Clearcoat + sheen on MeshPhysicalMaterial push the shader past mobile
 *    WebGL2 instruction budgets on some iOS GPUs, causing a silent fallback
 *    to a black shader. Dropping to MeshStandardMaterial keeps the visual
 *    roughly the same (PT's own BRDF is more important than the material
 *    type) while staying within mobile shader budgets.
 * 3. A tiny emissive baseline (0.03 of the base color) keeps bricks
 *    visible even if the environment map fails to load entirely — direct
 *    lights + this floor guarantee we never show a pitch-black canvas.
 *
 * Trade-off: per-instance colour jitter is lost in render mode. The
 * pathtracer's own BRDF + IBL carries more than enough variation.
 */
export function PathtracingExpansion() {
  const scene = useThree((s) => s.scene);
  // Reflectivity is part of the deps so moving the slider during render
  // mode re-clones with updated surface parameters. The path tracer
  // then re-runs setScene() from scratch — acceptable since it needs
  // to re-converge on any material change anyway.
  const reflectivity = useEditorStore((s) => s.brickReflectivity);

  useLayoutEffect(() => {
    const clones: Mesh[] = [];
    const hidden: InstancedMesh[] = [];
    const ptMaterials: MeshPhysicalMaterial[] = [];
    const materialByKey = new Map<string, MeshPhysicalMaterial>();
    const m = new Matrix4();

    scene.traverse((obj) => {
      const im = obj as InstancedMesh;
      if (!im.isInstancedMesh || im.count === 0 || !im.parent) return;

      // Realtime materials tagged with `userData.clearBrick === true` by
      // createBrickMaterial are the clear-plastic buckets. We used to
      // sniff `material.transmission > 0`, but the realtime variant now
      // avoids transmission entirely (it conflicts with the EffectComposer
      // during MSAA-resolve blits), so the explicit tag is the only
      // reliable signal between realtime and PT.
      const firstMat = Array.isArray(im.material) ? im.material[0] : im.material;
      const transparent = firstMat?.userData?.clearBrick === true;

      const ptMaterial = getPtMaterial(
        im.material,
        scene.environment,
        materialByKey,
        reflectivity,
        transparent,
      );
      if (ptMaterial && !ptMaterials.includes(ptMaterial)) ptMaterials.push(ptMaterial);

      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        const clone = new Mesh(im.geometry, ptMaterial ?? im.material);
        clone.matrixAutoUpdate = false;
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
      for (const mat of ptMaterials) mat.dispose();
    };
  }, [scene, reflectivity]);

  return null;
}

function getPtMaterial(
  source: Material | Material[],
  envMap: Texture | null,
  cache: Map<string, MeshPhysicalMaterial>,
  reflectivity: number,
  transparent: boolean,
): MeshPhysicalMaterial | null {
  const base = Array.isArray(source) ? source[0] : source;
  const color = (base as MeshPhysicalMaterial).color;
  if (!color) return null;
  const key = `${transparent ? 't' : 's'}#${color.getHexString()}`;
  const existing = cache.get(key);
  if (existing) return existing;

  if (transparent) {
    // Clear-plastic PT variant. three-gpu-pathtracer 0.0.23 reads
    // transmission/ior/thickness/attenuation off MeshPhysicalMaterial
    // directly, so the traced result matches the realtime tinted-glass
    // look. Roughness stays very low so highlights stay crisp; the
    // tint comes from attenuationColor (= surface color) rather than
    // base color, which keeps interior transmission coloured without
    // a baked opacity.
    const material = new MeshPhysicalMaterial({
      color: color.clone(),
      roughness: 0.05,
      metalness: 0,
      transmission: 1,
      ior: 1.48,
      thickness: 4,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      attenuationDistance: 80,
      attenuationColor: color.clone(),
    });
    material.envMap = envMap;
    material.envMapIntensity = 1;
    cache.set(key, material);
    return material;
  }

  const props = reflectivityToProps(reflectivity);
  // Sheen is deliberately omitted — it's the MeshPhysicalMaterial feature
  // that caused mobile shader-budget issues before, and the PT's own BRDF
  // doesn't support it in 0.0.23 anyway. A tiny emissive term keeps dark
  // corners from crushing to pure black if the env map fails to load.
  const material = new MeshPhysicalMaterial({
    color: color.clone(),
    roughness: props.roughness,
    metalness: 0,
    clearcoat: props.clearcoat,
    clearcoatRoughness: props.clearcoatRoughness,
    emissive: new Color(color).multiplyScalar(0.02),
  });
  material.envMap = envMap;
  material.envMapIntensity = 1;
  cache.set(key, material);
  return material;
}
