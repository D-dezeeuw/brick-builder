import { useCallback, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedMesh, Matrix4 } from 'three';
import {
  PLATE_HEIGHT_MM,
  SHAPE_CATALOG,
  STUD_PITCH_MM,
  footprintOf,
  rotationOffsetMM,
  type Brick,
  type BrickColor,
  type BrickShape,
} from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { BRICK_COLOR_HEX } from '../state/constants';
import { getPlacementProgress, hasActivePlacementAnimations } from '../state/placementFeedback';
import { QUALITY_CONFIGS } from '../state/quality';
import { getGeometry } from './geometry/builders';
import { createBrickMaterial } from './material';

const MIN_BUCKET_CAPACITY = 256;
const JITTER_AMPLITUDE = 0.04; // ±2% per channel

function bucketKey(shape: BrickShape, color: BrickColor, transparent: boolean): string {
  return `${shape}|${color}|${transparent ? 't' : 's'}`;
}

function capacityFor(n: number): number {
  if (n <= MIN_BUCKET_CAPACITY) return MIN_BUCKET_CAPACITY;
  return 1 << Math.ceil(Math.log2(n));
}

/**
 * Stable RGB jitter (±2% per channel) derived from a brick id, so
 * adjacent same-colour bricks don't look like plastic stencilled onto
 * each other.
 */
function jitterFromId(id: string): [number, number, number] {
  // FNV-1a 32-bit, then three independent channel offsets.
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  const u = h >>> 0;
  const c1 = u / 4294967295;
  const c2 = ((u * 2654435761) >>> 0) / 4294967295;
  const c3 = ((u * 2246822519) >>> 0) / 4294967295;
  const base = 1 - JITTER_AMPLITUDE / 2;
  return [base + c1 * JITTER_AMPLITUDE, base + c2 * JITTER_AMPLITUDE, base + c3 * JITTER_AMPLITUDE];
}

function populateMesh(mesh: InstancedMesh, items: Brick[], shape: BrickShape): void {
  const footprint = footprintOf(SHAPE_CATALOG[shape]);
  const bodyW = footprint.w * STUD_PITCH_MM;
  const bodyD = footprint.d * STUD_PITCH_MM;
  const m = new Matrix4();
  const trans = new Matrix4();
  const rot = new Matrix4();
  const jitterColor = new Color();

  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    const { x: ox, z: oz } = rotationOffsetMM(b.rotation, bodyW, bodyD);
    trans.makeTranslation(
      b.gx * STUD_PITCH_MM + ox,
      b.gy * PLATE_HEIGHT_MM,
      b.gz * STUD_PITCH_MM + oz,
    );
    rot.makeRotationY(b.rotation * (Math.PI / 2));
    m.multiplyMatrices(trans, rot);
    mesh.setMatrixAt(i, m);

    const [jr, jg, jb] = jitterFromId(b.id);
    jitterColor.setRGB(jr, jg, jb);
    mesh.setColorAt(i, jitterColor);
  }
  mesh.count = items.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  // Tag for PlacementCursor's raycaster so it can map instanceId → brick.
  mesh.userData.kind = 'brick-bucket';
  mesh.userData.items = items;
}

export function InstancedBricks() {
  const bricks = useEditorStore((s) => s.bricks);
  const layers = useEditorStore((s) => s.layers);

  const hiddenLayerIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of layers) if (!l.visible) s.add(l.id);
    return s;
  }, [layers]);

  const buckets = useMemo(() => {
    const m = new Map<
      string,
      { shape: BrickShape; color: BrickColor; transparent: boolean; items: Brick[] }
    >();
    for (const brick of bricks.values()) {
      // Skip bricks whose layer is toggled hidden. We leave them in
      // cellIndex so stacking still respects them — you can't see it
      // but you can't place into its cells either.
      if (brick.layerId && hiddenLayerIds.has(brick.layerId)) continue;
      const transparent = brick.transparent === true;
      const key = bucketKey(brick.shape, brick.color, transparent);
      let entry = m.get(key);
      if (!entry) {
        entry = { shape: brick.shape, color: brick.color, transparent, items: [] };
        m.set(key, entry);
      }
      entry.items.push(brick);
    }
    return Array.from(m.values());
  }, [bricks, hiddenLayerIds]);

  return (
    <>
      {buckets.map((b) => (
        <BrickBucket
          key={bucketKey(b.shape, b.color, b.transparent)}
          shape={b.shape}
          color={b.color}
          transparent={b.transparent}
          items={b.items}
        />
      ))}
    </>
  );
}

