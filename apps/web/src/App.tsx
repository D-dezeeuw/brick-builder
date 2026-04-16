import { useEffect, useState } from 'react';
import { Scene } from './scene/Scene';
import { Sidebar } from './ui/Sidebar';
import { TopBar } from './ui/TopBar';
import { BrowserUnsupported } from './ui/BrowserUnsupported';
import { HelpModal } from './ui/HelpModal';
import { Hotbar } from './ui/Hotbar';
import { ImportDropZone } from './ui/ImportDropZone';
import { RenderOverlay } from './ui/RenderOverlay';
import { SceneErrorBoundary } from './ui/SceneErrorBoundary';
import { Toasts } from './ui/Toasts';
import { useFirstRunHelp, useHelpStore } from './state/helpStore';
import { hasWebGL2 } from './state/webgl';
import { useKeybindings } from './state/useKeybindings';
import { usePersistence } from './state/persistence';
import { useRoomRouter } from './multiplayer/useRoomRouter';
import { useRoomWrites } from './multiplayer/roomWrites';
import { warmGeometryCache } from './bricks/geometry/builders';

const MOBILE_BREAKPOINT = 768;

export function App() {
  useKeybindings();
  usePersistence();
  useRoomRouter();
  useRoomWrites();
  useFirstRunHelp();

  const helpOpen = useHelpStore((s) => s.open);
  const setHelpOpen = useHelpStore((s) => s.setOpen);

  useEffect(() => {
    warmGeometryCache();
  }, []);

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
        {hasWebGL2 ? (
          <SceneErrorBoundary>
            <Scene />
          </SceneErrorBoundary>
        ) : (
          <BrowserUnsupported />
        )}
        <RenderOverlay />
        <Hotbar />
        <ImportDropZone />
      </main>
      <Toasts />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <aside className="sidebar" aria-hidden={!sidebarOpen}>
        <Sidebar />
      </aside>
    </div>
  );
}
