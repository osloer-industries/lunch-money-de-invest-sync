import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SetupFilesystem, SetupPrompter } from "./setup/types.js";

const runCategoryMappingSetup = vi.hoisted(() => vi.fn().mockResolvedValue({ kind: "completed" as const }));
const runSetup = vi.hoisted(() => vi.fn().mockResolvedValue({ kind: "completed" as const }));

vi.mock("./setup/run-category-mapping.js", () => ({
  runCategoryMappingSetup,
}));

vi.mock("./setup/run-setup.js", () => ({
  runSetup,
}));

import { runSetupCli } from "./setup.js";

function stubPrompter(): SetupPrompter {
  return {
    password: vi.fn(),
    input: vi.fn(),
    select: vi.fn(),
    checkbox: vi.fn(),
    search: vi.fn(),
    confirm: vi.fn(),
    print: vi.fn(),
    waitForEnter: vi.fn(),
  };
}

function stubFilesystem(): SetupFilesystem {
  return {
    exists: () => false,
    readText: () => null,
    writeText: async () => {},
    chmod: async () => {},
  };
}

describe("runSetupCli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prints setup help", async () => {
    const logger = vi.fn();
    await runSetupCli(["--help"], { logger });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("--categories"));
    expect(runSetup).not.toHaveBeenCalled();
    expect(runCategoryMappingSetup).not.toHaveBeenCalled();
  });

  it("routes --categories to category mapping", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    await runSetupCli(["--categories"], {
      prompter: stubPrompter(),
      filesystem: stubFilesystem(),
    });
    expect(runCategoryMappingSetup).toHaveBeenCalledOnce();
    expect(runSetup).not.toHaveBeenCalled();
  });

  it("runs full setup when --categories is omitted", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    await runSetupCli([], {
      prompter: stubPrompter(),
      filesystem: stubFilesystem(),
      runners: {},
    });
    expect(runSetup).toHaveBeenCalledOnce();
    expect(runCategoryMappingSetup).not.toHaveBeenCalled();
  });
});
