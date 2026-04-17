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
 * runs a single 5×5 bilateral filter over the HDR accumulator — edge-
 * preserving blur that smooths flat regions without softening brick
 * edges — and draws the result to the canvas, replacing the raw
 * tracer output.
 *
 * Flow per frame after convergence:
 *   1. Bilateral pass:   HDR PT target --[bilateral + ACES tonemap]--> denoise target (linear)
 *   2. Display blit:     denoise target --[linear→sRGB encode]--> canvas
 *
 * A previous revision wrapped three À-Trous iterations (steps 1/2/4)
 * but over-smoothed: the 17×17 effective reach crushed fine surface
 * detail. Dropped back to the single 5×5 pass — cleans the worst of
 * the speckle without blurring anything visible.
 *
 * Colour-space notes:
 *   - Target keeps the default NoColorSpace. Bilateral writes linear
 *     tone-mapped values; identity shader encodes to sRGB just before
 *     writing to the canvas framebuffer.
 *   - We avoid the three.js shader chunks `<tonemapping_pars_fragment>`
 *     and `<colorspace_pars_fragment>` — ShaderMaterial in 0.171 has
 *     the colorspace pars auto-prepended, and `<tonemapping_pars_fragment>`
 *     only defines `toneMapping()` when `material.toneMapped=true`.
 *   - ACES is Narkowicz's 2015 fit — visually indistinguishable from
 *     three.js's ACESFilmicToneMapping at the exposure we use (1.0).
 *
 * useFrame priority=1 ensures both passes run *after* the tracer's own
 * display pass (priority=0), so our blit overwrites the canvas in the
 * same frame. Before convergence the component no-ops; the raw tracer
 * output stays on screen so users can watch it build.
 */
export function PathtracerDenoise() {
  const { pathtracer } = usePathtracer();
  const size = useThree((s) => s.size);
  const maxSamples = useEditorStore((s) => s.pathtracerMaxSamples);
  const enabled = useEditorStore((s) => s.denoiseEnabled);

  const { scene, camera, bilateral, identity } = useMemo(() => buildRig(), []);

  const target = useMemo(() => new WebGLRenderTarget(1, 1), []);

  useEffect(() => {
    const w = Math.max(1, size.width);
    const h = Math.max(1, size.height);
    target.setSize(w, h);
    bilateral.uniforms.uResolution.value.set(w, h);
  }, [size, target, bilateral]);

  useEffect(() => {
    return () => {
      target.dispose();
      bilateral.dispose();
      identity.dispose();
      scene.children[0]?.traverse?.((o) => {
        if ('geometry' in o) (o as Mesh).geometry?.dispose();
      });
      setDenoiseTexture(null);
    };
  }, [target, bilateral, identity, scene]);

  const publishedRef = useRef(false);

  useFrame(({ gl: renderer }) => {
    const tracer = pathtracer as unknown as {
      samples: number;
      target: { texture: unknown };
    };
    if (!tracer?.target) return;
    const samples = tracer.samples ?? 0;
    // Either off by user, or not yet converged — no-op and make sure the
    // capture bus doesn't still point at a stale texture.
    if (!enabled || samples < maxSamples) {
      if (publishedRef.current) {
        publishedRef.current = false;
        setDenoiseTexture(null);
      }
      return;
    }

    const mesh = scene.children[0] as Mesh;
    const prev = renderer.getRenderTarget();

    // Pass 1: bilateral into target (linear, tone-mapped).
    mesh.material = bilateral;
    bilateral.uniforms.uInput.value = tracer.target.texture;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);

    // Pass 2: sRGB-encode on the way to the canvas.
    mesh.material = identity;
    identity.uniforms.uInput.value = target.texture;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    renderer.setRenderTarget(prev);
    bilateral.uniforms.uInput.value = null;
    identity.uniforms.uInput.value = null;

    if (!publishedRef.current) {
      publishedRef.current = true;
      setDenoiseTexture(target.texture);
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

  const bilateral = new ShaderMaterial({
    uniforms: {
      uInput: new Uniform(null),
      uResolution: new Uniform(new Vector2(1, 1)),
      uSigmaSpatial: new Uniform(1.5),
      uSigmaColor: new Uniform(0.15),
    },
    vertexShader,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uInput;
      uniform vec2 uResolution;
      uniform float uSigmaSpatial;
      uniform float uSigmaColor;
      varying vec2 vUv;

      ${helpers}

      void main() {
        vec2 texel = 1.0 / uResolution;
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
        gl_FragColor = vec4(acesFilmic(denoised), 1.0);
      }
    `,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });

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
