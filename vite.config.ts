import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Proxy to whatever port the API server reads from .env / the environment.
  const apiPort = process.env.PORT || loadEnv(mode, process.cwd(), '').PORT || '8787';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
    },
  };
});
