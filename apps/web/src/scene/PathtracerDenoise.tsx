import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Uniform,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { usePathtracer } from '@react-three/gpu-pathtracer';
import { useEditorStore } from '../state/editorStore';
import { setDenoiseTexture } from '../state/denoiseBus';

/**
 * Post-convergence denoise pass.
 *
 * three-gpu-pathtracer's accumulator still has visible speckle at our
 * sample counts (1–128). Once `samples >= maxSamples`, this component
 * runs a 3-iteration À-Trous wavelet filter — step sizes 1, 2, 4 —
 * over the HDR accumulator. Each iteration is a 5×5 edge-aware (à la
 * bilateral) blur with the taps spaced by the step. The three iterations
 * combined cover a 17×17 neighbourhood while only sampling 75 pixels per
 * output, and the edge-preserving weights keep brick rims crisp.
 *
 * Flow per frame after convergence:
 *   Pass 1:  HDR PT target --[bilateral step=1 + ACES tonemap]--> A
 *   Pass 2:  A --[bilateral step=2]--> B
 *   Pass 3:  B --[bilateral step=4]--> A
 *   Display: A --[linear→sRGB encode]--> canvas
 *
 * Passes 2 and 3 operate in LDR linear space (values already mapped
 * to [0,1] by pass 1's ACES) — sigmaColor is calibrated for that range.
 *
 * Colour-space notes:
 *   - Targets use the default NoColorSpace. Bilateral writes linear
 *     tone-mapped values; identity shader encodes to sRGB just before
 *     writing to the canvas framebuffer.
 *   - We avoid the three.js shader chunks `<tonemapping_pars_fragment>`
 *     and `<colorspace_pars_fragment>` — ShaderMaterial in 0.171 has
 *     the colorspace pars auto-prepended, and `<tonemapping_pars_fragment>`
 *     only defines `toneMapping()` when `material.toneMapped=true`. The
 *     combination of both would either duplicate function bodies or miss
 *     the tone-mapping entry point, which is exactly how the previous
 *     version failed to compile (went black after convergence).
 *   - ACES is Narkowicz's 2015 fit — visually indistinguishable from
 *     three.js's ACESFilmicToneMapping at the exposure we use (1.0).
 *
 * useFrame priority=1 ensures these passes run *after* the tracer's own
 * display pass (priority=0), so our blit overwrites the canvas in the
 * same frame. Before convergence the component no-ops; the raw tracer
 * output stays on screen so users can watch it build.
 */
export function PathtracerDenoise() {
  const { pathtracer } = usePathtracer();
  const size = useThree((s) => s.size);
  const maxSamples = useEditorStore((s) => s.pathtracerMaxSamples);

  const { scene, camera, bilateral, identity } = useMemo(() => buildRig(), []);

  // Ping-pong pair. Final À-Trous output always lands in targetA.
  const targetA = useMemo(() => new WebGLRenderTarget(1, 1), []);
  const targetB = useMemo(() => new WebGLRenderTarget(1, 1), []);

  // Keep targets + uniform resolution in sync with the canvas.
  useEffect(() => {
    const w = Math.max(1, size.width);
    const h = Math.max(1, size.height);
    targetA.setSize(w, h);
    targetB.setSize(w, h);
    bilateral.uniforms.uResolution.value.set(w, h);
  }, [size, targetA, targetB, bilateral]);

  useEffect(() => {
    return () => {
      targetA.dispose();
      targetB.dispose();
      bilateral.dispose();
      identity.dispose();
      scene.children[0]?.traverse?.((o) => {
        if ('geometry' in o) (o as Mesh).geometry?.dispose();
      });
      setDenoiseTexture(null);
    };
  }, [targetA, targetB, bilateral, identity, scene]);

  const publishedRef = useRef(false);

  useFrame(({ gl: renderer }) => {
    const tracer = pathtracer as unknown as {
      samples: number;
      target: { texture: unknown };
    };
    if (!tracer?.target) return;
    const samples = tracer.samples ?? 0;
    if (samples < maxSamples) {
      // Pre-convergence: let the raw tracer output through. Clear any
      // stale denoise texture reference the screenshot bus might hold.
      if (publishedRef.current) {
        publishedRef.current = false;
        setDenoiseTexture(null);
      }
      return;
    }

    const mesh = scene.children[0] as Mesh;
    const prev = renderer.getRenderTarget();
    mesh.material = bilateral;

    // À-Trous iteration 1: HDR PT target → A, step=1, tone-map on write.
    bilateral.uniforms.uInput.value = tracer.target.texture;
    bilateral.uniforms.uStep.value = 1;
    bilateral.uniforms.uToneMap.value = 1;
    renderer.setRenderTarget(targetA);
    renderer.render(scene, camera);

    // Iteration 2: A → B, step=2, pass-through (already tone-mapped).
    bilateral.uniforms.uInput.value = targetA.texture;
    bilateral.uniforms.uStep.value = 2;
    bilateral.uniforms.uToneMap.value = 0;
    renderer.setRenderTarget(targetB);
    renderer.render(scene, camera);

    // Iteration 3: B → A, step=4.
    bilateral.uniforms.uInput.value = targetB.texture;
    bilateral.uniforms.uStep.value = 4;
    bilateral.uniforms.uToneMap.value = 0;
    renderer.setRenderTarget(targetA);
    renderer.render(scene, camera);

    // Display: A → canvas, applying sRGB encode on the way out. Canvas
    // framebuffer is sRGB so without the encode the image would display
    // dark.
    mesh.material = identity;
    identity.uniforms.uInput.value = targetA.texture;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    // Cleanup + restore.
    renderer.setRenderTarget(prev);
    bilateral.uniforms.uInput.value = null;
    identity.uniforms.uInput.value = null;

    if (!publishedRef.current) {
      publishedRef.current = true;
      setDenoiseTexture(targetA.texture);
    }
  }, 1);

  return null;
}

