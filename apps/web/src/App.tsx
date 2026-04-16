import { useEffect, useState } from 'react';
import { Scene } from './scene/Scene';
import { Sidebar } from './ui/Sidebar';
import { TopBar } from './ui/TopBar';
import { useKeybindings } from './state/useKeybindings';

const MOBILE_BREAKPOINT = 768;

export function App() {
  useKeybindings();

  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth > MOBILE_BREAKPOINT,
  );

  // Auto-collapse when viewport shrinks past the breakpoint so the canvas
  // gets all the real estate, but never force-open on grow (let the user keep
  // their choice).
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth <= MOBILE_BREAKPOINT) setSidebarOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className={`app-shell${sidebarOpen ? ' app-shell--sidebar-open' : ''}`}>
      <header className="top-bar">
        <TopBar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((v) => !v)} />
      </header>
      <main className="canvas-host">
        <Scene />
      </main>
      <aside className="sidebar" aria-hidden={!sidebarOpen}>
        <Sidebar />
      </aside>
    </div>
  );
}
