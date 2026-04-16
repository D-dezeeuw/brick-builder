import { useLayoutEffect, useRef } from 'react';
import { InstancedMesh, Matrix4 } from 'three';
import { PLATE_HEIGHT_MM, STUD_DIAMETER_MM, STUD_HEIGHT_MM, STUD_PITCH_MM } from '@brick/shared';
import { BASEPLATE_COLOR, BASEPLATE_STUDS } from '../state/constants';

function StudField() {
  const ref = useRef<InstancedMesh>(null);
  const count = BASEPLATE_STUDS * BASEPLATE_STUDS;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const offset = -BASEPLATE_STUDS / 2 + 0.5;
    let i = 0;
    for (let ix = 0; ix < BASEPLATE_STUDS; ix++) {
      for (let iz = 0; iz < BASEPLATE_STUDS; iz++) {
        const x = (ix + offset) * STUD_PITCH_MM;
        const z = (iz + offset) * STUD_PITCH_MM;
        m.makeTranslation(x, STUD_HEIGHT_MM / 2, z);
        mesh.setMatrixAt(i++, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    // Skip from raycasting — the slab below handles pointer picking. Studs are purely decorative.
    mesh.raycast = () => {};
  }, [count]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow receiveShadow>
      <cylinderGeometry args={[STUD_DIAMETER_MM / 2, STUD_DIAMETER_MM / 2, STUD_HEIGHT_MM, 16]} />
      <meshStandardMaterial color={BASEPLATE_COLOR} roughness={0.7} />
    </instancedMesh>
  );
}

export function Baseplate() {
  const size = BASEPLATE_STUDS * STUD_PITCH_MM;

  return (
    <group>
      <mesh
        position={[0, -PLATE_HEIGHT_MM / 2, 0]}
        receiveShadow
        userData={{ kind: 'baseplate' }}
      >
        <boxGeometry args={[size, PLATE_HEIGHT_MM, size]} />
        <meshStandardMaterial color={BASEPLATE_COLOR} roughness={0.8} />
      </mesh>
      <StudField />
    </group>
  );
}
