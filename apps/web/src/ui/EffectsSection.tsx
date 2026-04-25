import { useEditorStore } from '../state/editorStore';
import { getPathTraceSupport } from '../state/webglCaps';

type ToggleProps = {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (b: boolean) => void;
};

function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  return (
    <label className="toggle-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span className="toggle-row__label">
        <span>{label}</span>
        <span className="toggle-row__hint">{hint}</span>
      </span>
    </label>
  );
}

export function EffectsSection() {
  const ao = useEditorStore((s) => s.aoEnabled);
  const bloom = useEditorStore((s) => s.bloomEnabled);
  const smaa = useEditorStore((s) => s.smaaEnabled);
  const maxSamples = useEditorStore((s) => s.pathtracerMaxSamples);
  const bounces = useEditorStore((s) => s.pathtracerBounces);
  const resolutionScale = useEditorStore((s) => s.pathtracerResolutionScale);
  const dofEnabled = useEditorStore((s) => s.pathtracerDofEnabled);
  const fStop = useEditorStore((s) => s.pathtracerFStop);
  const apertureBlades = useEditorStore((s) => s.pathtracerApertureBlades);
  const denoise = useEditorStore((s) => s.denoiseEnabled);
  const denoiseAlgorithm = useEditorStore((s) => s.denoiseAlgorithm);
  const denoiseStrength = useEditorStore((s) => s.denoiseStrength);
  const sound = useEditorStore((s) => s.placementSoundEnabled);
  const woosh = useEditorStore((s) => s.wooshSoundEnabled);
  const muted = useEditorStore((s) => s.audioMuted);
  const idlePause = useEditorStore((s) => s.idlePauseEnabled);
  const setAo = useEditorStore((s) => s.setAoEnabled);
  const setBloom = useEditorStore((s) => s.setBloomEnabled);
  const setSmaa = useEditorStore((s) => s.setSmaaEnabled);
  const setMaxSamples = useEditorStore((s) => s.setPathtracerMaxSamples);
  const setBounces = useEditorStore((s) => s.setPathtracerBounces);
  const setResolutionScale = useEditorStore((s) => s.setPathtracerResolutionScale);
  const setDofEnabled = useEditorStore((s) => s.setPathtracerDofEnabled);
  const setFStop = useEditorStore((s) => s.setPathtracerFStop);
  const setApertureBlades = useEditorStore((s) => s.setPathtracerApertureBlades);
  const setDenoise = useEditorStore((s) => s.setDenoiseEnabled);
  const setDenoiseAlgorithm = useEditorStore((s) => s.setDenoiseAlgorithm);
  const setDenoiseStrength = useEditorStore((s) => s.setDenoiseStrength);
  const setSound = useEditorStore((s) => s.setPlacementSoundEnabled);
  const setWoosh = useEditorStore((s) => s.setWooshSoundEnabled);
  const setMuted = useEditorStore((s) => s.setAudioMuted);
  const setIdlePause = useEditorStore((s) => s.setIdlePauseEnabled);
  const support = getPathTraceSupport();

  return (
    <div className="sidebar-section">
      <h2 className="sidebar-heading">Effects</h2>
      <Toggle
        label="Ambient occlusion"
        hint="Soft contact shadows in stud gaps"
        checked={ao}
        onChange={setAo}
      />
      <Toggle
        label="Bloom"
        hint="Subtle glow on bright highlights"
        checked={bloom}
        onChange={setBloom}
      />
      <Toggle label="Anti-aliasing" hint="SMAA post-filter" checked={smaa} onChange={setSmaa} />

      {!support.supported && (
        <p className="toggle-row__hint render-btn__unsupported">{support.reason}</p>
      )}
      <div
        className={`slider-row${!support.supported ? ' slider-row--disabled' : ''}`}
        style={{ marginTop: 8 }}
      >
        <label className="slider-row__label" htmlFor="pt-samples">
          <span>Render samples</span>
          <span className="slider-row__value">{maxSamples}</span>
        </label>
        <input
          id="pt-samples"
          className="slider"
          type="range"
          min={1}
          max={512}
          step={1}
          value={maxSamples}
          onChange={(e) => setMaxSamples(Number(e.currentTarget.value))}
          disabled={!support.supported}
        />
        <div className="slider-row__scale">
          <span>1</span>
          <span>512</span>
        </div>
      </div>
      <div
        className={`slider-row${!support.supported ? ' slider-row--disabled' : ''}`}
        style={{ marginTop: 6 }}
      >
        <label className="slider-row__label" htmlFor="pt-bounces">
          <span>Ray bounces</span>
          <span className="slider-row__value">{bounces}</span>
        </label>
        <input
          id="pt-bounces"
          className="slider"
          type="range"
          min={1}
          max={8}
          step={1}
          value={bounces}
          onChange={(e) => setBounces(Number(e.currentTarget.value))}
          disabled={!support.supported}
        />
        <div className="slider-row__scale">
          <span>flat</span>
          <span>rich bleed</span>
        </div>
      </div>
      <div
        className={`slider-row${!support.supported ? ' slider-row--disabled' : ''}`}
        style={{ marginTop: 6 }}
      >
        <label className="slider-row__label" htmlFor="pt-resolution">
          <span>Render resolution</span>
          <span className="slider-row__value">{Math.round(resolutionScale * 100)}%</span>
        </label>
        <select
          id="pt-resolution"
          className="settings-select"
          value={resolutionScale}
          onChange={(e) => setResolutionScale(Number(e.currentTarget.value))}
          disabled={!support.supported}
          title="Lower values render the path tracer at reduced resolution for faster convergence"
        >
          <option value={0.5}>50% (fastest)</option>
          <option value={0.75}>75% (balanced)</option>
          <option value={1}>100% (sharpest)</option>
        </select>
      </div>
      <Toggle
        label="Depth of field"
        hint="Finite-aperture focus blur; focuses on the orbit target"
        checked={dofEnabled}
        onChange={setDofEnabled}
      />
      <div
        className={`slider-row${!dofEnabled || !support.supported ? ' slider-row--disabled' : ''}`}
        style={{ marginTop: 4 }}
      >
        <label className="slider-row__label" htmlFor="pt-fstop">
          <span>Aperture</span>
          <span className="slider-row__value">f/{fStop.toFixed(1)}</span>
        </label>
        <input
          id="pt-fstop"
          className="slider"
          type="range"
          min={1.4}
          max={22}
          step={0.1}
          value={fStop}
          onChange={(e) => setFStop(Number(e.currentTarget.value))}
          disabled={!dofEnabled || !support.supported}
        />
        <div className="slider-row__scale">
          <span>shallow</span>
          <span>deep</span>
        </div>
      </div>
      <div
        className={`slider-row${!dofEnabled || !support.supported ? ' slider-row--disabled' : ''}`}
        style={{ marginTop: 4 }}
      >
        <label className="slider-row__label" htmlFor="pt-aperture-blades">
          <span>Bokeh shape</span>
        </label>
        <select
          id="pt-aperture-blades"
          className="settings-select"
          value={apertureBlades}
          onChange={(e) => setApertureBlades(Number(e.currentTarget.value))}
          disabled={!dofEnabled || !support.supported}
          title="Polygonal bokeh simulates real aperture blade shapes"
        >
          <option value={0}>Circular</option>
          <option value={5}>Pentagonal (5)</option>
          <option value={6}>Hexagonal (6)</option>
          <option value={8}>Octagonal (8)</option>
        </select>
      </div>
      <Toggle
        label="Denoise on converge"
        hint="Edge-aware smooth once samples hit the target"
        checked={denoise}
        onChange={setDenoise}
      />
      <div
        className={`slider-row${!denoise ? ' slider-row--disabled' : ''}`}
        style={{ marginTop: 4 }}
      >
        <label className="slider-row__label" htmlFor="denoise-algo">
          <span>Denoise filter</span>
        </label>
        <select
          id="denoise-algo"
          className="settings-select"
          value={denoiseAlgorithm}
          onChange={(e) =>
            setDenoiseAlgorithm(e.currentTarget.value as typeof denoiseAlgorithm)
          }
          disabled={!denoise}
          title="Which filter runs after the path tracer converges"
        >
          <option value="atrous">À-Trous EAW (default)</option>
          <option value="bilateral">Bilateral (cheap)</option>
          <option value="nlm">Non-local means (best detail, slow)</option>
        </select>
        <p className="toggle-row__hint">
          {denoiseAlgorithm === 'atrous' &&
            '4 iterations, luma-guided edges. SVGF-style spatial filter.'}
          {denoiseAlgorithm === 'bilateral' &&
            '5×5 single pass. Legacy fallback — fastest but leaves speckle.'}
          {denoiseAlgorithm === 'nlm' &&
            '3×3 patches in 5×5 search. Best on studded detail; ~30ms/frame.'}
        </p>
      </div>
      <div
        className={`slider-row${!denoise ? ' slider-row--disabled' : ''}`}
        style={{ marginTop: 6 }}
      >
        <label className="slider-row__label" htmlFor="denoise-strength">
          <span>Edge tolerance</span>
          <span className="slider-row__value">{denoiseStrength.toFixed(2)}×</span>
        </label>
        <input
          id="denoise-strength"
          className="slider"
          type="range"
          min={0.2}
          max={3.0}
          step={0.05}
          value={denoiseStrength}
          onChange={(e) => setDenoiseStrength(Number(e.currentTarget.value))}
          disabled={!denoise}
        />
        <div className="slider-row__scale">
          <span>smoother</span>
          <span>sharper</span>
        </div>
      </div>
      <Toggle
        label="Placement sound"
        hint="Click feedback when you drop a brick"
        checked={sound}
        onChange={setSound}
      />
      <Toggle
        label="Camera whoosh"
        hint="Filtered noise that tracks rotation speed"
        checked={woosh}
        onChange={setWoosh}
      />
      <Toggle
        label="Mute all sound"
        hint="Master switch — overrides every other audio toggle"
        checked={muted}
        onChange={setMuted}
      />
      <Toggle
        label="Pause when idle"
        hint="Stop rendering after 30s of no activity"
        checked={idlePause}
        onChange={setIdlePause}
      />
    </div>
  );
}

