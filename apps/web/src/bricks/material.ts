import { Color, MeshStandardMaterial } from 'three';

/**
 * Oren-Nayar diffuse BRDF (Fujii's no-trig approximation).
 * Replaces the Lambert call in MeshStandardMaterial's direct-light loop.
 * If three.js's shader string ever drifts, the replacement silently no-ops
 * and we fall back to default Lambert — behaviour still plausible.
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

export function createBrickMaterial(colorHex: string): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: new Color(colorHex),
    roughness: 0.55,
    metalness: 0.0,
  });

  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${OREN_NAYAR_FN}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(LAMBERT_CALL, OREN_NAYAR_CALL);
  };

  // Ensure our patched shader is cached separately from stock MeshStandardMaterial shaders.
  material.customProgramCacheKey = () => 'brick-oren-nayar-v1';

  return material;
}
