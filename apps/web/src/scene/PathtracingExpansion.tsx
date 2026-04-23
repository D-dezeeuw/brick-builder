import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Box3,
  type BufferGeometry,
  Color,
  Frustum,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Vector3,
  type Camera,
  type Material,
  type Texture,
} from 'three';
import { usePathtracer } from '@react-three/gpu-pathtracer';
import { type Brick, type BrickShape, STUD_PITCH_MM } from '@brick/shared';
import { getGeometry } from '../bricks/geometry/builders';
import { reflectivityToProps } from '../bricks/material';
import { useEditorStore } from '../state/editorStore';
import { mergeInstances } from './mergeInstances';
import { IS_MOBILE } from './ptPlatform';

// Re-expansion triggers when the camera has translated by more than
// this distance OR rotated by more than this angle since the last
// expansion. Below threshold the cached padded-frustum expansion stays
// valid; above it we rebuild so newly-visible bricks don't pop in as
// black voids. Tuned for the editor's brick-scale scene (1 stud = 8mm).
const REEXPAND_POS_THRESHOLD_MM = 150;
const REEXPAND_ROT_THRESHOLD_RAD = (20 * Math.PI) / 180;

// Cull FOV is 2× the active camera's FOV, so small-to-medium rotations
// keep bricks within the cached expansion without a rebuild. Larger
// swings tip past REEXPAND_ROT_THRESHOLD_RAD and force a rebuild
// anyway, which is the correct fallback.
const CULL_FOV_MULTIPLIER = 2.0;

// Chunk size for grid-chunked geometry merging (PT-24). At 16 studs
// (= 16 × STUD_PITCH_MM = 128mm) each chunk holds up to 256 bricks,
// which is enough to meaningfully shrink BVH leaf count on a dense
// build without making chunks so large that distance-LOD gets
// mis-classified (a chunk diagonal is ≈ 181mm, well under our
// LOD distance below).
const CHUNK_SIZE_MM = 16 * STUD_PITCH_MM;

