import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Matrix4 } from 'three';
import { PLATE_HEIGHT_MM, STUD_DIAMETER_MM, STUD_HEIGHT_MM, STUD_PITCH_MM } from '@brick/shared';
import { BASEPLATE_COLOR } from '../state/constants';
import { useEditorStore } from '../state/editorStore';

function StudField({
  minGx,
  maxGx,
  minGz,
  maxGz,
}: {
  minGx: number;
  maxGx: number;
  minGz: number;
  maxGz: number;
}) {
  const width = maxGx - minGx;
  const depth = maxGz - minGz;
  const count = width * depth;
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    let i = 0;
    for (let ix = 0; ix < width; ix++) {
      for (let iz = 0; iz < depth; iz++) {
        const gx = minGx + ix;
        const gz = minGz + iz;
        // Stud centered in its cell: world x = gx*8 + 4, z = gz*8 + 4.
        const x = gx * STUD_PITCH_MM + STUD_PITCH_MM / 2;
        const z = gz * STUD_PITCH_MM + STUD_PITCH_MM / 2;
        m.makeTranslation(x, STUD_HEIGHT_MM / 2, z);
        mesh.setMatrixAt(i++, m);
      }
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.raycast = () => {};
    // Tell PathtracingExpansion to preserve the stud's own material
    // instead of swapping in the brick-clearcoat recipe — studs aren't
    // bricks and mobile GPUs can't run the full physical-material
    // shader for them.
    mesh.userData.kind = 'baseplate-stud';
    mesh.userData.ptKeepMaterial = true;
  }, [minGx, maxGx, minGz, maxGz, count, width, depth]);

  return (
    <instancedMesh
      // Remount when the capacity grows — InstancedMesh count is fixed at construct time.
      key={`studs-${count}`}
      ref={ref}
      args={[undefined, undefined, count]}
      castShadow
      receiveShadow
    >
      <cylinderGeometry args={[STUD_DIAMETER_MM / 2, STUD_DIAMETER_MM / 2, STUD_HEIGHT_MM, 16]} />
      <meshStandardMaterial color={BASEPLATE_COLOR} roughness={0.38} metalness={0.08} />
    </instancedMesh>
  );
}

export function Baseplate() {
  const bounds = useEditorStore((s) => s.baseplateBounds);
  const { minGx, maxGx, minGz, maxGz } = bounds;

  const slab = useMemo(() => {
    const width = (maxGx - minGx) * STUD_PITCH_MM;
    const depth = (maxGz - minGz) * STUD_PITCH_MM;
    const centerX = (minGx + maxGx) * STUD_PITCH_MM * 0.5;
    const centerZ = (minGz + maxGz) * STUD_PITCH_MM * 0.5;
    return { width, depth, centerX, centerZ };
  }, [minGx, maxGx, minGz, maxGz]);

  return (
    <group>
      <mesh
        position={[slab.centerX, -PLATE_HEIGHT_MM / 2, slab.centerZ]}
        receiveShadow
        userData={{ kind: 'baseplate' }}
      >
        <boxGeometry args={[slab.width, PLATE_HEIGHT_MM, slab.depth]} />
        <meshStandardMaterial color={BASEPLATE_COLOR} roughness={0.38} metalness={0.08} />
      </mesh>
      <StudField minGx={minGx} maxGx={maxGx} minGz={minGz} maxGz={maxGz} />
    </group>
  );
}
