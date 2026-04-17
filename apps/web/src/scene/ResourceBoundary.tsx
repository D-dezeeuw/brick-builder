import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Swallowed render output when a child throws — usually `null`. */
  fallback?: ReactNode;
  /** Optional tag for log messages so failures are distinguishable. */
  name?: string;
};

type State = { failed: boolean };

/**
 * Narrow error boundary for optional scene resources (HDRI, path tracer,
 * post-FX). Unlike SceneErrorBoundary — which catches critical Canvas
 * errors and shows a full-screen fallback — this one degrades silently:
 * the failing subtree is replaced with `fallback` (default `null`) and the
 * rest of the scene keeps rendering.
 *
 * Used so a CDN hiccup on `<Environment>` doesn't take the whole canvas
 * down.
 */
export class ResourceBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    console.warn(`[${this.props.name ?? 'resource'}] failed, skipping:`, error.message);
  }

  override render(): ReactNode {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
