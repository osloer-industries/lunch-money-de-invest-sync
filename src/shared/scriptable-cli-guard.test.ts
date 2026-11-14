import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SetupFilesystem, SetupPrompter } from "../setup/types.js";
import { runCategoriesCli } from "../categories/run-categories-cli.js";
import { runSetupCli } from "../setup.js";
import { runSyncCli } from "../sync.js";
import type { SyncConfig } from "./config.js";
import { scriptableCliErrorSchema } from "./scriptable-json-contract.js";
import {
  parityDryRunClient,
  parityDryRunCollectors,
  paritySyncConfig,
} from "../dry-run-review/parity-fixture.js";

const runSetup = vi.hoisted(() => vi.fn());
const runCategoryMappingSetup = vi.hoisted(() => vi.fn());

vi.mock("../setup/run-setup.js", () => ({ runSetup }));
vi.mock("../setup/run-category-mapping.js", () => ({ runCategoryMappingSetup }));

async function withStdinIsTTY<T>(value: boolean | undefined, run: () => Promise<T>): Promise<T> {
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

function spyPrompter(): SetupPrompter {
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
    exists: () => true,
    readText: () => JSON.stringify({ categoryMap: {}, tagMap: {} }),
    writeText: vi.fn(),
    chmod: vi.fn(),
  };
}

describe("scriptable CLI no-prompt guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test";
  });

  it("setup with --json never calls a prompter on non-interactive success", async () => {
    const prompter = spyPrompter();
    runSetup.mockResolvedValueOnce({ kind: "completed" });
    await withStdinIsTTY(false, () =>
      runSetupCli(
        ["--non-interactive", "--json", "--trade-republic", "--owner", "operator-a", "--lunch-money-asset-id", "1"],
        { prompter, filesystem: stubFilesystem() },
      ),
    );
    expect(prompter.confirm).not.toHaveBeenCalled();
    expect(prompter.select).not.toHaveBeenCalled();
    expect(prompter.input).not.toHaveBeenCalled();
  });

  it("setup with --json writes a structured error without prompting when input is incomplete", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const prompter = spyPrompter();
    delete process.env["LUNCH_MONEY_API_KEY"];
    runSetup.mockRejectedValueOnce(new Error("requires --owner and --lunch-money-asset-id"));
    await withStdinIsTTY(false, async () => {
      await expect(
        runSetupCli(["--non-interactive", "--json", "--trade-republic"], {
          prompter,
          filesystem: stubFilesystem(),
        }),
      ).rejects.toThrow(/requires --owner/);
    });
    const payload = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as unknown;
    expect(scriptableCliErrorSchema.safeParse(payload).success).toBe(true);
    expect(prompter.confirm).not.toHaveBeenCalled();
    stdout.mockRestore();
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test";
  });

  it("sync with --json never calls a prompter", async () => {
    const prompter = spyPrompter();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await withStdinIsTTY(false, () =>
      runSyncCli(["--dry-run", "--json", "--non-interactive"], {
        readConfig: () => paritySyncConfig(),
        createClient: () => parityDryRunClient() as never,
        collectors: parityDryRunCollectors(),
        prompter,
        filesystem: stubFilesystem(),
      }),
    );
    expect(prompter.confirm).not.toHaveBeenCalled();
    expect(prompter.select).not.toHaveBeenCalled();
    stdout.mockRestore();
  });

  it("categories apply with --json writes structured error without prompting when args are missing", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const prompter = spyPrompter();
    const config: SyncConfig = {
      lunchMoneyApiKey: "k",
      sharedCardLast4: [],
      tradeRepublicProfiles: [],
      scalableCapitalProfiles: [],
      categoryMap: {},
      tagMap: {},
    };
    await withStdinIsTTY(false, async () => {
      await expect(
        runCategoriesCli(["apply", "--json", "--non-interactive"], {
          filesystem: stubFilesystem(),
          readConfig: () => config,
          createClient: () => ({}) as never,
          prompter,
        }),
      ).rejects.toThrow(/apply requires/);
    });
    const payload = JSON.parse(String(stdout.mock.calls[0]?.[0])) as unknown;
    expect(scriptableCliErrorSchema.safeParse(payload).success).toBe(true);
    expect(prompter.confirm).not.toHaveBeenCalled();
    stdout.mockRestore();
  });
});