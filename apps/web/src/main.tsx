import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// AdminApp is the admin-route entry and drags the entire Supabase
// client (+ RPC helpers) into whatever bundle it lives in. Static
// imports would park all of that in the main chunk for every normal
// user who never passes `?admin=1` — so it's lazy. The admin route
// eats a single round-trip before first paint; everyone else never
// downloads the module.
const AdminApp = lazy(() => import('./ui/AdminApp').then((m) => ({ default: m.AdminApp })));

/** Admin panel lives at `?admin=1` — same origin, but without the
 *  editor mounted. A path-based `/admin` would require the GitHub Pages
 *  SPA-fallback dance (404.html copy), a query flag avoids that entirely
 *  and matches the existing `?r=<room>` routing convention. */
const isAdminRoute =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('admin') === '1';

// three-mesh-bvh (pulled in by three-gpu-pathtracer 0.0.23) spams a
// deprecation warning about `maxLeafTris` every time a BVH is built.
// The library author renamed the option to `maxLeafSize`, but the
// pathtracer version we're pinned at (0.0.23 — last one compatible with
// three 0.171) still passes the old name. Upgrading would break the
// whole render stack. Filter just this one message so the console
// stays readable; every other warning still surfaces.
const origWarn = console.warn;
console.warn = function filteredWarn(...args: unknown[]): void {
  const first = args[0];
  if (typeof first === 'string' && first.includes('"maxLeafTris" option has been deprecated')) {
    return;
  }
  origWarn.apply(console, args);
};

// Clickjacking defence. GitHub Pages can't send X-Frame-Options, and meta
// CSP doesn't honour frame-ancestors — if the page finds itself inside an
// iframe, redirect the parent frame to our URL so UI redress attacks can't
// hide overlays over the app. Uses try/catch because reading top.location
// throws on cross-origin framing (which is exactly when we need to bust).
try {
  if (window.top && window.top !== window.self) {
    window.top.location.href = window.self.location.href;
  }
} catch {
  // Same-origin violation means we're definitely framed cross-origin.
  // Replace the current window's location with a bare about:blank to
  // neutralise anything the embedder might be overlaying.
  window.location.replace(window.location.href);
}

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    {isAdminRoute ? (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
