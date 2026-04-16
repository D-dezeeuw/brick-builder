import type { Quality } from './editorStore';

/**
 * Per-level rendering knobs. Everything downstream (materials, lights,
 * post-processing) reads its flags from here so we keep a single source of
 * truth for quality scaling. Individual effect flags (AO/Bloom/SMAA) live
 * separately in the store so users can override them without leaving the
 * current quality preset.
 */
export type QualityConfig = {
  /** MeshPhysicalMaterial + clearcoat vs plain MeshStandardMaterial. */
  useClearcoat: boolean;
  /** Oren-Nayar diffuse patch on brick materials. */
  useOrenNayar: boolean;
  /** Drei <Environment preset="studio"> for IBL. */
  useEnvironment: boolean;
  /** Directional-light shadow-map resolution (square). */
  shadowMapSize: number;
};

export const QUALITY_CONFIGS: Record<Quality, QualityConfig> = {
  low: {
    useClearcoat: false,
    useOrenNayar: false,
    useEnvironment: false,
    shadowMapSize: 512,
  },
  medium: {
    useClearcoat: false,
    useOrenNayar: true,
    useEnvironment: true,
    shadowMapSize: 1024,
  },
  high: {
    useClearcoat: true,
    useOrenNayar: true,
    useEnvironment: true,
    shadowMapSize: 2048,
  },
  ultra: {
    useClearcoat: true,
    useOrenNayar: true,
    useEnvironment: true,
    shadowMapSize: 4096,
  },
};

/** Seed values for the independent AO/Bloom/SMAA toggles when quality changes. */
export type EffectDefaults = {
  ao: boolean;
  bloom: boolean;
  smaa: boolean;
};

export const EFFECT_DEFAULTS: Record<Quality, EffectDefaults> = {
  low: { ao: false, bloom: false, smaa: false },
  medium: { ao: false, bloom: false, smaa: true },
  high: { ao: true, bloom: false, smaa: true },
  ultra: { ao: true, bloom: true, smaa: true },
};

export const QUALITY_ORDER: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];

export const QUALITY_LABEL: Record<Quality, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  ultra: 'Ultra',
};
