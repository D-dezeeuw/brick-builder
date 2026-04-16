import type { Quality } from './editorStore';

/**
 * Per-level rendering knobs. Everything downstream (materials, lights,
 * post-processing) reads its flags from here so we keep a single source of
 * truth for quality scaling.
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
  /** Post-processing pipeline (SSAO + Bloom + SMAA). Phase 3c hookup. */
  usePostProcessing: boolean;
};

export const QUALITY_CONFIGS: Record<Quality, QualityConfig> = {
  low: {
    useClearcoat: false,
    useOrenNayar: false,
    useEnvironment: false,
    shadowMapSize: 512,
    usePostProcessing: false,
  },
  medium: {
    useClearcoat: false,
    useOrenNayar: true,
    useEnvironment: true,
    shadowMapSize: 1024,
    usePostProcessing: false,
  },
  high: {
    useClearcoat: true,
    useOrenNayar: true,
    useEnvironment: true,
    shadowMapSize: 2048,
    usePostProcessing: false,
  },
  ultra: {
    useClearcoat: true,
    useOrenNayar: true,
    useEnvironment: true,
    shadowMapSize: 4096,
    usePostProcessing: true,
  },
};

export const QUALITY_ORDER: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];

export const QUALITY_LABEL: Record<Quality, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  ultra: 'Ultra',
};
