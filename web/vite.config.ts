import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = "http://localhost:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // host: true exposes the dev server on your LAN so you can test from a phone.
    host: true,
    port: 5180,
    strictPort: true,
    proxy: {
      "/api": api,
      "/uploads": api,
    },
  },
});
