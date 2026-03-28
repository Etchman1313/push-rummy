import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    target: "es2022",
    minify: "esbuild",
    esbuild: {
      drop: mode === "production" ? ["console", "debugger"] : []
    }
  },
  resolve: {
    alias: {
      "@push-rummy/shared": path.resolve(__dirname, "../shared/src/index.ts")
    }
  },
  server: {
    port: 5173,
    /* Allow other machines (LAN / port-forward) to load the dev UI */
    host: true
  }
}));
