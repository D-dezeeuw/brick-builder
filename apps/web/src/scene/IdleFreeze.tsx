import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
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

/**
 * Idle-state visual treatment: when `active` flips from true → false
 * we snapshot the scene once, run it through a grayscale shader, and
 * blit the result to the canvas. The rAF loop then stops (driven by
 * `frameloop="never"` on the Canvas) and the grey frame stays up
 * until the user interacts again.
 *
 * Why not capture the post-processed framebuffer directly? `copy-
 * FramebufferToTexture` is awkward to plumb when the texture isn't
 * pre-initialized, and the grayscale conversion dominates the look
 * anyway — losing AO / bloom in the frozen image is close to
 * imperceptible under the luminance collapse. Trading strict fidelity
 * for a simpler capture path.
 *
 * When the user wakes up, the next regular frame draws right over
 * our output. No cleanup to do on the false → true transition.
 *
 * Mounted conditionally by Scene.tsx — only in rasterized mode.
 * During path-traced render mode the tracer already stops sampling
 * when the rAF loop pauses, and its last converged frame stays on
 * screen without our help.
 */
export function IdleFreeze({ active }: { active: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const rig = useMemo(() => buildRig(), []);
  const captureTarget = useMemo(() => new WebGLRenderTarget(1, 1), []);

  // Track previous `active` so we only fire on the active→idle edge.
  const prevRef = useRef(active);

  useEffect(() => {
    const w = Math.max(1, size.width);
    const h = Math.max(1, size.height);
    captureTarget.setSize(w, h);
    rig.material.uniforms.uResolution.value.set(w, h);
  }, [size, captureTarget, rig]);

  useEffect(() => {
    const was = prevRef.current;
    prevRef.current = active;
    // Only run the freeze on true → false.
    if (!was || active) return;

    const prev = gl.getRenderTarget();
    // Pass 1: render the current scene to our offscreen target so we
    // can sample it in the grayscale shader. This is a plain scene
    // render — post-processing effects aren't applied here. The loss
    // is small; the grayscale treatment swamps the subtle AO/bloom
    // signal anyway.
    gl.setRenderTarget(captureTarget);
    gl.render(scene, camera);

    // Pass 2: full-screen quad samples the capture, converts to B&W,
    // writes to the canvas. ShaderMaterial does its own sRGB encoding
    // since three.js doesn't auto-inject colorspace output for it.
    rig.material.uniforms.uInput.value = captureTarget.texture;
    gl.setRenderTarget(null);
    gl.render(rig.scene, rig.camera);

    rig.material.uniforms.uInput.value = null;
    gl.setRenderTarget(prev);
  }, [active, gl, scene, camera, captureTarget, rig]);

  useEffect(() => {
    return () => {
      captureTarget.dispose();
      rig.material.dispose();
      (rig.scene.children[0] as Mesh)?.geometry?.dispose();
    };
  }, [captureTarget, rig]);

  return null;
}

function buildRig() {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new ShaderMaterial({
    uniforms: {
      uInput: new Uniform(null),
      uResolution: new Uniform(new Vector2(1, 1)),
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    // BT.709 luminance collapse with a mild shadow lift so crushed
    // blacks don't dominate, plus a tiny hash-based grain for a
    // rendered-print feel. sRGB encode baked in because ShaderMaterial
    // output doesn't go through the automatic output-colorspace chain.
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uInput;
      uniform vec2 uResolution;
      varying vec2 vUv;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      vec3 linearToSRGB(vec3 c) {
        c = clamp(c, 0.0, 1.0);
        bvec3 cutoff = lessThanEqual(c, vec3(0.0031308));
        vec3 low = c * 12.92;
        vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
        return mix(high, low, vec3(cutoff));
      }

      void main() {
        vec3 rgb = texture2D(uInput, vUv).rgb;
        float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
        // Gentle tone curve — lift shadows ~5% so midtones stay readable.
        luma = pow(luma, 0.92);
        // Subtle grain, ±1.5% luminance, static per frozen frame.
        float grain = (hash(vUv * uResolution) - 0.5) * 0.03;
        float v = clamp(luma + grain, 0.0, 1.0);
        gl_FragColor = vec4(linearToSRGB(vec3(v)), 1.0);
      }
    `,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  scene.add(mesh);
  return { scene, camera, material };
}
