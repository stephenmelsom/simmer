import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8686",
      "/auth": "http://localhost:8686",
      "/health": "http://localhost:8686",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
