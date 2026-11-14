import { describe, expect, it, vi } from "vitest";
import { runCategoriesCli } from "./run-categories-cli.js";

describe("categories cli entry", () => {
  const filesystem = {
    exists: () => false,
    readText: () => null,
    writeText: vi.fn(),
    chmod: vi.fn(),
  };

  it("prints help for --help", async () => {
    const logger = vi.fn();
    await runCategoriesCli(["--help"], { filesystem, logger });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });

  it("prints help when command is missing", async () => {
    const logger = vi.fn();
    await runCategoriesCli([], { filesystem, logger });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });
});