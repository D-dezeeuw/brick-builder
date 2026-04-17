/**
 * Headless thumbnail renderer for the admin room list.
 *
 * Approach: one shared THREE.WebGLRenderer + Scene, reused across every
 * requested thumbnail. Each call clears the scene, builds instanced
 * meshes from the passed brick rows, fits the camera to the build, and
 * produces a PNG data URL.
 *
 * Requests are serialised via a simple promise chain so the GPU never
 * handles two renders concurrently — cheap, avoids state leaks between
 * renders, and keeps the admin UI responsive.
 *
 * Cache: sessionStorage keyed by `bb-thumb-<roomId>-<updatedAt>`. Edits
 * to a room bump its `updated_at` so the cache key naturally
 * invalidates. ~15–30 KB per PNG, so session storage holds plenty.
 */

import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  PLATE_HEIGHT_MM,
  SHAPE_CATALOG,
  STUD_PITCH_MM,
  footprintOf,
  rotationOffsetMM,
  type BrickColor,
  type BrickShape,
} from '@brick/shared';
import { BRICK_COLOR_HEX } from '../state/constants';
import { getGeometry } from '../bricks/geometry/builders';
import type { AdminBrickRow } from './admin';

type ThumbBrick = {
  id: string;
  shape: BrickShape;
  color: BrickColor;
  gx: number;
  gy: number;
  gz: number;
  rotation: 0 | 1 | 2 | 3;
  transparent: boolean;
};

const THUMB_WIDTH = 320;
const THUMB_HEIGHT = 240;

let renderer: WebGLRenderer | null = null;
let scene: Scene | null = null;
let camera: PerspectiveCamera | null = null;

const materialCache = new Map<string, MeshStandardMaterial>();

function ensureRenderer(): {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
} | null {
  if (renderer && scene && camera) return { renderer, scene, camera };
  try {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_WIDTH;
    canvas.height = THUMB_HEIGHT;
    renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(THUMB_WIDTH, THUMB_HEIGHT, false);
    renderer.setClearColor(new Color('#1a1d24'), 1);

    scene = new Scene();
    const ambient = new AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const sun = new DirectionalLight(0xffffff, 1.0);
    sun.position.set(200, 300, 160);
    scene.add(sun);

    camera = new PerspectiveCamera(38, THUMB_WIDTH / THUMB_HEIGHT, 1, 4000);
    camera.position.set(300, 260, 300);
    camera.lookAt(0, 0, 0);
    return { renderer, scene, camera };
  } catch (err) {
    console.warn('[thumbs] WebGL setup failed:', err);
    renderer = null;
    scene = null;
    camera = null;
    return null;
  }
}

function materialFor(color: BrickColor, transparent: boolean): MeshStandardMaterial {
  const key = `${color}|${transparent ? 't' : 'o'}`;
  let m = materialCache.get(key);
  if (!m) {
    const hex = BRICK_COLOR_HEX[color];
    m = new MeshStandardMaterial({
      color: new Color(hex),
      roughness: 0.5,
      metalness: 0.0,
      transparent,
      opacity: transparent ? 0.55 : 1,
    });
    materialCache.set(key, m);
  }
  return m;
}

// Serialise rendering — one at a time, chained through a promise.
let queue: Promise<unknown> = Promise.resolve();

export function renderRoomThumbnail(bricks: AdminBrickRow[]): Promise<string | null> {
  const job = queue.then(() => doRender(bricks));
  // Swallow errors in the chain so one failure doesn't wedge the queue.
  queue = job.catch(() => undefined);
  return job;
}