type BucketProps = {
  shape: BrickShape;
  color: BrickColor;
  transparent: boolean;
  items: Brick[];
};

function BrickBucket({ shape, color, transparent, items }: BucketProps) {
  const quality = useEditorStore((s) => s.quality);
  const reflectivity = useEditorStore((s) => s.brickReflectivity);
  const geometry = useMemo(() => getGeometry(shape), [shape]);
  const material = useMemo(
    () =>
      createBrickMaterial(
        BRICK_COLOR_HEX[color],
        QUALITY_CONFIGS[quality],
        reflectivity,
        transparent,
      ),
    [color, quality, reflectivity, transparent],
  );
  const capacity = capacityFor(items.length);

  // Callback ref — runs on mount and whenever items / shape change. Crucially,
  // it also runs when the underlying <instancedMesh> is REMOUNTED (e.g. after
  // R3F sees a new `args` tuple when the material swaps on a quality change).
  // A plain useRef + useLayoutEffect with [items, shape] deps doesn't fire in
  // that case because its deps haven't changed — only the mesh instance has —
  // leaving the fresh InstancedMesh with identity matrices and every brick
  // stacked on the origin.
  const meshRef = useRef<InstancedMesh | null>(null);
  const setMesh = useCallback(
    (mesh: InstancedMesh | null) => {
      meshRef.current = mesh;
      if (!mesh) return;
      populateMesh(mesh, items, shape);
    },
    [items, shape],
  );

  // Drop-in animation. While any placement is mid-animation (<180ms
  // old) we patch that instance's matrix each frame — rising from
  // ~15mm above its resting Y with a small scale overshoot that eases
  // back to 1.0. No-op every other frame (cheap check on a Map size)
  // so the steady-state cost is a single `hasActivePlacementAnimations`
  // call per bucket per frame.
  const footprint = useMemo(() => footprintOf(SHAPE_CATALOG[shape]), [shape]);
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!hasActivePlacementAnimations()) return;
    const now = performance.now();
    const bodyW = footprint.w * STUD_PITCH_MM;
    const bodyD = footprint.d * STUD_PITCH_MM;
    const m = new Matrix4();
    const trans = new Matrix4();
    const rot = new Matrix4();
    const scl = new Matrix4();
    let patched = false;
    for (let i = 0; i < items.length; i++) {
      const b = items[i];
      const p = getPlacementProgress(b.id, now);
      if (p === null) continue;
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const rise = (1 - eased) * 15; // mm above resting Y
      const scale = 1 + (1 - eased) * 0.08;
      const { x: ox, z: oz } = rotationOffsetMM(b.rotation, bodyW, bodyD);
      trans.makeTranslation(
        b.gx * STUD_PITCH_MM + ox,
        b.gy * PLATE_HEIGHT_MM + rise,
        b.gz * STUD_PITCH_MM + oz,
      );
      rot.makeRotationY(b.rotation * (Math.PI / 2));
      scl.makeScale(scale, scale, scale);
      m.multiplyMatrices(trans, rot).multiply(scl);
      mesh.setMatrixAt(i, m);
      patched = true;
    }
    if (patched) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      // Capacity growth requires remounting the mesh — InstancedMesh count
      // is fixed at construct time.
      key={capacity}
      ref={setMesh}
      args={[geometry, material, capacity]}
      castShadow
      receiveShadow
    />
  );
}
