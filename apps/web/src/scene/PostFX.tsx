import type { ReactElement } from 'react';
import { HalfFloatType } from 'three';
import { EffectComposer, N8AO, Bloom, SMAA } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

type Props = {
  ao: boolean;
  bloom: boolean;
  smaa: boolean;
};

/**
 * Post-processing chain assembled from individually toggleable effects.
 * - N8AO (ambient occlusion): soft contact shadows in stud gaps. Tiny
 *   radius — LEGO geometry is millimetre-scale.
 * - Bloom: subtle highlight on bright surfaces so clearcoat specular pops
 *   without blowing out the frame.
 * - SMAA: cheap post-filter anti-aliasing, much lighter than MSAA.
 *
 * enableNormalPass only runs when AO is on since it's the only consumer;
 * skipping it on Bloom/SMAA-only chains keeps the cost minimal.
 *
 * stencilBuffer + frameBufferType=HalfFloat fix a recurring Chrome
 * validation error — "GL_INVALID_OPERATION: glBlitFramebuffer: Read and
 * write depth stencil attachments cannot be the same image." — that
 * N8AO's normal-pass blit would trigger otherwise. Explicitly allocating
 * stencil on the composer's internal targets and switching the colour
 * attachment to half-float separates the ping-pong read/write buffers
 * enough that blits between them aren't flagged as self-copies.
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
    <EffectComposer
      multisampling={0}
      enableNormalPass={ao}
      stencilBuffer
      frameBufferType={HalfFloatType}
    >
      {effects}
    </EffectComposer>
  );
}
