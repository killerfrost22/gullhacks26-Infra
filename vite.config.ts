import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Read PORT from .env (server-side settings are never exposed: no VITE_ prefix).
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = env.PORT || '8787';

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      // Not Vite's default 5173: other local projects (e.g. Crucible) use it, and `localhost:5173` would open theirs.
      port: 5180,
      strictPort: true,
      // Keep the browser's Host header: /api/investigate requires Origin and Host to match. The string shorthand
      // would set changeOrigin: true and rewrite Host to the API's port.
      proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
    },
    preview: { host: '127.0.0.1' },
    build: { target: 'es2022', sourcemap: false },
  };
});
