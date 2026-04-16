import { EffectComposer, N8AO, Bloom, SMAA } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

/**
 * Post-processing chain for Ultra quality. Tuned for a "plastic toy" look:
 * - N8AO (ambient occlusion): soft contact shadows in stud gaps and under
 *   bricks. Radius is tiny because LEGO geometry is millimetre-scale.
 * - Bloom: subtle highlight on bright saturated surfaces so clearcoat
 *   specular pops without blowing out the frame.
 * - SMAA: cheap post-filter anti-aliasing, much lighter than MSAA on mobile.
 *
 * N8AO over classic SSAO because it handles the short, dense occluders of
 * a LEGO scene (studs, tubes) without the haloing that cheaper SSAO shows.
 */
export function PostFX() {
  return (
    <EffectComposer multisampling={0} enableNormalPass>
      <N8AO
        aoRadius={6}
        distanceFalloff={1.5}
        intensity={2}
        quality="medium"
        color="black"
      />
      <Bloom
        luminanceThreshold={0.85}
        luminanceSmoothing={0.2}
        intensity={0.35}
        mipmapBlur
        blendFunction={BlendFunction.ADD}
      />
      <SMAA />
    </EffectComposer>
  );
}
