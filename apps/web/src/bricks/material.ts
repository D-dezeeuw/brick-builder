import {
  Color,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { QualityConfig } from '../state/quality';

/**
 * Oren-Nayar diffuse BRDF (Fujii's no-trig approximation).
 * Replaces the Lambert call in the direct-light loop of both
 * MeshStandardMaterial and MeshPhysicalMaterial (they share the
 * `lights_physical_fragment` shader chunk, so one patch fits both).
 * If three.js's shader string ever drifts, the replacement silently
 * no-ops and we fall back to default Lambert.
 */
const OREN_NAYAR_FN = /* glsl */ `
vec3 BRDF_OrenNayar(
  const in vec3 diffuseColor,
  const in float roughness,
  const in vec3 lightDir,
  const in vec3 viewDir,
  const in vec3 normal
) {
  float r2 = roughness * roughness;
  float A = 1.0 - 0.5 * r2 / ( r2 + 0.33 );
  float B = 0.45 * r2 / ( r2 + 0.09 );
  float NdotL = max( dot( normal, lightDir ), 0.0 );
  float NdotV = max( dot( normal, viewDir ), 0.0 );
  vec3 lightTangent = lightDir - normal * NdotL;
  vec3 viewTangent = viewDir - normal * NdotV;
  float s = dot( lightTangent, viewTangent );
  float t = ( s >= 0.0 ) ? max( NdotL, NdotV ) : 1.0;
  return diffuseColor * RECIPROCAL_PI * ( A + B * s / max( t, 1e-6 ) );
}
`;

const LAMBERT_CALL =
  'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';

const OREN_NAYAR_CALL =
  'reflectedLight.directDiffuse += irradiance * BRDF_OrenNayar( material.diffuseColor, material.roughness, directLight.direction, geometryViewDir, geometryNormal );';

function patchOrenNayar(material: MeshStandardMaterial | MeshPhysicalMaterial): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${OREN_NAYAR_FN}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(LAMBERT_CALL, OREN_NAYAR_CALL);
  };
}

/**
 * Maps the 0..1 "brickReflectivity" slider into the three surface
 * parameters that make up a glossy plastic look. Shared between the
 * realtime materials (here) and the path-traced clones in
 * PathtracingExpansion so the slider has a consistent effect.
 *
 * - 0.0: fully matte ABS       (roughness 0.85, clearcoat 0.00)
 * - 0.5: satin                 (roughness 0.48, clearcoat 0.50)
 * - 1.0: wet / near-mirror     (roughness 0.10, clearcoat 1.00)
 */
export type ReflectivityProps = {
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
};

export function reflectivityToProps(r: number): ReflectivityProps {
  const t = Math.max(0, Math.min(1, r));
  return {
    roughness: 0.85 - t * 0.75, // 0.85 → 0.10
    clearcoat: t, // 0.0 → 1.0
    clearcoatRoughness: 0.4 - t * 0.38, // 0.40 → 0.02
  };
}

/**
 * Build a brick material at the current quality level and reflectivity.
 * - low/medium: plain MeshStandardMaterial (no clearcoat) — slider
 *   only moves roughness.
 * - high/ultra: MeshPhysicalMaterial — all three props respond.
 *
 * Quality also toggles the Oren-Nayar diffuse patch (medium+); that
 * part is independent of the slider.
 */
export function createBrickMaterial(
  colorHex: string,
  quality: QualityConfig,
  reflectivity: number,
  transparent: boolean,
): MeshStandardMaterial {
  const color = new Color(colorHex);

  // Clear-plastic variants.
  // Three tiers, chosen by quality:
  //   Ultra: full physical glass — real refraction via transmission,
  //     IOR + thickness + attenuation for tinted depth. May trigger
  //     the "blitFramebuffer depth/stencil" GL warning when post-FX
  //     is active (three.js's transmission render target fights the
  //     EffectComposer). Users wanting a warning-free console can
  //     drop to High.
  //   High: clearcoated alpha-blend with iridescence for edge
  //     sparkle. No transmission — no blit conflict.
  //   Low/Medium: plain alpha-blended standard material.
  // Path-traced clones (PathtracingExpansion) always use full
  // transmission regardless — render mode bypasses post-FX, so the
  // conflict doesn't apply there.
  if (transparent) {
    if (quality.useGlassTransmission) {
      const material = new MeshPhysicalMaterial({
        color,
        roughness: 0.05,
        metalness: 0,
        transmission: 1,
        ior: 1.48, // ABS plastic
        thickness: 4,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        transparent: true,
        // Attenuation tints the light as it passes through, so a
        // blue glass brick reads as blue-through rather than
        // alpha-mixed-blue. More convincing than uniform opacity.
        attenuationDistance: 80,
        attenuationColor: color,
        // Iridescence gives the very thin pearly sheen you see at
        // grazing angles on moulded clear plastic. Subtle at 0.3.
        iridescence: 0.3,
        iridescenceIOR: 1.3,
      });
      material.userData.clearBrick = true;
      const cacheTag = 'brick-clear-transmission';
      material.customProgramCacheKey = () => cacheTag;
      return material;
    }
    if (quality.useClearcoat) {
      const material = new MeshPhysicalMaterial({
        color,
        roughness: 0.05,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        transparent: true,
        opacity: 0.45,
        // Boosts the specular-at-grazing-angle effect so non-
        // ultra clear bricks still feel glassy without real
        // transmission.
        iridescence: 0.25,
        iridescenceIOR: 1.3,
      });
      material.userData.clearBrick = true;
      const cacheTag = 'brick-clear-phys';
      material.customProgramCacheKey = () => cacheTag;
      return material;
    }
    const material = new MeshStandardMaterial({
      color,
      roughness: 0.2,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
    });
    material.userData.clearBrick = true;
    const cacheTag = 'brick-clear-std';
    material.customProgramCacheKey = () => cacheTag;
    return material;
  }

  const props = reflectivityToProps(reflectivity);

  if (quality.useClearcoat) {
    const material = new MeshPhysicalMaterial({
      color,
      roughness: props.roughness,
      metalness: 0,
      clearcoat: props.clearcoat,
      clearcoatRoughness: props.clearcoatRoughness,
    });
    if (quality.useOrenNayar) patchOrenNayar(material);
    const cacheTag = `brick-phys-on${quality.useOrenNayar ? 1 : 0}`;
    material.customProgramCacheKey = () => cacheTag;
    return material;
  }

  const material = new MeshStandardMaterial({
    color,
    roughness: props.roughness,
    metalness: 0,
  });
  if (quality.useOrenNayar) patchOrenNayar(material);
  const cacheTag = `brick-std-on${quality.useOrenNayar ? 1 : 0}`;
  material.customProgramCacheKey = () => cacheTag;
  return material;
}
