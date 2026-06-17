import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Public site
        main: resolve(__dirname, 'index.html'),
        // Hidden, non-gated analytics dashboard (not linked anywhere public)
        secretadminlink: resolve(__dirname, 'secretadminlink.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
