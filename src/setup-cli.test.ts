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

import { assertInteractiveSetupAllowed, runSetupCli } from "./setup.js";

function withStdinIsTTY<T>(value: boolean | undefined, run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  if (value === undefined) {
    Reflect.deleteProperty(process.stdin, "isTTY");
  } else {
    Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
  }
  try {
    return run();
  } finally {
    if (descriptor) {
      Object.defineProperty(process.stdin, "isTTY", descriptor);
    } else {
      Reflect.deleteProperty(process.stdin, "isTTY");
    }
  }
}

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

describe("assertInteractiveSetupAllowed", () => {
  it("allows non-interactive setup without a TTY", () => {
    withStdinIsTTY(false, () => {
      expect(() => assertInteractiveSetupAllowed({ help: false, nonInteractive: true } as never)).not.toThrow();
    });
  });

  it("rejects interactive setup when stdin is not a TTY", () => {
    withStdinIsTTY(false, () => {
      expect(() => assertInteractiveSetupAllowed({ help: false, nonInteractive: false } as never)).toThrow(/TTY/);
    });
  });
});

describe("runSetupCli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prints setup help without a TTY", async () => {
    const logger = vi.fn();
    await withStdinIsTTY(false, () => runSetupCli(["--help"], { logger }));
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("--categories"));
    expect(runSetup).not.toHaveBeenCalled();
    expect(runCategoryMappingSetup).not.toHaveBeenCalled();
  });

  it("routes --categories to category mapping", async () => {
    await withStdinIsTTY(true, () =>
      runSetupCli(["--categories"], {
        prompter: stubPrompter(),
        filesystem: stubFilesystem(),
      }),
    );
    expect(runCategoryMappingSetup).toHaveBeenCalledOnce();
    expect(runSetup).not.toHaveBeenCalled();
  });

  it("runs full setup when --categories is omitted", async () => {
    await withStdinIsTTY(true, () =>
      runSetupCli([], {
        prompter: stubPrompter(),
        filesystem: stubFilesystem(),
        runners: {},
      }),
    );
    expect(runSetup).toHaveBeenCalledOnce();
    expect(runCategoryMappingSetup).not.toHaveBeenCalled();
  });
});
