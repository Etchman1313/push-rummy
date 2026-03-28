import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["shared/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["shared/src/**/*.ts"],
      exclude: [
        "shared/src/types.ts",
        "shared/src/index.ts",
        "**/*.test.ts",
        "**/test-helpers.ts"
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85
      }
    }
  }
});
