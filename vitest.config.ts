// SCH-889: Vitest config for unit tests of pure helpers (no React/jsdom yet).
// Vite's native tsconfig-paths resolution picks up the `@/` alias from
// tsconfig.json so test files can import `@/lib/...` exactly like app code.

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
