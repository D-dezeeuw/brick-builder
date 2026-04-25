import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  Color,
  LinearToneMapping,
  type Material,
  MOUSE,
  NeutralToneMapping,
  PCFSoftShadowMap,
  type PerspectiveCamera,
  Quaternion,
  TOUCH,
  type ToneMapping,
  type WebGLRenderTarget,
} from 'three';
import { computeCacheKey, getCached } from './pathtraceCache';
import { PLATE_HEIGHT_MM, STUD_PITCH_MM } from '@brick/shared';
import { Baseplate } from './Baseplate';
import { CameraViewBridge } from './CameraViewBridge';
import { CaptureBridge } from './CaptureBridge';
import { IdleFreeze } from './IdleFreeze';
import { PlacementCursor } from './PlacementCursor';
import { ResourceBoundary } from './ResourceBoundary';
import { SelectionOverlay } from './SelectionOverlay';
import { InstancedBricks } from '../bricks/InstancedBricks';
import { useEditorStore } from '../state/editorStore';
import { useIdlePause } from '../state/useIdlePause';
import { setWooshSpeed } from '../state/wooshSound';
import { QUALITY_CONFIGS } from '../state/quality';
import { warmthToRgb } from './lightColor';
import { IS_MOBILE } from './ptPlatform';

// Tile count controls how the pathtracer subdivides each accumulation
// pass. Smaller tiles (higher count) = shorter per-frame GPU work, at
// the cost of slightly more per-tile sync overhead. The library's
// [3, 3] default is fine on desktop at full res but noticeably sluggish
// on mobile during orbit; bumping mobile to [5, 5] keeps the preview
// interactive without materially hurting throughput. Desktop [4, 4]
// gives a small interactivity win over the default with zero visible
// downside.
const PT_TILES: [number, number] = IS_MOBILE ? [5, 5] : [4, 4];

const TONE_MAPPING_ENUM: Record<
  'aces' | 'agx' | 'neutral' | 'linear',
  ToneMapping
> = {
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
  linear: LinearToneMapping,
};

