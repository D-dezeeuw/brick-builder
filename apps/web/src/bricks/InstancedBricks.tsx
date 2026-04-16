import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Matrix4, MeshStandardMaterial } from 'three';
import {
  PLATE_HEIGHT_MM,
  SHAPE_FOOTPRINT,
  STUD_PITCH_MM,
  type Brick,
  type BrickColor,
  type BrickShape,
} from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { BRICK_COLOR_HEX } from '../state/constants';
import { getBrickGeometry } from './geometry/studdedBox';

const BUCKET_CAPACITY = 1024;

function bucketKey(shape: BrickShape, color: BrickColor): string {
  return `${shape}|${color}`;
}

export function InstancedBricks() {
  const bricks = useEditorStore((s) => s.bricks);

  const buckets = useMemo(() => {
    const m = new Map<string, { shape: BrickShape; color: BrickColor; items: Brick[] }>();
    for (const brick of bricks.values()) {
      const key = bucketKey(brick.shape, brick.color);
      let entry = m.get(key);
      if (!entry) {
        entry = { shape: brick.shape, color: brick.color, items: [] };
        m.set(key, entry);
      }
      entry.items.push(brick);
    }
    return Array.from(m.values());
  }, [bricks]);

  return (
    <>
      {buckets.map((b) => (
        <BrickBucket
          key={bucketKey(b.shape, b.color)}
          shape={b.shape}
          color={b.color}
          items={b.items}
        />
      ))}
    </>
  );
}

type BucketProps = {
  shape: BrickShape;
  color: BrickColor;
  items: Brick[];
};

function BrickBucket({ shape, color, items }: BucketProps) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => getBrickGeometry(shape), [shape]);
  const material = useMemo(
    () => new MeshStandardMaterial({ color: BRICK_COLOR_HEX[color], roughness: 0.4 }),
    [color],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const footprint = SHAPE_FOOTPRINT[shape];
    const cx = (footprint.w * STUD_PITCH_MM) / 2;
    const cz = (footprint.d * STUD_PITCH_MM) / 2;
    const m = new Matrix4();
    const world = new Matrix4();
    const pivot = new Matrix4();
    const rot = new Matrix4();
    const unpivot = new Matrix4().makeTranslation(-cx, 0, -cz);
    pivot.makeTranslation(cx, 0, cz);

    for (let i = 0; i < items.length; i++) {
      const b = items[i];
      const angle = b.rotation * (Math.PI / 2);
      world.makeTranslation(b.gx * STUD_PITCH_MM, b.gy * PLATE_HEIGHT_MM, b.gz * STUD_PITCH_MM);
      rot.makeRotationY(angle);
      m.identity().multiply(world).multiply(pivot).multiply(rot).multiply(unpivot);
      mesh.setMatrixAt(i, m);
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, shape]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, BUCKET_CAPACITY]}
      castShadow
      receiveShadow
    />
  );
}
