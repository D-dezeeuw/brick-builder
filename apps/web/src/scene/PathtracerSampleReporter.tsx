import { useFrame } from '@react-three/fiber';
import { usePathtracer } from '@react-three/gpu-pathtracer';
import { useEditorStore } from '../state/editorStore';

/**
 * Mounted inside <Pathtracer> so usePathtracer() can reach its context.
 * Each frame, copies the underlying tracer's sample count into the store
 * so the DOM overlay can display convergence progress. Keeps the renderer
 * untouched — strictly a read.
 */
export function PathtracerSampleReporter() {
  const { pathtracer } = usePathtracer();
  const setSamples = useEditorStore.getState().setPathtracerSamples;

  useFrame(() => {
    const n = pathtracer.samples ?? 0;
    const store = useEditorStore.getState();
    if (store.pathtracerSamples !== n) setSamples(n);
  });

  return null;
}
