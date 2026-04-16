import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MOUSE, TOUCH } from 'three';
import { STUD_PITCH_MM } from '@brick/shared';
import { Baseplate } from './Baseplate';
import { PlacementCursor } from './PlacementCursor';
import { InstancedBricks } from '../bricks/InstancedBricks';
import { BASEPLATE_STUDS } from '../state/constants';

export function Scene() {
  const baseSize = BASEPLATE_STUDS * STUD_PITCH_MM;
  const camDist = baseSize * 1.1;

  return (
    <Canvas camera={{ position: [camDist, camDist * 0.9, camDist], fov: 45, near: 1, far: 5000 }} shadows>
      <color attach="background" args={['#1a1d24']} />

      <ambientLight intensity={0.5} />
      <directionalLight
        position={[baseSize, baseSize * 1.5, baseSize * 0.6]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-baseSize}
        shadow-camera-right={baseSize}
        shadow-camera-top={baseSize}
        shadow-camera-bottom={-baseSize}
        shadow-camera-near={1}
        shadow-camera-far={baseSize * 4}
      />

      <Baseplate />
      <InstancedBricks />
      <PlacementCursor />

      <OrbitControls
        enableDamping
        dampingFactor={0.12}
        enablePan
        screenSpacePanning
        panSpeed={0.9}
        mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN }}
        touches={{ TWO: TOUCH.DOLLY_ROTATE }}
        minDistance={baseSize * 0.25}
        maxDistance={baseSize * 3}
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI / 2 - 0.05}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
