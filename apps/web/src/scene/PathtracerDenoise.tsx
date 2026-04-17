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
 * Three filters plug into the same pipeline; the user selects via the
 * Effects section. Each produces ACES-tonemapped linear values; a
 * trailing `display` pass encodes sRGB onto the canvas.
 *
 *   bilateral — single 5×5 cross-bilateral. Cheap, legacy fallback.
 *   atrous    — 4-iteration À-Trous EAW, luma-guided, sigma halving per
 *               pass. SVGF's spatial core used standalone. This is the
 *               default — it kills flat-region speckle the 5×5 kernel
 *               can't reach without over-blurring stud geometry.
 *   nlm       — non-local means, 3×3 patches × 5×5 search, luma patch
 *               distance. Best on repeated detail; ~tens of ms at 1080p.
 *
 * Why not OIDN / a neural denoiser: no production-ready WebAssembly
 * build of Intel OIDN exists (RenderKit/oidn ships no WASM target;
 * small-community wraps are outdated). Neural single-image denoisers
 * are trained on camera Gaussian/Poisson noise, not Monte-Carlo HDR
 * fireflies, so they'd need domain-specific retraining. À-Trous was
 * the right call for browser scope.
 *
 * Earlier revision: naive À-Trous using RGB colour distance over-
 * smoothed because per-channel RGB distance fights the speckle it's
 * trying to remove. Luma-only distance + sigma halving fixes it.
 *
 * Flow:
 *   1. Run the selected algorithm. Single-pass algorithms (bilateral,
 *      nlm) write to targetA. À-Trous ping-pongs between targetA and
 *      targetB for 4 iterations.
 *   2. Final iteration applies ACES tonemap (bilateral + nlm do it in
 *      their shader; atrous uses `uApplyTonemap` toggled on the last
 *      pass so intermediates stay linear).
 *   3. `display` pass: sRGB-encode the last algorithm output onto the
 *      canvas framebuffer.
 *
 * Colour-space notes unchanged from the legacy version — we avoid the
 * three.js <tonemapping_pars_fragment> / <colorspace_pars_fragment>
 * chunks because ShaderMaterial already prepends the colorspace pars on
 * three 0.171, and the tonemapping chunk only defines `toneMapping()`
 * when `material.toneMapped=true` (which we don't set).
 *
 * useFrame priority=1 ensures these passes run AFTER the tracer's own
 * display pass (priority=0), so our blit overwrites the canvas in the
 * same frame. Pre-convergence the component no-ops.
 */
export function PathtracerDenoise() {
  const { pathtracer } = usePathtracer();
  const size = useThree((s) => s.size);
  const maxSamples = useEditorStore((s) => s.pathtracerMaxSamples);
  const enabled = useEditorStore((s) => s.denoiseEnabled);
  const algorithm = useEditorStore((s) => s.denoiseAlgorithm);
  const strength = useEditorStore((s) => s.denoiseStrength);

  const rig = useMemo(() => buildRig(), []);
  const { scene, camera, bilateral, atrous, nlm, display } = rig;

  // Two FBOs so À-Trous can ping-pong 4 iterations. Single-pass
  // algorithms (bilateral, nlm) just use `targetA` and leave `targetB`
  // idle — the cost of keeping it alive is ~16 bytes per pixel, which
  // at 1080p is ~8 MB. Acceptable for the simplicity of not having to
  // allocate on algorithm change.
  const targetA = useMemo(() => new WebGLRenderTarget(1, 1), []);
  const targetB = useMemo(() => new WebGLRenderTarget(1, 1), []);

  useEffect(() => {
    const w = Math.max(1, size.width);
    const h = Math.max(1, size.height);
    targetA.setSize(w, h);
    targetB.setSize(w, h);
    const res = new Vector2(w, h);
    bilateral.uniforms.uResolution.value = res;
    atrous.uniforms.uResolution.value = res;
    nlm.uniforms.uResolution.value = res;
  }, [size, targetA, targetB, bilateral, atrous, nlm]);

  useEffect(() => {
    return () => {
      targetA.dispose();
      targetB.dispose();
      bilateral.dispose();
      atrous.dispose();
      nlm.dispose();
      display.dispose();
      scene.children[0]?.traverse?.((o) => {
        if ('geometry' in o) (o as Mesh).geometry?.dispose();
      });
      setDenoiseTexture(null);
    };
  }, [targetA, targetB, bilateral, atrous, nlm, display, scene]);

  const publishedRef = useRef(false);

  useFrame(({ gl: renderer }) => {
    const tracer = pathtracer as unknown as {
      samples: number;
      target: { texture: unknown };
    };
    if (!tracer?.target) return;
    const samples = tracer.samples ?? 0;
    if (!enabled || samples < maxSamples) {
      if (publishedRef.current) {
        publishedRef.current = false;
        setDenoiseTexture(null);
      }
      return;
    }

    const mesh = scene.children[0] as Mesh;
    const prev = renderer.getRenderTarget();

    let lastTarget: WebGLRenderTarget;

    if (algorithm === 'bilateral') {
      mesh.material = bilateral;
      bilateral.uniforms.uInput.value = tracer.target.texture;
      bilateral.uniforms.uSigmaColor.value = 0.15 * strength;
      renderer.setRenderTarget(targetA);
      renderer.render(scene, camera);
      lastTarget = targetA;
    } else if (algorithm === 'nlm') {
      mesh.material = nlm;
      nlm.uniforms.uInput.value = tracer.target.texture;
      nlm.uniforms.uH.value = 0.15 * strength;
      renderer.setRenderTarget(targetA);
      renderer.render(scene, camera);
      lastTarget = targetA;
    } else {
      // À-Trous: 4 iterations, stride doubles, sigma_luma halves. Final
      // iteration flips `uApplyTonemap` to 1 so ACES is baked in — the
      // display pass only needs to encode sRGB.
      const ITERATIONS = 4;
      const BASE_SIGMA = 0.4;
      let inputTex: unknown = tracer.target.texture;
      let outTarget = targetA;
      for (let i = 0; i < ITERATIONS; i++) {
        mesh.material = atrous;
        atrous.uniforms.uInput.value = inputTex;
        atrous.uniforms.uStepSize.value = 1 << i; // 1, 2, 4, 8
        atrous.uniforms.uSigmaLuma.value = BASE_SIGMA * strength * Math.pow(0.5, i);
        atrous.uniforms.uApplyTonemap.value = i === ITERATIONS - 1 ? 1.0 : 0.0;
        renderer.setRenderTarget(outTarget);
        renderer.render(scene, camera);
        inputTex = outTarget.texture;
        outTarget = outTarget === targetA ? targetB : targetA;
      }
      // `outTarget` points to the one we'd use next; the last written
      // target is the opposite.
      lastTarget = outTarget === targetA ? targetB : targetA;
    }

    // Display pass — sRGB encode onto the canvas framebuffer.
    mesh.material = display;
    display.uniforms.uInput.value = lastTarget.texture;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    renderer.setRenderTarget(prev);
    // Null out the uniforms so three.js doesn't keep stale texture refs
    // if the component unmounts mid-frame.
    bilateral.uniforms.uInput.value = null;
    atrous.uniforms.uInput.value = null;
    nlm.uniforms.uInput.value = null;
    display.uniforms.uInput.value = null;

    // Publish the pre-display (ACES-tonemapped, linear) texture to the
    // bus so screenshot export catches the denoised image. Republish
    // whenever the output target changed (À-Trous parity flip across
    // iteration counts) or we weren't published yet.
    publishedRef.current = true;
    setDenoiseTexture(lastTarget.texture);
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
    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
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

  // À-Trous edge-avoiding wavelet. Each invocation is ONE iteration;
  // the driver loops with uStepSize and uSigmaLuma updated per pass. A
  // 5×5 B3-spline kernel provides the fixed spatial weights, multiplied
  // by an edge weight derived from luma distance to the centre pixel.
  // uApplyTonemap gates ACES so only the final iteration tonemaps.
  const atrous = new ShaderMaterial({
    uniforms: {
      uInput: new Uniform(null),
      uResolution: new Uniform(new Vector2(1, 1)),
      uStepSize: new Uniform(1.0),
      uSigmaLuma: new Uniform(0.4),
      uApplyTonemap: new Uniform(0.0),
    },
    vertexShader,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uInput;
      uniform vec2 uResolution;
      uniform float uStepSize;
      uniform float uSigmaLuma;
      uniform float uApplyTonemap;
      varying vec2 vUv;

      ${helpers}

      // B3-spline row weights: (1, 4, 6, 4, 1) / 16. Outer product
      // forms the 5×5 kernel dividing by 256 (=16×16).
      float b3(int i) {
        if (i == -2 || i == 2) return 1.0;
        if (i == -1 || i == 1) return 4.0;
        return 6.0;
      }

      void main() {
        vec2 texel = 1.0 / uResolution;
        vec3 center = texture2D(uInput, vUv).rgb;
        float centerLuma = luma(center);
        vec3 sum = vec3(0.0);
        float totalWeight = 0.0;
        const int R = 2;
        for (int dx = -R; dx <= R; dx++) {
          for (int dy = -R; dy <= R; dy++) {
            vec2 offset = vec2(float(dx), float(dy)) * texel * uStepSize;
            vec3 s = texture2D(uInput, vUv + offset).rgb;
            float spatial = (b3(dx) * b3(dy)) / 256.0;
            float ld = luma(s) - centerLuma;
            float edge = exp(-(ld * ld) / max(uSigmaLuma * uSigmaLuma, 1e-8));
            float w = spatial * edge;
            sum += s * w;
            totalWeight += w;
          }
        }
        vec3 denoised = sum / max(totalWeight, 1e-6);
        vec3 outRgb = (uApplyTonemap > 0.5) ? acesFilmic(denoised) : denoised;
        gl_FragColor = vec4(outRgb, 1.0);
      }
    `,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });

  // Non-local means. For each output pixel we scan a 5×5 search window;
  // for each candidate we compute the sum-of-squared luma differences
  // between a 3×3 patch at the centre and a 3×3 patch at the candidate.
  // Cost: 25 candidates × 9 patch samples = 225 texture fetches per
  // output pixel. ~20–40 ms at 1080p on an M-series GPU.
  const nlm = new ShaderMaterial({
    uniforms: {
      uInput: new Uniform(null),
      uResolution: new Uniform(new Vector2(1, 1)),
      uH: new Uniform(0.15),
    },
    vertexShader,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uInput;
      uniform vec2 uResolution;
      uniform float uH;
      varying vec2 vUv;

      ${helpers}

      float lumaAt(vec2 uv) {
        return luma(texture2D(uInput, uv).rgb);
      }

      void main() {
        vec2 texel = 1.0 / uResolution;
        vec3 center = texture2D(uInput, vUv).rgb;
        vec3 sum = vec3(0.0);
        float totalWeight = 0.0;
        const int SR = 2; // search half-radius (5×5 window)
        const int PR = 1; // patch half-radius (3×3 patch)
        float hSq = max(uH * uH, 1e-6);

        for (int sx = -SR; sx <= SR; sx++) {
          for (int sy = -SR; sy <= SR; sy++) {
            vec2 cUv = vUv + vec2(float(sx), float(sy)) * texel;
            // Sum-of-squared luma differences across the 3×3 patch.
            float ssd = 0.0;
            for (int px = -PR; px <= PR; px++) {
              for (int py = -PR; py <= PR; py++) {
                vec2 d = vec2(float(px), float(py)) * texel;
                float lc = lumaAt(vUv + d);
                float ls = lumaAt(cUv + d);
                float diff = lc - ls;
                ssd += diff * diff;
              }
            }
            // Normalise by patch size (9 taps) for sigma stability
            // across platforms.
            ssd /= 9.0;
            float w = exp(-ssd / hSq);
            vec3 s = texture2D(uInput, cUv).rgb;
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

  // Display pass — sRGB encode only. Inputs are already ACES-tonemapped.
  const display = new ShaderMaterial({
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

  return { scene, camera, bilateral, atrous, nlm, display };
}
