import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import {
  Color,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Material,
  type Texture,
} from 'three';
import { reflectivityToProps } from '../bricks/material';
import { useEditorStore } from '../state/editorStore';

/**
 * Coarse mobile heuristic. three-gpu-pathtracer 0.0.23 conditionally
 * compiles clearcoat / sheen branches into its mega-shader based on
 * which materials it sees; iOS GPUs and some Mali chips silently fall
 * back to zero-output fragments when that shader exceeds their
 * instruction budget, which renders as pitch-black bricks. The UA
 * sniff is pragmatic — a proper WebGL shader-compile probe would be
 * nicer but a lot more code for a hobby feature.
 */
const IS_MOBILE =
  typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

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
    const ptMaterials: Material[] = [];
    const materialByKey = new Map<string, MeshPhysicalMaterial | MeshStandardMaterial>();
    const m = new Matrix4();

    scene.traverse((obj) => {
      const im = obj as InstancedMesh;
      if (!im.isInstancedMesh || im.count === 0 || !im.parent) return;

      const firstMat = Array.isArray(im.material) ? im.material[0] : im.material;

      // Opt-out flag set by non-brick InstancedMeshes (currently only
      // the baseplate stud field). Those meshes keep their own colour
      // and roughness — but we still clone the material to attach an
      // explicit envMap, because the PT reads material.envMap directly
      // rather than scene.environment.
      const cloneMat =
        firstMat?.userData?.ptKeepMaterial === true
          ? cloneWithEnv(firstMat, scene.environment)
          : null;

      let ptMaterial: Material | null = cloneMat;
      if (!ptMaterial) {
        // Brick path — same clearBrick flag we used before to split
        // solid from transparent buckets.
        const transparent = firstMat?.userData?.clearBrick === true;
        ptMaterial = getPtMaterial(
          im.material,
          scene.environment,
          materialByKey,
          reflectivity,
          transparent,
        );
      }
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
  cache: Map<string, MeshPhysicalMaterial | MeshStandardMaterial>,
  reflectivity: number,
  transparent: boolean,
): MeshPhysicalMaterial | MeshStandardMaterial | null {
  const base = Array.isArray(source) ? source[0] : source;
  const color = (base as MeshPhysicalMaterial).color;
  if (!color) return null;
  const key = `${IS_MOBILE ? 'm' : 'd'}${transparent ? 't' : 's'}#${color.getHexString()}`;
  const existing = cache.get(key);
  if (existing) return existing;

  if (transparent) {
    // Clear-plastic PT variant. Mobile drops transmission/clearcoat
    // entirely (shader budget) and uses an alpha-blended
    // MeshStandardMaterial that the PT treats as a simple semi-
    // transparent surface — loses refraction but keeps mobile alive.
    if (IS_MOBILE) {
      const material = new MeshStandardMaterial({
        color: color.clone(),
        roughness: 0.2,
        metalness: 0,
        transparent: true,
        opacity: 0.55,
      });
      material.envMap = envMap;
      material.envMapIntensity = 1;
      cache.set(key, material);
      return material;
    }
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

  // Opaque bricks.
  // Mobile: MeshStandardMaterial (no clearcoat) to stay within the
  //         three-gpu-pathtracer mega-shader instruction budget.
  //         Visually flatter than the desktop clearcoated version,
  //         but visible — which beats black.
  // Desktop: full MeshPhysicalMaterial with the gloss slider's
  //          clearcoat settings.
  if (IS_MOBILE) {
    const material = new MeshStandardMaterial({
      color: color.clone(),
      roughness: 0.35,
      metalness: 0,
      emissive: new Color(color).multiplyScalar(0.02),
    });
    material.envMap = envMap;
    material.envMapIntensity = 1;
    cache.set(key, material);
    return material;
  }

  const props = reflectivityToProps(reflectivity);
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

/**
 * Clone an arbitrary brick-adjacent material for the PT scene,
 * preserving its own properties (colour, roughness, metalness) but
 * attaching the scene-level env map explicitly. Used for non-brick
 * InstancedMeshes tagged with `ptKeepMaterial` — currently only the
 * baseplate stud field.
 */
function cloneWithEnv(source: Material, envMap: Texture | null): Material {
  const clone = source.clone() as MeshStandardMaterial;
  clone.envMap = envMap;
  if ('envMapIntensity' in clone) clone.envMapIntensity = 1;
  return clone;
}
