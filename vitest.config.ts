import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json"],
  },
  test: {
    environment: "node",
    setupFiles: ["./src/ai/tests/setup.ts"],
    include: ["src/ai/tests/**/*.test.ts", "src/3d/tests/**/*.test.ts", "src/editor/tests/**/*.test.ts", "src/ui/**/*.test.ts"],
    testTimeout: 20000,
  },
});