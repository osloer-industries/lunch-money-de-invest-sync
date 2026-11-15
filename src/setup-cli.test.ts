import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SetupFilesystem, SetupPrompter } from "./setup/types.js";

const runCategoryMappingSetup = vi.hoisted(() => vi.fn().mockResolvedValue({ kind: "completed" as const }));
const runSetup = vi.hoisted(() => vi.fn().mockResolvedValue({ kind: "completed" as const }));
const runDoctor = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    ok: true,
    checks: [{ name: "node", ok: true, detail: "Node.js v24" }],
  }),
);

vi.mock("./setup/run-category-mapping.js", () => ({
  runCategoryMappingSetup,
}));

vi.mock("./setup/run-setup.js", () => ({
  runSetup,
}));

vi.mock("./doctor.js", () => ({
  runDoctor,
}));

import { assertInteractiveSetupAllowed, runSetupCli } from "./setup.js";

async function withStdinIsTTY<T>(value: boolean | undefined, run: () => T | Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  if (value === undefined) {
    Reflect.deleteProperty(process.stdin, "isTTY");
  } else {
    Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
  }
  try {
    return await run();
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
  it("allows non-interactive setup without a TTY", async () => {
    await withStdinIsTTY(false, () => {
      expect(() => assertInteractiveSetupAllowed({ help: false, nonInteractive: true } as never)).not.toThrow();
    });
  });

  it("rejects interactive setup when stdin is not a TTY", async () => {
    await withStdinIsTTY(false, () => {
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

  it("does not print doctor output during setup", async () => {
    const vitest = process.env.VITEST;
    delete process.env.VITEST;
    const logger = vi.fn();
    try {
      await withStdinIsTTY(true, () =>
        runSetupCli([], {
          prompter: stubPrompter(),
          filesystem: stubFilesystem(),
          runners: {},
          logger,
        }),
      );
      expect(runDoctor).not.toHaveBeenCalled();
      expect(logger).not.toHaveBeenCalledWith(expect.stringContaining("doctor"));
      expect(runSetup).toHaveBeenCalledOnce();
    } finally {
      if (vitest !== undefined) {
        process.env.VITEST = vitest;
      }
    }
  });
});
