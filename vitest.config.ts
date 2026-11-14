import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    setupFiles: ["./vitest.setup.ts"],
    env: {
      TZ: process.env.TZ ?? "UTC",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.spec.ts"],
      thresholds: { branches: 80, functions: 80, lines: 80, statements: 80 }
    }
  }
});
