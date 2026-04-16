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
 * Build a brick material sized to the current quality level.
 * - low:    plain MeshStandardMaterial, roughness 0.4, no patching.
 * - medium: MeshStandardMaterial + Oren-Nayar, roughness 0.55.
 * - high+:  MeshPhysicalMaterial + Oren-Nayar + clearcoat 1 / 0.08 + subtle sheen,
 *           ABS-tuned roughness 0.35.
 */
export function createBrickMaterial(
  colorHex: string,
  quality: QualityConfig,
): MeshStandardMaterial {
  const color = new Color(colorHex);

  if (quality.useClearcoat) {
    const material = new MeshPhysicalMaterial({
      color,
      roughness: 0.35,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      sheen: 0.15,
      sheenRoughness: 0.8,
      sheenColor: new Color('#ffffff'),
    });
    if (quality.useOrenNayar) patchOrenNayar(material);
    const cacheTag = `brick-phys-on${quality.useOrenNayar ? 1 : 0}`;
    material.customProgramCacheKey = () => cacheTag;
    return material;
  }

  const material = new MeshStandardMaterial({
    color,
    roughness: quality.useOrenNayar ? 0.55 : 0.4,
    metalness: 0,
  });
  if (quality.useOrenNayar) patchOrenNayar(material);
  const cacheTag = `brick-std-on${quality.useOrenNayar ? 1 : 0}`;
  material.customProgramCacheKey = () => cacheTag;
  return material;
}
