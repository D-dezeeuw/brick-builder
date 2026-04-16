import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Catches render-phase errors from the Canvas subtree (three.js init, shader
 * compilation, postprocessing, pathtracer — anywhere). Replaces the scene
 * with a readable message + recovery actions so a GPU hiccup doesn't blank
 * the whole app.
 *
 * Error boundaries must be class components; this is the only class in the
 * codebase.
 */
export class SceneErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[scene] crashed:', error, info);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  private reload = (): void => {
    location.reload();
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fallback">
        <h2>The 3D canvas stopped working.</h2>
        <p className="fallback__body">
          This usually means the GPU dropped the WebGL context. Reload to start fresh, or
          retry in place — your work autosaves to localStorage.
        </p>
        <pre className="fallback__error">{this.state.error.message}</pre>
        <div className="fallback__actions">
          <button type="button" className="fallback__btn" onClick={this.reset}>
            Retry
          </button>
          <button type="button" className="fallback__btn fallback__btn--primary" onClick={this.reload}>
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
