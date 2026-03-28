import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["server/src/**/*.test.ts"],
    fileParallelism: false,
    sequence: { shuffle: false },
    setupFiles: ["./server/vitest.setup.ts"],
    env: {
      DB_PATH: ":memory:",
      NODE_ENV: "test",
      JWT_SECRET: "vitest-jwt-secret-minimum-32-characters-x"
    },
    coverage: {
      provider: "v8",
      include: ["server/src/**/*.ts"],
      /* HTTP + Socket bootstrap: covered by integration tests but hard to instrument at 90% without duplicating routes. */
      exclude: ["**/*.test.ts", "server/src/index.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 75
      }
    }
  }
});
