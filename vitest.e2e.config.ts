import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e/journeys/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    env: {
      TZ: process.env.TZ ?? "UTC",
    },
    pool: "forks",
    fileParallelism: false,
  },
});