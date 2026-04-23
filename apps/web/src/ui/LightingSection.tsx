import { useEditorStore, type EditorState } from '../state/editorStore';
import { QUALITY_CONFIGS } from '../state/quality';
import { warmthToHex } from '../scene/lightColor';

const TONE_MAPPING_OPTIONS: { value: EditorState['toneMapping']; label: string; hint: string }[] = [
  { value: 'aces', label: 'ACES Filmic', hint: 'Cinematic, saturated; three\u2019s long-standing default.' },
  { value: 'agx', label: 'AgX', hint: 'Blender 4.x default; neutral hues, gentler roll-off than ACES.' },
  { value: 'neutral', label: 'Khronos Neutral', hint: 'glTF-spec curve; minimal colour shift on bright tones.' },
  { value: 'linear', label: 'Linear', hint: 'No curve. Raw HDR clipped at 1 — useful for debugging.' },
];

export function LightingSection() {
  const intensity = useEditorStore((s) => s.lightIntensity);
  const warmth = useEditorStore((s) => s.lightWarmth);
  const envIntensity = useEditorStore((s) => s.envIntensity);
  const envRotation = useEditorStore((s) => s.envRotation);
  const envBackgroundVisible = useEditorStore((s) => s.envBackgroundVisible);
  const envBackgroundBlur = useEditorStore((s) => s.envBackgroundBlur);
  const envBackgroundIntensity = useEditorStore((s) => s.envBackgroundIntensity);
  const toneMapping = useEditorStore((s) => s.toneMapping);
  const reflectivity = useEditorStore((s) => s.brickReflectivity);
  const quality = useEditorStore((s) => s.quality);
  const setIntensity = useEditorStore((s) => s.setLightIntensity);
  const setWarmth = useEditorStore((s) => s.setLightWarmth);
  const setEnvIntensity = useEditorStore((s) => s.setEnvIntensity);
  const setEnvRotation = useEditorStore((s) => s.setEnvRotation);
  const setEnvBackgroundVisible = useEditorStore((s) => s.setEnvBackgroundVisible);
  const setEnvBackgroundBlur = useEditorStore((s) => s.setEnvBackgroundBlur);
  const setEnvBackgroundIntensity = useEditorStore((s) => s.setEnvBackgroundIntensity);
  const setToneMapping = useEditorStore((s) => s.setToneMapping);
  const setReflectivity = useEditorStore((s) => s.setBrickReflectivity);

  const envAvailable = QUALITY_CONFIGS[quality].useEnvironment;
  const envRotationDeg = Math.round((envRotation * 180) / Math.PI);
  const bgControlsDisabled = !envAvailable || !envBackgroundVisible;
  const toneHint = TONE_MAPPING_OPTIONS.find((o) => o.value === toneMapping)?.hint ?? '';

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

      <div className={`slider-row${envAvailable ? '' : ' slider-row--disabled'}`}>
        <div className="slider-row__label">
          <span>HDRI rotation</span>
          <span className="slider-row__value">{envRotationDeg}&deg;</span>
        </div>
        <input
          type="range"
          className="slider"
          min={0}
          max={Math.PI * 2}
          step={Math.PI / 90}
          value={envRotation}
          onChange={(e) => setEnvRotation(Number(e.currentTarget.value))}
          disabled={!envAvailable}
          aria-label="HDRI rotation around the vertical axis"
        />
      </div>

      <label className={`toggle-row${envAvailable ? '' : ' toggle-row--disabled'}`}>
        <input
          type="checkbox"
          checked={envBackgroundVisible}
          onChange={(e) => setEnvBackgroundVisible(e.currentTarget.checked)}
          disabled={!envAvailable}
        />
        <span className="toggle-row__label">
          <span>Show HDRI background</span>
          <span className="toggle-row__hint">Replaces the flat backdrop with the studio skybox.</span>
        </span>
      </label>

      <div className={`slider-row${bgControlsDisabled ? ' slider-row--disabled' : ''}`}>
        <div className="slider-row__label">
          <span>Background blur</span>
          <span className="slider-row__value">{envBackgroundBlur.toFixed(2)}</span>
        </div>
        <input
          type="range"
          className="slider"
          min={0}
          max={1}
          step={0.01}
          value={envBackgroundBlur}
          onChange={(e) => setEnvBackgroundBlur(Number(e.currentTarget.value))}
          disabled={bgControlsDisabled}
          aria-label="HDRI background blur"
        />
      </div>

      <div className={`slider-row${bgControlsDisabled ? ' slider-row--disabled' : ''}`}>
        <div className="slider-row__label">
          <span>Background brightness</span>
          <span className="slider-row__value">{envBackgroundIntensity.toFixed(2)}</span>
        </div>
        <input
          type="range"
          className="slider"
          min={0}
          max={2}
          step={0.01}
          value={envBackgroundIntensity}
          onChange={(e) => setEnvBackgroundIntensity(Number(e.currentTarget.value))}
          disabled={bgControlsDisabled}
          aria-label="HDRI background brightness"
        />
      </div>

      <div className="slider-row">
        <div className="slider-row__label">
          <span>Tone mapping</span>
        </div>
        <select
          className="settings-select"
          value={toneMapping}
          onChange={(e) => setToneMapping(e.currentTarget.value as EditorState['toneMapping'])}
          aria-label="Output tone-mapping operator"
        >
          {TONE_MAPPING_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="toggle-row__hint">{toneHint}</p>
      </div>

      <div className="slider-row">
        <div className="slider-row__label">
          <span>Surface gloss</span>
          <span className="slider-row__value">{reflectivity.toFixed(2)}</span>
        </div>
        <input
          type="range"
          className="slider"
          min={0}
          max={1}
          step={0.01}
          value={reflectivity}
          onChange={(e) => setReflectivity(Number(e.currentTarget.value))}
          aria-label="Brick surface gloss (roughness + clearcoat)"
        />
        <div className="slider-row__scale" aria-hidden="true">
          <span>Matte</span>
          <span>Satin</span>
          <span>Mirror</span>
        </div>
      </div>
    </div>
  );
}
