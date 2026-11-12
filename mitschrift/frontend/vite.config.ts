import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Das Moch-Design-System liegt zwei Ebenen höher unter design/ und wird von
// dort eingebunden, nicht kopiert (CLAUDE.md: moch.css nie von Hand ändern).
const design = fileURLToPath(new URL('../../design', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@design': design } },
  server: {
    host: true,
    fs: { allow: ['..', design] },
    // Im Entwicklungsmodus geht /api an das Backend auf Port 8000.
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false } },
  },
  build: { target: 'es2020', sourcemap: false },
});