// Heavy optional modules split out of the main bundle. Users on Low/Med with
// no post-fx and render mode off never pay the cost.
const PostFX = lazy(() => import('./PostFX').then((m) => ({ default: m.PostFX })));
const Pathtracer = lazy(() =>
  import('@react-three/gpu-pathtracer').then((m) => ({ default: m.Pathtracer })),
);
const ShapedAreaLight = lazy(() =>
  import('@react-three/gpu-pathtracer').then((m) => ({ default: m.ShapedAreaLight })),
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
const PathtracerBVHWorker = lazy(() =>
  import('./PathtracerBVHWorker').then((m) => ({ default: m.PathtracerBVHWorker })),
);
const PathtracerCamera = lazy(() =>
  import('./PathtracerCamera').then((m) => ({ default: m.PathtracerCamera })),
);
const PathtracerDenoise = lazy(() =>
  import('./PathtracerDenoise').then((m) => ({ default: m.PathtracerDenoise })),
);
const PathtracerConvergence = lazy(() =>
  import('./PathtracerConvergence').then((m) => ({ default: m.PathtracerConvergence })),
);
const CachedPathtraceView = lazy(() =>
  import('./CachedPathtraceView').then((m) => ({ default: m.CachedPathtraceView })),
);
const PathtracerStabilityPatch = lazy(() =>
  import('./PathtracerStabilityPatch').then((m) => ({ default: m.PathtracerStabilityPatch })),
);

const INITIAL_BASEPLATE_STUDS = 32;

export function Scene() {
  const quality = useEditorStore((s) => s.quality);
  const baseplateVisible = useEditorStore((s) => s.baseplateVisible);
  const lightIntensity = useEditorStore((s) => s.lightIntensity);
  const lightWarmth = useEditorStore((s) => s.lightWarmth);
  const envIntensity = useEditorStore((s) => s.envIntensity);
  const envRotation = useEditorStore((s) => s.envRotation);
  const envBackgroundVisible = useEditorStore((s) => s.envBackgroundVisible);
  const envBackgroundBlur = useEditorStore((s) => s.envBackgroundBlur);
  const envBackgroundIntensity = useEditorStore((s) => s.envBackgroundIntensity);
  const toneMapping = useEditorStore((s) => s.toneMapping);
  const aoEnabled = useEditorStore((s) => s.aoEnabled);
  const bloomEnabled = useEditorStore((s) => s.bloomEnabled);
  const smaaEnabled = useEditorStore((s) => s.smaaEnabled);
  const renderMode = useEditorStore((s) => s.renderMode);
  const pathtracerMaxSamples = useEditorStore((s) => s.pathtracerMaxSamples);
  const pathtracerEarlyStopAt = useEditorStore((s) => s.pathtracerEarlyStopAt);
  const pathtracerBounces = useEditorStore((s) => s.pathtracerBounces);
  const pathtracerResolutionScale = useEditorStore((s) => s.pathtracerResolutionScale);
  const pathtracerDofEnabled = useEditorStore((s) => s.pathtracerDofEnabled);
  const pathtracerFStop = useEditorStore((s) => s.pathtracerFStop);
  // Convergence monitor lowers the effective cap once the image stops
  // changing — saves users from over-sampling a scene that already
  // looks final. The monitor nulls this back out when the tracer
  // resets, so the cap re-opens for the next pose.
  const effectiveMaxSamples =
    pathtracerEarlyStopAt !== null
      ? Math.min(pathtracerMaxSamples, pathtracerEarlyStopAt)
      : pathtracerMaxSamples;
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

  // Raster DoF is only available at Ultra quality — the depth-prepass
  // + bokeh blur is a meaningful added cost and Ultra users already
  // opted into the heavier pipeline. Reuses the PT DoF toggle + f-stop
  // store fields so the user has a single set of "DoF" controls that
  // works in both rasterized and path-traced viewing.
  const dofRasterEligible = quality === 'ultra' && pathtracerDofEnabled;
  const anyPostFX = aoEnabled || bloomEnabled || smaaEnabled || dofRasterEligible;

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
              background={envBackgroundVisible}
              environmentIntensity={envIntensity}
              environmentRotation={[0, envRotation, 0]}
              backgroundBlurriness={envBackgroundBlur}
              backgroundIntensity={envBackgroundIntensity}
              backgroundRotation={[0, envRotation, 0]}
            />
          </Suspense>
        </ResourceBoundary>
      )}
      <ambientLight intensity={ambientBase * lightIntensity} color={lightColor} />
      {renderMode ? (
        // PT mode gets a rectangular area light instead of the
        // infinitesimal directional: finite-size emitter means soft
        // shadow penumbrae and plausible rect-kicker highlights on
        // plastic, which is the whole point of the PT view. Size +
        // intensity are calibrated so overall brightness roughly
        // matches the directional at the same lightIntensity slider
        // position; lookAt on mount aims the face at the origin
        // (RectAreaLight has no .target like DirectionalLight, so
        // orientation is baked via the onUpdate callback).
        <ShapedAreaLight
          position={[baseSize, baseSize * 1.5, baseSize * 0.6]}
          width={baseSize * 0.7}
          height={baseSize * 0.7}
          intensity={lightIntensity * 10}
          color={lightColor}
          onUpdate={(self: { lookAt: (x: number, y: number, z: number) => void }) =>
            self.lookAt(0, 0, 0)
          }
        />
      ) : (
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
      )}
      {renderMode && (
        // Emissive "contact-shadow floor" parked just under the
        // baseplate. three-gpu-pathtracer treats emissive surfaces as
        // area lights, so this gives downward-facing rays inside
        // transparent bricks a lit reference instead of returning raw
        // black when they TIR or escape the scene below. Kept low-
        // intensity so it doesn't flood the scene with uplight —
        // large-and-dim beats small-and-bright for this use case.
        <mesh
          position={[0, -PLATE_HEIGHT_MM - 2, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          frustumCulled={false}
        >
          <planeGeometry args={[baseSize * 10, baseSize * 10]} />
          <meshStandardMaterial
            color="#0a0a0a"
            emissive={lightColor}
            emissiveIntensity={0.15}
            roughness={1}
            metalness={0}
          />
        </mesh>
      )}
      {baseplateVisible && <Baseplate />}
      <InstancedBricks />
    </>
  );

  return (
    <Canvas
      camera={{ position: [camDist, camDist * 0.9, camDist], fov: 45, near: 1, far: 5000 }}
      shadows={{ type: PCFSoftShadowMap }}
      frameloop={active ? 'always' : 'never'}
      onCreated={({ gl }) => {
        // Halve the internal transmission render target — three.js
        // samples it to compute refraction for MeshPhysicalMaterial
        // with transmission. Half-res is visually imperceptible on
        // plastic-scale geometry and cuts the ping-pong blit cost
        // (and mitigates the EffectComposer depth-stencil overlap
        // warning when both systems share attachments).
        (gl as unknown as { transmissionResolutionScale?: number }).transmissionResolutionScale =
          0.5;
      }}
      gl={{
        // Initial tone-map op — ToneMappingBridge inside the Canvas
        // tracks later changes and invalidates existing material
        // programs so the chunk swap actually takes effect.
        toneMapping: TONE_MAPPING_ENUM[toneMapping] ?? ACESFilmicToneMapping,
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
          <PTRenderer
            effectiveMaxSamples={effectiveMaxSamples}
            bounces={pathtracerBounces}
            resolutionFactor={pathtracerResolutionScale}
            sceneContent={sceneContent}
          />
        </Suspense>
      ) : (
        <>
          {sceneContent}
          <PlacementCursor />
          <SelectionOverlay />
          {anyPostFX && (
            <Suspense fallback={null}>
              <PostFX
                ao={aoEnabled}
                bloom={bloomEnabled}
                smaa={smaaEnabled}
                dof={dofRasterEligible}
                fStop={pathtracerFStop}
              />
            </Suspense>
          )}
          {/* Grayscale freeze when going idle. Gated on rasterized mode
              because the path tracer already owns its own pause state. */}
          <IdleFreeze active={active} />
        </>
      )}

      <ToneMappingBridge />
      <CaptureBridge />
      <CameraViewBridge />
      <CameraWooshDriver />

      <OrbitControls
        makeDefault
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
 * Chooses between the live <Pathtracer> and a cached converged-output
 * quad each frame. Runs inside <Canvas> so useFrame + useThree see
 * the real camera (not the raw Scene.tsx render-time camera, which
 * doesn't exist yet). State is initialised lazily from the current
 * camera pose so that a cache hit on PT-mode entry skips mounting
 * <Pathtracer> entirely — no BVH build, no flash, instant display.
 *
 * The cached buffer is module-owned (see pathtraceCache.ts). We pass
 * around a render-target reference, not a texture, because the cache
 * owns the RT's lifecycle and we just read from it.
 */
type PTRendererProps = {
  effectiveMaxSamples: number;
  bounces: number;
  resolutionFactor: number;
  sceneContent: React.ReactNode;
};

function PTRenderer({
  effectiveMaxSamples,
  bounces,
  resolutionFactor,
  sceneContent,
}: PTRendererProps) {
  const camera = useThree((s) => s.camera);
  const [cachedTarget, setCachedTarget] = useState<WebGLRenderTarget | null>(() =>
    getCached(computeCacheKey(camera as PerspectiveCamera, resolutionFactor)),
  );
  const lastKey = useRef<string>('');

  useFrame(() => {
    const key = computeCacheKey(camera as PerspectiveCamera, resolutionFactor);
    if (key === lastKey.current) return;
    lastKey.current = key;
    const hit = getCached(key);
    setCachedTarget((prev) => (prev === hit ? prev : hit));
  });

  if (cachedTarget) {
    return <CachedPathtraceView target={cachedTarget} />;
  }
  return (
    <Pathtracer
      minSamples={Math.min(4, effectiveMaxSamples)}
      samples={effectiveMaxSamples}
      bounces={bounces}
      tiles={PT_TILES}
      resolutionFactor={resolutionFactor}
      filteredGlossyFactor={0.5}
      renderDelay={250}
      fadeDuration={300}
      enabled
    >
      {sceneContent}
      <PathtracerBVHWorker />
      <PathtracerCamera />
      <PathtracingExpansion />
      <PathtracerSampleReporter />
      <PathtracerConvergence />
      <PathtracerStabilityPatch />
      <PathtracerBusBridge />
      <PathtracerDenoise />
    </Pathtracer>
  );
}

/**
 * Applies store-driven tone-mapping changes to the live renderer.
 *
 * three.js compiles the tone-map chunk into every material's program
 * at first-use; later changes to `renderer.toneMapping` don't retro-
 * actively re-link cached programs. We force re-link by traversing
 * the scene and flipping `needsUpdate` on each material. The cost is
 * real but rare (only on picker change), and avoids a Canvas remount
 * that would reset the camera pose and the pathtrace cache.
 *
 * Caveat: the pathtracer's internal display material lives outside
 * our scene graph, so an in-PT-mode switch won't re-encode until the
 * user exits and re-enters render mode. The initial `gl` prop on
 * <Canvas> seeds the correct tone-map for the session's first PT
 * entry, so most users never see the stale case.
 */
function ToneMappingBridge() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const toneMapping = useEditorStore((s) => s.toneMapping);

  useEffect(() => {
    gl.toneMapping = TONE_MAPPING_ENUM[toneMapping] ?? ACESFilmicToneMapping;
    scene.traverse((obj) => {
      const m = (obj as { material?: Material | Material[] }).material;
      if (!m) return;
      const mats = Array.isArray(m) ? m : [m];
      for (const mat of mats) mat.needsUpdate = true;
    });
  }, [gl, scene, toneMapping]);

  return null;
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
