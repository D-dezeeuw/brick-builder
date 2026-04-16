import { Scene } from './scene/Scene';

export function App() {
  return (
    <div className="app-shell">
      <header className="top-bar">
        <h1 className="title">Untitled Creation</h1>
      </header>
      <main className="canvas-host">
        <Scene />
      </main>
      <aside className="sidebar">
        <p className="sidebar-placeholder">Brick catalog (Phase 2)</p>
      </aside>
    </div>
  );
}