function buildRig() {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const vertexShader = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  // Shared GLSL helpers — Narkowicz ACES + Linear→sRGB. No three.js
  // chunk includes (see class comment).
  const helpers = /* glsl */ `
    vec3 acesFilmic(vec3 x) {
      const float a = 2.51;
      const float b = 0.03;
      const float c = 2.43;
      const float d = 0.59;
      const float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    vec3 linearToSRGB(vec3 c) {
      c = clamp(c, 0.0, 1.0);
      bvec3 cutoff = lessThanEqual(c, vec3(0.0031308));
      vec3 low = c * 12.92;
      vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
      return mix(high, low, vec3(cutoff));
    }
  `;

  // 5×5 edge-aware blur, reused across À-Trous iterations. `uStep`
  // controls the spacing between taps — 1, 2, 4 in successive passes
  // gives an effective 17×17 kernel while sampling only 25 pixels per
  // output. `uToneMap` is 1 on the first iteration (reads HDR accumulator,
  // writes tone-mapped LDR) and 0 on later iterations (data's already
  // mapped to [0,1]).
  const bilateral = new ShaderMaterial({
    uniforms: {
      uInput: new Uniform(null),
      uResolution: new Uniform(new Vector2(1, 1)),
      uSigmaSpatial: new Uniform(2.0),
      uSigmaColor: new Uniform(0.2),
      uStep: new Uniform(1),
      uToneMap: new Uniform(1),
    },
    vertexShader,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uInput;
      uniform vec2 uResolution;
      uniform float uSigmaSpatial;
      uniform float uSigmaColor;
      uniform float uStep;
      uniform float uToneMap;
      varying vec2 vUv;

      ${helpers}

      void main() {
        vec2 texel = uStep / uResolution;
        vec3 center = texture2D(uInput, vUv).rgb;
        vec3 sum = vec3(0.0);
        float totalWeight = 0.0;
        const int R = 2;
        for (int dx = -R; dx <= R; dx++) {
          for (int dy = -R; dy <= R; dy++) {
            vec2 offset = vec2(float(dx), float(dy)) * texel;
            vec3 s = texture2D(uInput, vUv + offset).rgb;
            float sd2 = float(dx * dx + dy * dy);
            float spatial = exp(-sd2 / (2.0 * uSigmaSpatial * uSigmaSpatial));
            vec3 cd = s - center;
            float cd2 = dot(cd, cd);
            float color = exp(-cd2 / (2.0 * uSigmaColor * uSigmaColor));
            float w = spatial * color;
            sum += s * w;
            totalWeight += w;
          }
        }
        vec3 denoised = sum / max(totalWeight, 1e-6);
        if (uToneMap > 0.5) denoised = acesFilmic(denoised);
        gl_FragColor = vec4(denoised, 1.0);
      }
    `,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });

  // Display pass: sample the denoise target (linear tone-mapped) and
  // apply the sRGB transfer so the canvas framebuffer shows the right
  // brightness. ShaderMaterial doesn't auto-inject the colorspace
  // encode, so we do it manually.
  const identity = new ShaderMaterial({
    uniforms: { uInput: new Uniform(null) },
    vertexShader,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uInput;
      varying vec2 vUv;

      ${helpers}

      void main() {
        vec3 c = texture2D(uInput, vUv).rgb;
        gl_FragColor = vec4(linearToSRGB(c), 1.0);
      }
    `,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new Mesh(new PlaneGeometry(2, 2), bilateral);
  scene.add(mesh);

  return { scene, camera, bilateral, identity };
}
