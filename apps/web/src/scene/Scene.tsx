import { lazy, Suspense, useMemo } from 'react';
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

// Heavy optional modules split out of the main bundle. Users on Low/Med with
// no post-fx and render mode off never pay the cost.
const PostFX = lazy(() => import('./PostFX').then((m) => ({ default: m.PostFX })));
const Pathtracer = lazy(() =>
  import('@react-three/gpu-pathtracer').then((m) => ({ default: m.Pathtracer })),
);
const PathtracerSampleReporter = lazy(() =>
  import('./PathtracerSampleReporter').then((m) => ({ default: m.PathtracerSampleReporter })),
);
const PathtracingExpansion = lazy(() =>
  import('./PathtracingExpansion').then((m) => ({ default: m.PathtracingExpansion })),
);

const INITIAL_BASEPLATE_STUDS = 32;

export function Scene() {
  const quality = useEditorStore((s) => s.quality);
  const lightIntensity = useEditorStore((s) => s.lightIntensity);
  const lightWarmth = useEditorStore((s) => s.lightWarmth);
  const envIntensity = useEditorStore((s) => s.envIntensity);
  const aoEnabled = useEditorStore((s) => s.aoEnabled);
  const bloomEnabled = useEditorStore((s) => s.bloomEnabled);
  const smaaEnabled = useEditorStore((s) => s.smaaEnabled);
  const renderMode = useEditorStore((s) => s.renderMode);
  const config = QUALITY_CONFIGS[quality];

  const lightColor = useMemo(() => {
    const [r, g, b] = warmthToRgb(lightWarmth);
    return new Color(r, g, b);
  }, [lightWarmth]);

  const baseSize = INITIAL_BASEPLATE_STUDS * STUD_PITCH_MM;
  const camDist = baseSize * 1.1;
  const envContribution = config.useEnvironment ? envIntensity : 0;
  const ambientBase = Math.max(0.15, 0.5 - 0.35 * envContribution);

  const anyPostFX = aoEnabled || bloomEnabled || smaaEnabled;

  // Scene content shared between rasterized and path-traced paths. Pathtracer
  // wraps it to path-trace everything inside (lights, env map, bricks, plate).
  const sceneContent = (
    <>
      {config.useEnvironment && envIntensity > 0 && (
        <Environment preset="studio" background={false} environmentIntensity={envIntensity} />
      )}
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
    </>
  );

  return (
    <Canvas
      camera={{ position: [camDist, camDist * 0.9, camDist], fov: 45, near: 1, far: 5000 }}
      shadows={{ type: PCFSoftShadowMap }}
      gl={{
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
        // postprocessing's internal render targets don't use stencil, and
        // MSAA resolves fight N8AO's normal-pass blit. Mismatched attachments
        // trigger "GL_INVALID_OPERATION: glBlitFramebuffer: Read and write
        // depth stencil attachments cannot be the same image." Let the effect
        // chain (SMAA) handle anti-aliasing.
        stencil: false,
        antialias: false,
        // Required so Export → PNG can read the drawing buffer from a button
        // click (the compositor clears it after each frame otherwise). Small
        // perf cost; the export UX outweighs it.
        preserveDrawingBuffer: true,
      }}
    >
      <color attach="background" args={['#1a1d24']} />

      {renderMode ? (
        <Suspense fallback={null}>
          {/* `samples` is the max accumulated — once reached, the tracer
              stops and the GPU goes idle. 64 is the sweet spot for this
              scale of geometry: near-clean image, no runaway battery drain. */}
          <Pathtracer minSamples={4} samples={64} bounces={3} enabled>
            {sceneContent}
            <PathtracingExpansion />
            <PathtracerSampleReporter />
          </Pathtracer>
        </Suspense>
      ) : (
        <>
          {sceneContent}
          <PlacementCursor />
          {anyPostFX && (
            <Suspense fallback={null}>
              <PostFX ao={aoEnabled} bloom={bloomEnabled} smaa={smaaEnabled} />
            </Suspense>
          )}
        </>
      )}

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
