import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Netlify (and local dev) serve from root `/`; GitHub Pages for a project
// repo serves from `/<repo>/`. The Pages workflow sets VITE_BASE_PATH so
// hashed asset URLs resolve correctly there without affecting other hosts.
const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
  },
});
