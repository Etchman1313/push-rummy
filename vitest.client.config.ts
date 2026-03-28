import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"]
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["client/src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["client/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "client/src/vite-env.d.ts",
        "client/src/main.tsx",
        "client/src/App.tsx",
        "client/src/vitest.d.ts"
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 64
      }
    }
  }
});
