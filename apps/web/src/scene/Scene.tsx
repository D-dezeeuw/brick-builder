import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { ACESFilmicToneMapping, Color, MOUSE, PCFSoftShadowMap, TOUCH } from 'three';
import { STUD_PITCH_MM } from '@brick/shared';
import { Baseplate } from './Baseplate';
import { PlacementCursor } from './PlacementCursor';
import { InstancedBricks } from '../bricks/InstancedBricks';
import { useEditorStore } from '../state/editorStore';
import { QUALITY_CONFIGS } from '../state/quality';
import { warmthToRgb } from './lightColor';

// Camera framing — sized for the initial 32×32 baseplate; OrbitControls zoom
// range keeps the view usable as the baseplate grows in 16-stud chunks.
const INITIAL_BASEPLATE_STUDS = 32;

export function Scene() {
  const quality = useEditorStore((s) => s.quality);
  const lightIntensity = useEditorStore((s) => s.lightIntensity);
  const lightWarmth = useEditorStore((s) => s.lightWarmth);
  const config = QUALITY_CONFIGS[quality];

  const lightColor = useMemo(() => {
    const [r, g, b] = warmthToRgb(lightWarmth);
    return new Color(r, g, b);
  }, [lightWarmth]);

  const baseSize = INITIAL_BASEPLATE_STUDS * STUD_PITCH_MM;
  const camDist = baseSize * 1.1;
  // Ambient follows warmth too so the overall cast feels coherent, but
  // stays dimmer when the env map is carrying indirect light.
  const ambientBase = config.useEnvironment ? 0.15 : 0.5;

  return (
    <Canvas
      camera={{ position: [camDist, camDist * 0.9, camDist], fov: 45, near: 1, far: 5000 }}
      shadows={{ type: PCFSoftShadowMap }}
      gl={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
    >
      <color attach="background" args={['#1a1d24']} />

      {/* Environment map for IBL on medium+. background={false} keeps our dark backdrop. */}
      {config.useEnvironment && <Environment preset="studio" background={false} environmentIntensity={0.8} />}

      {/* Ambient is reduced when the env map is carrying indirect light. */}
      <ambientLight intensity={ambientBase * lightIntensity} color={lightColor} />
      <directionalLight
        position={[baseSize, baseSize * 1.5, baseSize * 0.6]}
        intensity={lightIntensity}
        color={lightColor}
        castShadow
        shadow-mapSize-width={config.shadowMapSize}
        shadow-mapSize-height={config.shadowMapSize}
        shadow-camera-left={-baseSize}
        shadow-camera-right={baseSize}
        shadow-camera-top={baseSize}
        shadow-camera-bottom={-baseSize}
        shadow-camera-near={1}
        shadow-camera-far={baseSize * 4}
        shadow-bias={-0.0005}
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
