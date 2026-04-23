import { useEffect } from 'react';
import { Quaternion, Vector3 } from 'three';
import { usePathtracer } from '@react-three/gpu-pathtracer';

/**
 * Keeps the pathtracer from resetting on damping tails and other
 * sub-intent OrbitControls 'change' events.
 *
 * three-gpu-pathtracer's `updateCamera()` unconditionally calls
 * `reset()`, wiping sample accumulation. The R3F wrapper hooks a
 * listener to OrbitControls' 'change' event that invokes
 * `updateCamera()` on every emit — which, with `enableDamping`,
 * includes every frame of the decay after even a one-pixel drag.
 * End result: any mouse interaction restarts convergence.
 *
 * We patch `updateCamera` on the pathtracer instance so it skips
 * `reset()` when the camera pose delta since the last call is
 * below a small threshold. Real orbits exceed the threshold and
 * reset normally; damping residue, hover-jitter, and sub-pixel
 * touchpad drift no longer throw away the accumulated samples.
 *
 * Thresholds:
 * - 0.25mm is well under a stud pitch (8mm) and ~10× the worst
 *   OrbitControls damping residual we saw in practice. A real orbit
 *   always exceeds it.
 * - 0.05° (≈0.873mrad) is similarly below anything a user perceives
 *   as intent, comfortably above numeric noise.
 *
 * The listener's closure looks up `e.updateCamera` at event-fire
 * time (late binding), so method replacement on the instance
 * propagates without needing to rebind the listener.
 */
const POS_THRESHOLD_MM = 0.25;
const ROT_THRESHOLD_RAD = (0.05 * Math.PI) / 180;
const POS_THRESHOLD_SQ = POS_THRESHOLD_MM * POS_THRESHOLD_MM;

export function PathtracerStabilityPatch() {
  const { pathtracer } = usePathtracer();

  useEffect(() => {
    const pt = pathtracer as unknown as {
      camera: {
        position: Vector3;
        quaternion: Quaternion;
        updateMatrixWorld: () => void;
      };
      updateCamera: () => void;
    };
    const original = pt.updateCamera.bind(pt);
    const lastPos = new Vector3();
    const lastQuat = new Quaternion();
    let initialized = false;

    pt.updateCamera = function patched(): void {
      const cam = pt.camera;
      if (initialized) {
        const posDelta = cam.position.distanceToSquared(lastPos);
        const rotDelta = lastQuat.angleTo(cam.quaternion);
        if (posDelta < POS_THRESHOLD_SQ && rotDelta < ROT_THRESHOLD_RAD) {
          // Keep matrixWorld current so anything reading it sees the
          // latest micro-pose, but skip the sample-wiping reset().
          cam.updateMatrixWorld();
          return;
        }
      }
      lastPos.copy(cam.position);
      lastQuat.copy(cam.quaternion);
      initialized = true;
      original();
    };

    return () => {
      pt.updateCamera = original;
    };
  }, [pathtracer]);

  return null;
}
