import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./e2e/support/vitest-global-setup.ts"],
    include: ["e2e/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    env: {
      TZ: process.env.TZ ?? "UTC",
    },
    pool: "forks",
    fileParallelism: false,
  },
});