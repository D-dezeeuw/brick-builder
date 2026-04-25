import { type ReactElement } from 'react';
import { HalfFloatType, type Vector3 } from 'three';
import { useThree } from '@react-three/fiber';
import { EffectComposer, N8AO, Bloom, SMAA, DepthOfField } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

type Props = {
  ao: boolean;
  bloom: boolean;
  smaa: boolean;
  dof: boolean;
  /** F-stop value from the shared store (1.4–22). Mapped to bokehScale below. */
  fStop: number;
};

// Inverse-ish mapping from photographic f-stop to the postprocessing
// library's bokehScale (a free multiplier on the blur radius). At f/1.4
// we want a noticeable blur on out-of-focus bricks; at f/22 it should
// effectively collapse to a sharp image. The constants were tuned by
// eye against a 32-stud baseplate camera distance.
function fStopToBokehScale(fStop: number): number {
  return Math.max(0.2, Math.min(8, 10 / fStop));
}

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
export function PostFX({ ao, bloom, smaa, dof, fStop }: Props) {
  // OrbitControls target is the focus point — same convention the PT
  // path uses via PhysicalCamera. DoF reads `target` each frame and
  // computes focusDistance from it, so the focus tracks whatever the
  // user is orbiting around.
  const controls = useThree((s) => s.controls) as { target: Vector3 } | null;

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
  if (dof && controls) {
    effects.push(
      <DepthOfField
        key="dof"
        target={controls.target}
        // worldFocusRange in scene units — bricks within this distance
        // of the focus point stay sharp, then blur ramps. 50mm ≈ a few
        // stud pitches, plenty for foreground/background separation
        // without making everything mid-distance also soft.
        worldFocusRange={50}
        bokehScale={fStopToBokehScale(fStop)}
        height={480}
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
