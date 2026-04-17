import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

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
    <App />
  </StrictMode>,
);
