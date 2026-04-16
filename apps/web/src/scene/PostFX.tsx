import type { ReactElement } from 'react';
import { EffectComposer, N8AO, Bloom, SMAA } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

type Props = {
  ao: boolean;
  bloom: boolean;
  smaa: boolean;
};

/**
 * Post-processing chain assembled from individually toggleable effects.
 * - N8AO (ambient occlusion): soft contact shadows in stud gaps. The radius
 *   is tiny because LEGO geometry is millimetre-scale.
 * - Bloom: subtle highlight on bright saturated surfaces so clearcoat
 *   specular pops without blowing out the frame.
 * - SMAA: cheap post-filter anti-aliasing, much lighter than MSAA.
 *
 * enableNormalPass only runs when AO is on since it's the only consumer;
 * skipping it on Bloom/SMAA-only chains keeps the cost minimal.
 *
 * EffectComposer's children are typed as JSX.Element (not boolean), so we
 * assemble a filtered array instead of inlining `flag && <Effect/>`.
 */
export function PostFX({ ao, bloom, smaa }: Props) {
  const effects: ReactElement[] = [];
  if (ao) {
    effects.push(
      <N8AO
        key="ao"
        aoRadius={6}
        distanceFalloff={1.5}
        intensity={2}
        quality="medium"
        color="black"
      />,
    );
  }
  if (bloom) {
    effects.push(
      <Bloom
        key="bloom"
        luminanceThreshold={0.85}
        luminanceSmoothing={0.2}
        intensity={0.35}
        mipmapBlur
        blendFunction={BlendFunction.ADD}
      />,
    );
  }
  if (smaa) effects.push(<SMAA key="smaa" />);

  return (
    <EffectComposer multisampling={0} enableNormalPass={ao}>
      {effects}
    </EffectComposer>
  );
}
