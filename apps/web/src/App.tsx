import { lazy, Suspense, useEffect, useState } from 'react';
import { Scene } from './scene/Scene';
import { Sidebar } from './ui/Sidebar';
import { TopBar } from './ui/TopBar';
import { BrowserUnsupported } from './ui/BrowserUnsupported';
import { HelpModal } from './ui/HelpModal';
import { Hotbar } from './ui/Hotbar';
import { ImportDropZone } from './ui/ImportDropZone';
import { RenderOverlay } from './ui/RenderOverlay';
import { SceneErrorBoundary } from './ui/SceneErrorBoundary';
import { MobileActionBar } from './ui/MobileActionBar';
import { ObserveBanner } from './ui/ObserveBanner';
import { PasswordPromptModal } from './ui/PasswordPromptModal';
import { SelectionActionBar } from './ui/SelectionActionBar';
import { Toasts } from './ui/Toasts';
import { useFirstRunHelp, useHelpStore } from './state/helpStore';
import { useSettingsStore } from './state/settingsStore';
import { useEditorStore } from './state/editorStore';
import { hasWebGL2 } from './state/webgl';
import { useKeybindings } from './state/useKeybindings';
import { usePersistence } from './state/persistence';
import { useSettingsPersistence } from './state/settingsPersistence';
import { warmGeometryCache } from './bricks/geometry/builders';

// Deferred — loaded on first interaction with each surface to keep
// the initial bundle lean.
const SettingsModal = lazy(() =>
  import('./ui/SettingsModal').then((m) => ({ default: m.SettingsModal })),
);
const ChatPanel = lazy(() =>
  import('./ui/ChatPanel').then((m) => ({ default: m.ChatPanel })),
);
// The whole multiplayer subsystem (Supabase client + realtime + auth)
// loads only when the user actually intends to collaborate — either
// the URL carries ?r=<id> or they click Start/Join room.
const MultiplayerRuntime = lazy(() => import('./multiplayer/MultiplayerRuntime'));

const MOBILE_BREAKPOINT = 768;

export function App() {
  useKeybindings();
  usePersistence();
  useSettingsPersistence();
  useFirstRunHelp();

  const helpOpen = useHelpStore((s) => s.open);
  const setHelpOpen = useHelpStore((s) => s.setOpen);
  const settingsOpen = useSettingsStore((s) => s.open);
  const setSettingsOpen = useSettingsStore((s) => s.setOpen);
  const multiplayerActive = useEditorStore((s) => s.multiplayerActive);

  useEffect(() => {
    warmGeometryCache();
    // Activate the multiplayer runtime on first mount if the URL is
    // already a room link. Otherwise stay lazy — solo users never
    // touch the Supabase bundle.
    if (new URLSearchParams(window.location.search).get('r')) {
      useEditorStore.getState().setMultiplayerActive(true);
    }
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
        <MobileActionBar />
        <SelectionActionBar />
        <ImportDropZone />
      </main>
      <ObserveBanner />
      <Toasts />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Suspense fallback={null}>
        {settingsOpen && (
          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        )}
      </Suspense>
      <PasswordPromptModal />
      <Suspense fallback={null}>{multiplayerActive && <ChatPanel />}</Suspense>
      <Suspense fallback={null}>{multiplayerActive && <MultiplayerRuntime />}</Suspense>
      <aside className="sidebar" aria-hidden={!sidebarOpen}>
        <Sidebar />
      </aside>
    </div>
  );
}
