import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    target: 'es2022',
    // Rapier's compat build inlines its WASM as base64, so the single game
    // chunk is intentionally large for the W1 prototype.
    chunkSizeWarningLimit: 5000,
  },
});
