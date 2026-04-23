import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import { PhysicalCamera, usePathtracer } from '@react-three/gpu-pathtracer';
import { useEditorStore } from '../state/editorStore';

/**
 * Swap the raster PerspectiveCamera for three-gpu-pathtracer's
 * PhysicalCamera while in render mode. Enables finite-aperture depth
 * of field: PT samples a disc/polygon around the optical axis per
 * ray, producing real bokeh rather than a post-effect blur.
 *
 * Behaviour:
 *
 * 1. On mount, copy the raster camera's position / rotation / fov /
 *    near / far onto the PhysicalCamera props so the user sees the
 *    same viewpoint they were already looking at.
 *
 * 2. While mounted, the PhysicalCamera instance IS the R3F default
 *    camera (the wrapper calls `set({ camera: physCam })`). OrbitControls
 *    with `makeDefault` re-binds to it automatically.
 *
 * 3. Focus distance auto-tracks the OrbitControls target: we write
 *    `physCam.focusDistance = physCam.position.distanceTo(controls.target)`
 *    each frame. The path tracer picks up the new value on its next
 *    `updateCamera()` call — which the R3F wrapper already fires on
 *    every re-render and on every OrbitControls `change` event, so we
 *    don't need to trigger it ourselves.
 *
 * 4. When DoF is disabled we pass an absurdly high fStop (100) so the
 *    aperture collapses to a pinhole and the image is sharp. This lets
 *    us always mount PhysicalCamera during PT mode, avoiding the camera-
 *    swap jumpiness that toggling would cause.
 *
 * 5. On unmount, we copy the PhysicalCamera's current pose back onto
 *    the raster camera so the user's view doesn't snap back to where
 *    they started when they exit render mode.
 */

type ControlsLike = {
  target: Vector3;
};

// Pinhole-equivalent f-stop — the bokeh disc is so small it fits
// within a single sample and the output is visually indistinguishable
// from a perspective camera.
const DOF_DISABLED_FSTOP = 100;

// three-gpu-pathtracer's DoF shader scales the aperture sample by
// `bokehSize * 0.5 * 1e-3` — i.e. it assumes scene units are metres.
// Our scene is millimetres (1 stud = 8mm, camera distance ≈ 280mm),
// which makes the aperture 1000× smaller than the library expects
// against our distances — at f/1.4 the aperture disc works out to
// ~0.015mm, effectively a pinhole. Dividing the user-facing fStop
// by this scale puts the aperture back into the correct proportion
// to the scene without having to fork the library.
const SCENE_UNITS_PER_METER = 1000;

export function PathtracerCamera() {
  const rasterCamera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as ControlsLike | null;
  const { pathtracer } = usePathtracer();
  const dofEnabled = useEditorStore((s) => s.pathtracerDofEnabled);
  const fStop = useEditorStore((s) => s.pathtracerFStop);
  const apertureBlades = useEditorStore((s) => s.pathtracerApertureBlades);

  // Snapshot the raster camera's transform ONCE so subsequent prop
  // changes (DoF slider movement, etc.) don't reset the view.
  const initial = useRef<{
    position: [number, number, number];
    quaternion: [number, number, number, number];
    fov: number;
    near: number;
    far: number;
  } | null>(null);

  if (!initial.current) {
    const c = rasterCamera as PerspectiveCamera;
    initial.current = {
      position: [c.position.x, c.position.y, c.position.z],
      quaternion: [c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w],
      fov: c.fov ?? 45,
      near: c.near,
      far: c.far,
    };
  }

  // Copy the PhysicalCamera's final pose back to the raster camera on
  // unmount so exiting render mode doesn't teleport the user. The
  // PhysicalCamera instance is whatever is currently the R3F default
  // camera at unmount time — read via useThree in the cleanup closure.
  const get = useThree((s) => s.get);
  useEffect(() => {
    const rasterSnapshot = rasterCamera as PerspectiveCamera;
    return () => {
      const now = get().camera as PerspectiveCamera;
      if (now && now !== rasterSnapshot) {
        rasterSnapshot.position.copy(now.position);
        rasterSnapshot.quaternion.copy(now.quaternion);
        rasterSnapshot.updateMatrixWorld(true);
        rasterSnapshot.updateProjectionMatrix();
      }
    };
  }, [rasterCamera, get]);

  // Auto-focus: write focusDistance each frame from the active default
  // camera (the PhysicalCamera once the wrapper has mounted) to the
  // OrbitControls target. Writing every frame is fine — the PT only
  // reads focusDistance when updateCamera() runs, which happens on
  // controls-change and on prop-change events (handled by the R3F
  // wrapper). A no-controls fallback keeps us at a static distance.
  useFrame(({ camera }) => {
    if (!controls) return;
    const phys = camera as unknown as { focusDistance?: number; position: Vector3 };
    if (typeof phys.focusDistance !== 'number') return;
    phys.focusDistance = Math.max(1, phys.position.distanceTo(controls.target));
  });

  const effectiveFStop = dofEnabled ? fStop / SCENE_UNITS_PER_METER : DOF_DISABLED_FSTOP;

  // PhysicalCamera prop changes fire the library's updateCamera()
  // via its own useEffect, which normally calls reset(). But our
  // PathtracerStabilityPatch intercepts updateCamera() and skips
  // reset when the camera POSE is unchanged — which is exactly what
  // happens when the user drags the f-stop / aperture-shape slider
  // without moving the scene. Without an explicit reset here, the
  // accumulated samples keep rendering with the old DoF uniforms and
  // the slider looks dead. Reset on mount is redundant but harmless.
  useEffect(() => {
    (pathtracer as unknown as { reset: () => void }).reset();
  }, [pathtracer, dofEnabled, fStop, apertureBlades]);

  return (
    <PhysicalCamera
      position={initial.current.position}
      quaternion={initial.current.quaternion}
      fov={initial.current.fov}
      near={initial.current.near}
      far={initial.current.far}
      fStop={effectiveFStop}
      apertureBlades={apertureBlades}
    />
  );
}
