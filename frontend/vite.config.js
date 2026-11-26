import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE is the folder the site is served from. On GitHub Pages a project site lives at /<repository-name>/.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
    // In development, calls to /api go to the local backend, so no CORS setup is needed.
    proxy: { '/api': 'http://localhost:8080' },
  },
});
