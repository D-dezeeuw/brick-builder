export function BrowserUnsupported() {
  return (
    <div className="fallback">
      <h2>This browser can't render the editor.</h2>
      <p className="fallback__body">
        Brick Builder needs WebGL 2 to draw a 3D scene. Your browser either has it disabled or
        doesn't support it. Try one of the following:
      </p>
      <ul className="fallback__list">
        <li>Update to a recent version of Chrome, Firefox, Safari or Edge.</li>
        <li>
          If you're in a corporate / locked-down browser, WebGL may be blocked by policy — ask IT to
          allow it.
        </li>
        <li>
          On older hardware, enable hardware acceleration in browser settings (chrome://settings →
          System → "Use hardware acceleration when available").
        </li>
      </ul>
    </div>
  );
}