// LOD threshold for stud decimation (PT-23). Above this distance from
// the camera, we swap the brick geometry for its no-studs variant —
// studs are ≈5mm across and 1.6mm tall, which at 800mm+ viewing
// distance subtend well under a pixel on a 1080p canvas. Saves
// per-brick vertex count by ~50-70% depending on shape.
const LOD_DISTANCE_MM = 800;

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
 * Frustum culling: we clone only instances whose world AABB intersects a
 * cull frustum with CULL_FOV_MULTIPLIER× the camera's FOV. This pads the
 * cached set enough that small camera moves don't pop bricks in/out. Larger
 * moves trip REEXPAND_*_THRESHOLD and trigger a rebuild via the OrbitControls
 * `end` event; `usePathtracer().update()` then forces the BVH to regenerate
 * with the new mesh set.
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
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { addEventListener?: EventTarget['addEventListener']; removeEventListener?: EventTarget['removeEventListener'] } | null;
  const { pathtracer } = usePathtracer();

  // Track the current camera via a ref so the expansion effect
  // doesn't re-run when the default camera is swapped mid-session
  // (e.g. PathtracerCamera mounts a PhysicalCamera for DoF). Both
  // cameras share the same pose, so re-expanding would only waste a
  // BVH rebuild — the ref lets the next re-expansion (frustum
  // threshold exceeded) pick up the latest camera anyway.
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  // Reflectivity is part of the deps so moving the slider during render
  // mode re-clones with updated surface parameters. The path tracer
  // then re-runs setScene() from scratch — acceptable since it needs
  // to re-converge on any material change anyway.
  const reflectivity = useEditorStore((s) => s.brickReflectivity);

  // Bumping this state counter re-runs the expansion effect below,
  // which the controls 'end' listener drives when the camera has
  // moved far enough past the cached frustum.
  const [expansionKey, setExpansionKey] = useState(0);
  const lastExpansionPose = useRef<{ position: Vector3; quaternion: Quaternion } | null>(null);

  // Scene.environment is populated asynchronously by drei's
  // <Environment> (Suspense-wrapped HDRI load). Our initial expansion
  // typically runs BEFORE the HDRI resolves — capturing envMap=null on
  // every cloned material. three-gpu-pathtracer reads material.envMap
  // directly (no fallback to scene.environment), so without this watch
  // bricks render pitch-black until something else triggers a
  // re-expansion (camera move past the frustum threshold). Poll once
  // per frame (a single reference compare) and bump the expansion key
  // when the environment texture swaps in — the effect below then
  // re-clones with a valid envMap and the library rebuilds the BVH
  // via setSceneAsync on the worker.
  const lastEnvRef = useRef<Texture | null>(scene.environment);
  useFrame(() => {
    if (scene.environment !== lastEnvRef.current) {
      lastEnvRef.current = scene.environment;
      setExpansionKey((k) => k + 1);
    }
  });

  useLayoutEffect(() => {
    const clones: Mesh[] = [];
    const mergedGeos: BufferGeometry[] = [];
    const hidden: InstancedMesh[] = [];
    const ptMaterials: Material[] = [];
    const materialByKey = new Map<string, MeshPhysicalMaterial | MeshStandardMaterial>();
    const m = new Matrix4();

    // Build the cull frustum. We widen the FOV so rotations stay
    // within the cached expansion longer. For non-perspective cameras
    // (orthographic) we fall back to the camera's own projection — no
    // padding, but ortho views don't rotate to reveal new content the
    // same way perspective does.
    const activeCamera = cameraRef.current;
    const frustum = buildCullFrustum(activeCamera);
    const cameraPos = activeCamera.position;

    // A shared Box3 we transform to world space for each instance.
    const instanceBox = new Box3();
    const instancePos = new Vector3();
    const chunkCenter = new Vector3();

    scene.traverse((obj) => {
      const im = obj as InstancedMesh;
      if (!im.isInstancedMesh || im.count === 0 || !im.parent) return;

      // Geometry bounding box drives per-instance world AABB tests.
      // Lazy-compute if not yet cached by three.js.
      if (!im.geometry.boundingBox) im.geometry.computeBoundingBox();
      const localBox = im.geometry.boundingBox;
      if (!localBox) return;

      const firstMat = Array.isArray(im.material) ? im.material[0] : im.material;
      const keepMaterial = firstMat?.userData?.ptKeepMaterial === true;

      // Opt-out flag set by non-brick InstancedMeshes (currently only
      // the baseplate stud field). Those meshes keep their own colour
      // and roughness — but we still clone the material to attach an
      // explicit envMap, because the PT reads material.envMap directly
      // rather than scene.environment.
      const cloneMat = keepMaterial ? cloneWithEnv(firstMat, scene.environment) : null;

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

      // Brick buckets tag their items via userData in InstancedBricks;
      // we read the first item's shape to drive LOD-geometry lookup.
      // Baseplate studs / other non-brick meshes don't have items,
      // they stay at full detail.
      const items = im.userData.items as Brick[] | undefined;
      const shape = items?.[0]?.shape as BrickShape | undefined;
      const isBrick = !keepMaterial && shape !== undefined;

      // Chunk bucket: key = "chunkX,chunkZ". We also compute the
      // world-space centre of each chunk on the fly (from the first
      // instance we see in that chunk) so the LOD decision below is
      // a single precomputed distance — not a per-instance distance.
      const chunkMatrices = new Map<string, Matrix4[]>();
      const chunkCentres = new Map<string, Vector3>();

      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);

        // Frustum cull: transform the local AABB into world space and
        // test against the padded cull frustum. Skipping non-visible
        // instances directly shrinks the BVH leaf count — the largest
        // lever we have until the library grows true InstancedMesh
        // support.
        instanceBox.copy(localBox).applyMatrix4(m);
        if (!frustum.intersectsBox(instanceBox)) continue;

        instancePos.setFromMatrixPosition(m);
        const cx = Math.floor(instancePos.x / CHUNK_SIZE_MM);
        const cz = Math.floor(instancePos.z / CHUNK_SIZE_MM);
        const chunkKey = `${cx},${cz}`;
        let mats = chunkMatrices.get(chunkKey);
        if (!mats) {
          mats = [];
          chunkMatrices.set(chunkKey, mats);
          // Chunk centre for LOD distance: approximated as the
          // instance's XZ plus a y of 0. The few bricks' worth of
          // vertical error inside a chunk is far below LOD_DISTANCE_MM.
          chunkCentres.set(
            chunkKey,
            new Vector3(
              (cx + 0.5) * CHUNK_SIZE_MM,
              0,
              (cz + 0.5) * CHUNK_SIZE_MM,
            ),
          );
        }
        mats.push(m.clone());
      }

      // Per chunk: pick LOD (studded vs no-studs) and merge.
      for (const [chunkKey, mats] of chunkMatrices) {
        chunkCenter.copy(chunkCentres.get(chunkKey)!);
        const dist = cameraPos.distanceTo(chunkCenter);
        const useLOD = isBrick && shape !== undefined && dist > LOD_DISTANCE_MM;
        const sourceGeo = useLOD ? getGeometry(shape!, false) : im.geometry;

        const merged = mergeInstances(sourceGeo, mats);
        mergedGeos.push(merged);

        const clone = new Mesh(merged, ptMaterial ?? im.material);
        clone.matrixAutoUpdate = false;
        // Matrices are baked into the merged vertices — world matrix
        // is identity.
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

    // Snapshot the camera pose this expansion was computed against so
    // the 'end' listener below can decide whether a re-expansion is
    // warranted. On the initial mount the Pathtracer's own setScene
    // runs AFTER our effect (child effects fire before parents), so
    // the wrapper picks up the cloned meshes. For subsequent
    // re-expansions nothing else triggers setScene — we call
    // setSceneAsync() manually to rebuild the BVH off-thread.
    lastExpansionPose.current = {
      position: activeCamera.position.clone(),
      quaternion: activeCamera.quaternion.clone(),
    };

    // First mount: expansionKey is 0 and the wrapper will setScene on
    // its own (synchronously — unavoidable without forking the R3F
    // wrapper). Later keys are explicit re-expansions: route them
    // through setSceneAsync so the BVH rebuilds on the Web Worker
    // attached by <PathtracerBVHWorker>. The PT keeps rendering the
    // old BVH until the async build swaps in the new one, so the user
    // sees no freeze.
    if (expansionKey > 0) {
      const asyncApi = pathtracer as unknown as {
        setSceneAsync: (scene: unknown, camera: unknown) => Promise<unknown>;
      };
      asyncApi.setSceneAsync(scene, activeCamera).catch((err) => {
        // If the worker failed to spin up (e.g. CSP blocks module
        // workers), fall back silently to a sync rebuild so the user
        // still sees the updated scene instead of a stale BVH.
        console.warn('[pathtracer] async setScene failed, falling back to sync', err);
        (pathtracer as unknown as { setScene: (s: unknown, c: unknown) => void }).setScene(
          scene,
          activeCamera,
        );
      });
    }

    return () => {
      for (const clone of clones) clone.parent?.remove(clone);
      for (const im of hidden) im.visible = true;
      for (const mat of ptMaterials) mat.dispose();
      for (const g of mergedGeos) g.dispose();
    };
  }, [scene, reflectivity, expansionKey, pathtracer]);

  // OrbitControls 'end' fires when the user finishes a drag (and once
  // more after damping settles if enableDamping is on). Compare the
  // current camera pose against the one captured at last expansion; if
  // the delta exceeds either threshold, bump the key to rebuild.
  useEffect(() => {
    if (!controls || !controls.addEventListener) return;
    const onEnd = () => {
      const last = lastExpansionPose.current;
      if (!last) return;
      const now = cameraRef.current;
      const posDelta = now.position.distanceTo(last.position);
      const rotDelta = last.quaternion.angleTo(now.quaternion);
      if (posDelta > REEXPAND_POS_THRESHOLD_MM || rotDelta > REEXPAND_ROT_THRESHOLD_RAD) {
        setExpansionKey((k) => k + 1);
      }
    };
    controls.addEventListener('end', onEnd);
    return () => {
      controls.removeEventListener?.('end', onEnd);
    };
  }, [controls]);

  return null;
}

function buildCullFrustum(camera: Camera): Frustum {
  const frustum = new Frustum();
  const projScreenMatrix = new Matrix4();

  // Perspective cameras: widen the FOV so small rotations stay inside
  // the cached expansion. We reuse a scratch PerspectiveCamera to avoid
  // mutating the active camera's projection.
  const perspective = camera as PerspectiveCamera;
  if (perspective.isPerspectiveCamera) {
    const cullCam = new PerspectiveCamera(
      Math.min(170, perspective.fov * CULL_FOV_MULTIPLIER),
      perspective.aspect,
      perspective.near,
      perspective.far,
    );
    cullCam.position.copy(perspective.position);
    cullCam.quaternion.copy(perspective.quaternion);
    cullCam.updateMatrixWorld(true);
    cullCam.updateProjectionMatrix();
    projScreenMatrix.multiplyMatrices(cullCam.projectionMatrix, cullCam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);
    return frustum;
  }

  // Orthographic / fallback: use the camera's own projection. No
  // padding — ortho views don't rotate around the subject the way
  // perspective does, so the cached frustum stays valid longer.
  projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projScreenMatrix);
  return frustum;
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
