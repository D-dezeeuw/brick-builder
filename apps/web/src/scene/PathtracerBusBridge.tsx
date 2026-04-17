import { useEffect } from 'react';
import { usePathtracer } from '@react-three/gpu-pathtracer';
import { setActivePathtracer, type PathtracerHandle } from '../state/pathtracerBus';

/**
 * Publishes the active pathtracer instance to a module-level bus so
 * CaptureBridge (mounted outside the Pathtracer context) can read the
 * accumulated render target for PNG export. Mounted as a Pathtracer child
 * so usePathtracer() has context.
 */
export function PathtracerBusBridge() {
  const { pathtracer } = usePathtracer();

  useEffect(() => {
    // Cast via unknown — we only use samples + target and don't want to
    // pull the WebGLPathTracer type from three-gpu-pathtracer into our
    // surface area.
    setActivePathtracer(pathtracer as unknown as PathtracerHandle);
    return () => setActivePathtracer(null);
  }, [pathtracer]);

  return null;
}
