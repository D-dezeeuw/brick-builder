import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
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
 * tracer output. The bilateral target is tone-mapped + sRGB-encoded
 * so screenshots can read it directly.
 *
 * Flow per frame after convergence:
 *   1. Bilateral pass:   HDR PT target --[bilateral + tonemap + sRGB]--> denoise target
 *   2. Display blit:     denoise target --[identity]--> canvas
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

  const { scene, camera, bilateral, identity } = useMemo(() => buildRig(), []);

  const target = useMemo(() => {
    const t = new WebGLRenderTarget(1, 1);
    t.texture.colorSpace = SRGBColorSpace;
    return t;
  }, []);

  // Keep target + uniform resolution in sync with the canvas.
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

    // Pass 1: bilateral into our LDR sRGB target.
    mesh.material = bilateral;
    bilateral.uniforms.uInput.value = tracer.target.texture;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);

    // Pass 2: identity blit of the denoise target to the canvas.
    mesh.material = identity;
    identity.uniforms.uInput.value = target.texture;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    // Cleanup + restore.
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

  // 5×5 bilateral filter with tone mapping + sRGB encode baked in.
  // Spatial weight falls off with pixel distance; color weight falls
  // off with luminance difference so brick edges (big luma jumps)
  // aren't smoothed across.
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

      #include <common>
      #include <tonemapping_pars_fragment>
      #include <colorspace_pars_fragment>

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
        denoised = toneMapping(denoised);
        gl_FragColor = linearToOutputTexel(vec4(denoised, 1.0));
      }
    `,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });

  // Plain identity blit: sample the already-encoded denoise target
  // and write it to whatever render target is currently bound. No
  // tone mapping, no colorspace math — the input is already sRGB.
  const identity = new ShaderMaterial({
    uniforms: { uInput: new Uniform(null) },
    vertexShader,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uInput;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(uInput, vUv);
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
