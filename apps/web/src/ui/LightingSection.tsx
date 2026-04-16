import { useEditorStore } from '../state/editorStore';
import { QUALITY_CONFIGS } from '../state/quality';
import { warmthToHex } from '../scene/lightColor';

export function LightingSection() {
  const intensity = useEditorStore((s) => s.lightIntensity);
  const warmth = useEditorStore((s) => s.lightWarmth);
  const envIntensity = useEditorStore((s) => s.envIntensity);
  const quality = useEditorStore((s) => s.quality);
  const setIntensity = useEditorStore((s) => s.setLightIntensity);
  const setWarmth = useEditorStore((s) => s.setLightWarmth);
  const setEnvIntensity = useEditorStore((s) => s.setEnvIntensity);

  const envAvailable = QUALITY_CONFIGS[quality].useEnvironment;

  return (
    <div className="sidebar-section">
      <h2 className="sidebar-heading">Lighting</h2>

      <div className="slider-row">
        <div className="slider-row__label">
          <span>Intensity</span>
          <span className="slider-row__value">{intensity.toFixed(2)}</span>
        </div>
        <input
          type="range"
          className="slider"
          min={0}
          max={2}
          step={0.01}
          value={intensity}
          onChange={(e) => setIntensity(Number(e.currentTarget.value))}
          aria-label="Directional light intensity"
        />
      </div>

      <div className="slider-row">
        <div className="slider-row__label">
          <span>Warmth</span>
          <span
            className="slider-row__swatch"
            style={{ background: warmthToHex(warmth) }}
            aria-hidden="true"
          />
        </div>
        <input
          type="range"
          className="slider slider--warmth"
          min={-1}
          max={1}
          step={0.01}
          value={warmth}
          onChange={(e) => setWarmth(Number(e.currentTarget.value))}
          aria-label="Directional light warmth"
        />
        <div className="slider-row__scale" aria-hidden="true">
          <span>Cool</span>
          <span>Neutral</span>
          <span>Warm</span>
        </div>
      </div>

      <div className={`slider-row${envAvailable ? '' : ' slider-row--disabled'}`}>
        <div className="slider-row__label">
          <span>Reflections</span>
          <span className="slider-row__value">
            {envAvailable ? envIntensity.toFixed(2) : 'off at Low'}
          </span>
        </div>
        <input
          type="range"
          className="slider"
          min={0}
          max={2}
          step={0.01}
          value={envIntensity}
          onChange={(e) => setEnvIntensity(Number(e.currentTarget.value))}
          disabled={!envAvailable}
          aria-label="Environment map (HDRI) intensity"
        />
      </div>
    </div>
  );
}
