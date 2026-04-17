import { useEditorStore } from '../state/editorStore';
import { useSettingsStore } from '../state/settingsStore';
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
  const renderMode = useEditorStore((s) => s.renderMode);
  const maxSamples = useEditorStore((s) => s.pathtracerMaxSamples);
  const setAo = useEditorStore((s) => s.setAoEnabled);
  const setBloom = useEditorStore((s) => s.setBloomEnabled);
  const setSmaa = useEditorStore((s) => s.setSmaaEnabled);
  const setRenderMode = useEditorStore((s) => s.setRenderMode);
  const setMaxSamples = useEditorStore((s) => s.setPathtracerMaxSamples);
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

      <PathTraceButton renderMode={renderMode} setRenderMode={setRenderMode} support={support} />
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
          max={128}
          step={1}
          value={maxSamples}
          onChange={(e) => setMaxSamples(Number(e.currentTarget.value))}
          disabled={!support.supported}
        />
        <div className="slider-row__scale">
          <span>1</span>
          <span>128</span>
        </div>
      </div>
    </div>
  );
}

function PathTraceButton({
  renderMode,
  setRenderMode,
  support,
}: {
  renderMode: boolean;
  setRenderMode: (b: boolean) => void;
  support: ReturnType<typeof getPathTraceSupport>;
}) {
  const closeSettings = useSettingsStore((s) => s.setOpen);
  const disabled = !support.supported && !renderMode;
  const title = renderMode
    ? 'Exit path-traced render mode'
    : support.supported
      ? 'Switch to GPU path tracer — non-interactive, converges over a few seconds'
      : support.reason;
  const onClick = () => {
    const next = !renderMode;
    setRenderMode(next);
    // When turning render mode ON, get the settings modal out of the
    // way so the user can see the full canvas converge. Exiting render
    // mode from inside the modal is rare enough that keeping it open
    // there matters less — but even then the button is the main exit
    // affordance, so close in both directions for simplicity.
    closeSettings(false);
  };
  return (
    <>
      <button
        type="button"
        className={`render-btn${renderMode ? ' render-btn--active' : ''}`}
        onClick={onClick}
        disabled={disabled}
        title={title}
      >
        {renderMode ? 'Exit render mode' : 'Path-traced render'}
      </button>
      {disabled && <p className="toggle-row__hint render-btn__unsupported">{support.reason}</p>}
    </>
  );
}
