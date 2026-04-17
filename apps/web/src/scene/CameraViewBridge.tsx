import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { claimPendingApply, claimPendingCapture } from '../state/cameraViewBus';

/**
 * Handle saved-view capture + apply requests from the UI. Lives inside
 * the Canvas so it has direct access to the camera + OrbitControls.
 *
 * Relies on `<OrbitControls makeDefault />` in Scene.tsx so
 * `useThree().controls` resolves to the drei OrbitControls instance,
 * giving us its `target` Vector3.
 */

const APPLY_DURATION_MS = 350;

type ApplyTween = {
  startedAt: number;
  fromPos: Vector3;
  fromTgt: Vector3;
  toPos: Vector3;
  toTgt: Vector3;
};

// drei's OrbitControls exposes `target: Vector3` but the base interface
// from @react-three/fiber types it as `EventDispatcher | null`. This
// matches only what we actually touch.
type ControlsLike = {
  target: Vector3;
  update: () => void;
};

export function CameraViewBridge() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as ControlsLike | null;
  const tween = useRef<ApplyTween | null>(null);

  useFrame(() => {
    // Capture — synchronous, no tween.
    const capture = claimPendingCapture();
    if (capture) {
      if (!controls) {
        capture(null);
      } else {
        capture({
          position: [camera.position.x, camera.position.y, camera.position.z],
          target: [controls.target.x, controls.target.y, controls.target.z],
        });
      }
    }

    // Apply — start a new tween if one was queued.
    const apply = claimPendingApply();
    if (apply && controls) {
      tween.current = {
        startedAt: performance.now(),
        fromPos: camera.position.clone(),
        fromTgt: controls.target.clone(),
        toPos: new Vector3(apply.position[0], apply.position[1], apply.position[2]),
        toTgt: new Vector3(apply.target[0], apply.target[1], apply.target[2]),
      };
    }

    // Advance an active tween.
    if (tween.current && controls) {
      const t = (performance.now() - tween.current.startedAt) / APPLY_DURATION_MS;
      if (t >= 1) {
        camera.position.copy(tween.current.toPos);
        controls.target.copy(tween.current.toTgt);
        controls.update();
        tween.current = null;
      } else {
        // easeInOutCubic
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        camera.position.lerpVectors(tween.current.fromPos, tween.current.toPos, e);
        controls.target.lerpVectors(tween.current.fromTgt, tween.current.toTgt, e);
        controls.update();
      }
    }
  });

  return null;
}
