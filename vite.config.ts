import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Isolate the three.js runtime. Application 3D code (data store,
          // types, registry) is three-free and stays in the main graph; the
          // three3d chunk is only fetched when the lazy 3D viewport loads.
          if (id.includes("node_modules/three")) return "three3d";
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/") ||
            id.includes("node_modules/zustand/") ||
            id.includes("node_modules/use-sync-external-store/")
          ) {
            return "vendor-react";
          }
          return undefined;
        },
      },
    },
  },
  worker: {
    format: "es",
  },
  clearScreen: false,
});