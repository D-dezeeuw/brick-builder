import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useRef } from 'react';
import type { Mesh } from 'three';

function SpinningCube() {
  const ref = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.x += dt * 0.4;
    ref.current.rotation.y += dt * 0.6;
  });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#e53935" />
    </mesh>
  );
}

export function Scene() {
  return (
    <Canvas camera={{ position: [3, 3, 3], fov: 50 }} shadows>
      <color attach="background" args={['#1a1d24']} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={1.0} castShadow />
      <SpinningCube />
      <OrbitControls enableDamping dampingFactor={0.1} />
    </Canvas>
  );
}
