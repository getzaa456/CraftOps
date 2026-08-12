import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Mirrors the nginx proxy used in the k8s deploy (Phase 7) — lets the
      // frontend call relative "/api/v1" in both dev and prod, no .env needed.
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});