import { Scene } from './scene/Scene';
import { Sidebar } from './ui/Sidebar';
import { TopBar } from './ui/TopBar';
import { useKeybindings } from './state/useKeybindings';

export function App() {
  useKeybindings();
  return (
    <div className="app-shell">
      <header className="top-bar">
        <TopBar />
      </header>
      <main className="canvas-host">
        <Scene />
      </main>
      <aside className="sidebar">
        <Sidebar />
      </aside>
    </div>
  );
}