async function doRender(rawBricks: AdminBrickRow[]): Promise<string | null> {
  if (rawBricks.length === 0) return null;
  const setup = ensureRenderer();
  if (!setup) return null;
  const { renderer, scene, camera } = setup;

  // Filter out anything that doesn't match our current catalog — legacy
  // shape ids simply drop out of the thumbnail.
  const bricks: ThumbBrick[] = [];
  for (const b of rawBricks) {
    if (!(b.shape in SHAPE_CATALOG)) continue;
    if (!(b.color in BRICK_COLOR_HEX)) continue;
    bricks.push({
      id: b.id,
      shape: b.shape as BrickShape,
      color: b.color as BrickColor,
      gx: b.gx,
      gy: b.gy,
      gz: b.gz,
      rotation: ((b.rotation as number) % 4) as 0 | 1 | 2 | 3,
      transparent: b.transparent === true,
    });
  }
  if (bricks.length === 0) return null;

  // Drop any existing brick meshes from prior renders.
  const disposable: InstancedMesh[] = [];
  for (const child of scene.children) {
    if ((child as InstancedMesh).isInstancedMesh) disposable.push(child as InstancedMesh);
  }
  for (const m of disposable) {
    scene.remove(m);
    // Geometries are cached globally — don't dispose them. Materials
    // are cached per color — don't dispose either.
  }

  // Bucket bricks by (shape, color, transparent) to reuse InstancedMesh.
  const buckets = new Map<string, ThumbBrick[]>();
  for (const b of bricks) {
    const key = `${b.shape}|${b.color}|${b.transparent ? 't' : 'o'}`;
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(b);
  }

  const tmpMat = new Matrix4();
  const transMat = new Matrix4();
  const rotMat = new Matrix4();
  const sceneBounds = new Box3();
  const corner = new Vector3();

  for (const [, items] of buckets) {
    const first = items[0];
    const geom = getGeometry(first.shape);
    const mat = materialFor(first.color, first.transparent);
    const mesh = new InstancedMesh(geom, mat, items.length);
    const fp = footprintOf(SHAPE_CATALOG[first.shape]);
    const bodyW = fp.w * STUD_PITCH_MM;
    const bodyD = fp.d * STUD_PITCH_MM;

    for (let i = 0; i < items.length; i++) {
      const b = items[i];
      const off = rotationOffsetMM(b.rotation, bodyW, bodyD);
      transMat.makeTranslation(
        b.gx * STUD_PITCH_MM + off.x,
        b.gy * PLATE_HEIGHT_MM,
        b.gz * STUD_PITCH_MM + off.z,
      );
      rotMat.makeRotationY(b.rotation * (Math.PI / 2));
      tmpMat.multiplyMatrices(transMat, rotMat);
      mesh.setMatrixAt(i, tmpMat);

      // Grow bounds using the brick's axis-aligned footprint at gy.
      const swap = b.rotation % 2 === 1;
      const effW = (swap ? fp.d : fp.w) * STUD_PITCH_MM;
      const effD = (swap ? fp.w : fp.d) * STUD_PITCH_MM;
      const layers = fp.layers;
      corner.set(b.gx * STUD_PITCH_MM, b.gy * PLATE_HEIGHT_MM, b.gz * STUD_PITCH_MM);
      sceneBounds.expandByPoint(corner);
      corner.set(
        b.gx * STUD_PITCH_MM + effW,
        (b.gy + layers) * PLATE_HEIGHT_MM,
        b.gz * STUD_PITCH_MM + effD,
      );
      sceneBounds.expandByPoint(corner);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }

  // Frame the camera on the build. PerspectiveCamera framing from a
  // bounding sphere keeps the maths simple and looks right at any aspect.
  const sphere = new Sphere();
  sceneBounds.getBoundingSphere(sphere);
  const dist = Math.max(60, sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.25;
  const target = sphere.center;
  // Angle: 3/4 view, slightly elevated, offset to the right.
  const dir = new Vector3(0.75, 0.7, 0.85).normalize();
  camera.position.copy(target).addScaledVector(dir, dist);
  camera.lookAt(target);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  // toDataURL on the shared canvas — preserveDrawingBuffer=true on the
  // renderer keeps this valid after the draw.
  const canvas = renderer.domElement as HTMLCanvasElement;
  try {
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[thumbs] toDataURL failed:', err);
    return null;
  }
}

// ---------- sessionStorage cache ----------

export function cachedThumbKey(roomId: string, updatedAt: string): string {
  return `bb-thumb-${roomId}-${updatedAt}`;
}

export function loadCachedThumb(roomId: string, updatedAt: string): string | null {
  try {
    return sessionStorage.getItem(cachedThumbKey(roomId, updatedAt));
  } catch {
    return null;
  }
}

export function storeCachedThumb(roomId: string, updatedAt: string, dataUrl: string): void {
  try {
    sessionStorage.setItem(cachedThumbKey(roomId, updatedAt), dataUrl);
  } catch {
    // Quota / privacy mode — silently give up, the image is still shown
    // for this session, it just won't persist to the next.
  }
}
