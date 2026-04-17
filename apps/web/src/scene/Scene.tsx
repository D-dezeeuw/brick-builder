import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { ACESFilmicToneMapping, Color, MOUSE, PCFSoftShadowMap, Quaternion, TOUCH } from 'three';
import { STUD_PITCH_MM } from '@brick/shared';
import { Baseplate } from './Baseplate';
import { CaptureBridge } from './CaptureBridge';
import { IdleFreeze } from './IdleFreeze';
import { PlacementCursor } from './PlacementCursor';
import { ResourceBoundary } from './ResourceBoundary';
import { InstancedBricks } from '../bricks/InstancedBricks';
import { useEditorStore } from '../state/editorStore';
import { useIdlePause } from '../state/useIdlePause';
import { setWooshSpeed } from '../state/wooshSound';
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
const PathtracerBusBridge = lazy(() =>
  import('./PathtracerBusBridge').then((m) => ({ default: m.PathtracerBusBridge })),
);
const PathtracingExpansion = lazy(() =>
  import('./PathtracingExpansion').then((m) => ({ default: m.PathtracingExpansion })),
);
const PathtracerDenoise = lazy(() =>
  import('./PathtracerDenoise').then((m) => ({ default: m.PathtracerDenoise })),
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
  const pathtracerMaxSamples = useEditorStore((s) => s.pathtracerMaxSamples);
  // When the user has been idle long enough, cut the rAF loop entirely
  // so GPU/CPU go to ~zero until the next input or store change. The
  // last rendered frame stays visible on the canvas — no visible
  // change to the user unless they notice the fan stop.
  const active = useIdlePause();
  const config = QUALITY_CONFIGS[quality];

  const lightColor = useMemo(() => {
    const [r, g, b] = warmthToRgb(lightWarmth);
    return new Color(r, g, b);
  }, [lightWarmth]);

  // Spacebar-hold temporarily swaps the left mouse button from orbit to pan,
  // matching the Blender / Figma convention. Ignored while typing into a
  // form field so the title editor and password inputs aren't affected.
  // A body-level class drives the "grabbing" cursor so the feedback shows
  // up regardless of whether the pointer is over the canvas or a UI overlay.
  const [spaceHeld, setSpaceHeld] = useState(false);
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      setSpaceHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      setSpaceHeld(false);
    };
    const onBlur = () => setSpaceHeld(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  useEffect(() => {
    document.body.classList.toggle('space-panning', spaceHeld);
    return () => document.body.classList.remove('space-panning');
  }, [spaceHeld]);

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
        // Self-hosted HDRI — drei's `preset="studio"` fetches from
        // raw.githack.com, which rate-limited us out with 403s and took
        // the whole Canvas down (the loader error bubbled to
        // SceneErrorBoundary). Local file removes the external dep; the
        // ResourceBoundary + inner Suspense swallow any future load
        // failure so the scene degrades to direct lights instead of
        // crashing. BASE_URL handles the Pages subpath (`/brick-builder/`)
        // transparently.
        <ResourceBoundary name="environment">
          <Suspense fallback={null}>
            <Environment
              files={`${import.meta.env.BASE_URL}hdri/studio_small.hdr`}
              background={false}
              environmentIntensity={envIntensity}
            />
          </Suspense>
        </ResourceBoundary>
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
      frameloop={active ? 'always' : 'never'}
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
        // preserveDrawingBuffer was tempting for PNG export but when combined
        // with N8AO's normal-pass blit it resurfaced the same GL error above.
        // PNG export instead uses an offscreen render-to-target + readPixels
        // (see state/captureBus.ts + scene/CaptureBridge.tsx), which works
        // regardless of drawing-buffer preservation.
      }}
    >
      <color attach="background" args={['#1a1d24']} />

      {renderMode ? (
        <Suspense fallback={null}>
          {/* `samples` is the max accumulated — once reached, the tracer
              stops and the GPU goes idle. User-configurable via the
              slider in the settings modal; 32 by default, bounded to
              1–128 in the store. minSamples is clamped so low maxes
              don't wedge the tracer in a pre-display state. */}
          <Pathtracer
            minSamples={Math.min(4, pathtracerMaxSamples)}
            samples={pathtracerMaxSamples}
            bounces={3}
            enabled
          >
            {sceneContent}
            <PathtracingExpansion />
            <PathtracerSampleReporter />
            <PathtracerBusBridge />
            <PathtracerDenoise />
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
          {/* Grayscale freeze when going idle. Gated on rasterized mode
              because the path tracer already owns its own pause state. */}
          <IdleFreeze active={active} />
        </>
      )}

      <CaptureBridge />
      <CameraWooshDriver />

      <OrbitControls
        enableDamping
        dampingFactor={0.12}
        enablePan
        screenSpacePanning
        panSpeed={0.9}
        mouseButtons={{ LEFT: spaceHeld ? MOUSE.PAN : MOUSE.ROTATE, MIDDLE: MOUSE.PAN }}
        // One finger orbits, two fingers pan + pinch-zoom. Matches the
        // convention touch users expect from Figma / SketchUp / Google Maps
        // and keeps placement-tap behaviour unambiguous on mobile.
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
        minDistance={baseSize * 0.25}
        maxDistance={baseSize * 3}
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI / 2 - 0.05}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}

/**
 * Samples camera angular velocity each frame and feeds it to the
 * woosh synth. Uses quaternion distance (not Euler deltas) so roll
 * + yaw + pitch all contribute cleanly to one scalar speed.
 * Exponentially smoothed so fast-paced damping doesn't buzz.
 *
 * Mounted inside the Canvas so useFrame has a renderer + clock.
 */
function CameraWooshDriver() {
  const last = useRef<Quaternion>(new Quaternion());
  const initialized = useRef(false);
  const smoothed = useRef(0);
  useFrame((state, dt) => {
    const q = state.camera.quaternion;
    if (!initialized.current) {
      last.current.copy(q);
      initialized.current = true;
      return;
    }
    const angle = last.current.angleTo(q);
    last.current.copy(q);
    const safeDt = Math.max(dt, 1 / 240);
    const instantaneous = angle / safeDt;
    // EMA α ≈ 0.25 → short reaction time without jitter spikes.
    smoothed.current = 0.25 * instantaneous + 0.75 * smoothed.current;
    setWooshSpeed(smoothed.current);
  });
  return null;
}
