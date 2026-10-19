import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: "jsdom",
    // Bound DOM-test CPU contention on small runners; keep the normal 5s timeout.
    maxWorkers: 2,
    setupFiles: "./tests/setup.ts",
    css: true,
  },
});
