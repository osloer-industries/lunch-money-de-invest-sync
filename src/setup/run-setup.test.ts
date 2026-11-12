import { describe, expect, it, vi } from "vitest";
import { manualAccountChoices, runSetup } from "./run-setup.js";
import type { SetupCliOptions } from "./setup-options.js";
import type { LunchMoneySetupClient, PromptChoice, SetupFilesystem, SetupPrompter } from "./types.js";

interface FakePrompterOptions {
  readonly password?: string;
  readonly brokers?: string[];
  readonly inputs?: string[];
  readonly selects?: string[];
  readonly confirms?: (message: string) => boolean;
}

function fakePrompter(options: FakePrompterOptions): SetupPrompter {
  let inputIndex = 0;
  let selectIndex = 0;
  return {
    password: vi.fn<() => Promise<string>>(async () => options.password ?? ""),
    input: vi.fn<() => Promise<string>>(async () => options.inputs?.[inputIndex++] ?? ""),
    checkbox: vi.fn<() => Promise<string[]>>(async () => options.brokers ?? []),
    async select<T extends string>(_message: string, _choices: readonly PromptChoice<T>[]): Promise<T> {
      const value = options.selects?.[selectIndex++] ?? "";
      return value as T;
    },
    search: vi.fn<() => Promise<string>>(async () => ""),
    confirm: vi.fn<(message: string) => Promise<boolean>>(async (message: string) =>
      options.confirms ? options.confirms(message) : true,
    ),
    print: vi.fn<(line: string) => void>(),
    waitForEnter: vi.fn<() => Promise<void>>(async () => undefined),
  };
}

function fakeFilesystem(): SetupFilesystem {
  const files = new Map<string, string>();
  return {
    exists: vi.fn((path) => files.has(path)),
    readText: vi.fn((path) => files.get(path) ?? null),
    writeText: vi.fn(async (path, content) => {
      files.set(path, content);
    }),
    chmod: vi.fn(async () => undefined),
  };
}

function defaultRunSetupDeps(
  overrides: Partial<{
    prompter: SetupPrompter;
    filesystem: SetupFilesystem;
    runners: import("./types.js").SetupBrokerRunners;
    runSync: typeof import("../sync.js").runSyncCli;
    createLunchMoneyClient: () => LunchMoneySetupClient;
  }> = {},
) {
  return {
    prompter: fakePrompter({}),
    filesystem: fakeFilesystem(),
    runners: {},
    nodeVersion: "v24.0.0",
    createLunchMoneyClient: () => fakeLmClient(),
    ...overrides,
  };
}

function fakeLmClient(): LunchMoneySetupClient {
  return {
    manualAccounts: {
      getAll: vi.fn().mockResolvedValue([{ id: 3, name: "TR operator-a" }]),
      create: vi.fn().mockResolvedValue({ id: 99, name: "Trade Republic (operator-a)" }),
    },
    categories: {
      getAll: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  } as unknown as LunchMoneySetupClient;
}

function trInteractivePrompter(overrides: Partial<FakePrompterOptions> = {}): SetupPrompter {
  return fakePrompter({
    password: "lm_test_key",
    brokers: ["trade-republic"],
    inputs: ["operator-a", "[]"],
    selects: ["3"],
    ...overrides,
  });
}

function baseSetupOptions(overrides: Partial<SetupCliOptions> = {}): SetupCliOptions {
  return {
    nonInteractive: false,
    skipBrokerCheck: true,
    yes: true,
    tradeRepublic: false,
    scalableCapital: false,
    owner: null,
    lunchMoneyAssetId: null,
    portfolioId: null,
    categories: false,
    exportTypeSummary: null,
    help: false,
    ...overrides,
  };
}

describe("runSetup", () => {
  it("rejects non-interactive mode without a broker flag", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    await expect(
      runSetup(
        baseSetupOptions({
          nonInteractive: true,
          tradeRepublic: false,
          scalableCapital: false,
          owner: "operator-a",
          lunchMoneyAssetId: 3,
        }),
        defaultRunSetupDeps(),
      ),
    ).rejects.toThrow(/requires --trade-republic/);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("rejects incomplete non-interactive flags", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    await expect(
      runSetup(
        baseSetupOptions({
          nonInteractive: true,
          tradeRepublic: true,
          lunchMoneyAssetId: 3,
        }),
        defaultRunSetupDeps(),
      ),
    ).rejects.toThrow(/requires --owner/);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("requires an API key in non-interactive mode", async () => {
    delete process.env["LUNCH_MONEY_API_KEY"];
    await expect(
      runSetup(
        baseSetupOptions({
          nonInteractive: true,
          tradeRepublic: true,
          owner: "operator-a",
          lunchMoneyAssetId: 1,
        }),
        defaultRunSetupDeps(),
      ),
    ).rejects.toThrow(/LUNCH_MONEY_API_KEY/);
  });

  it("writes .env and config.json in non-interactive mode", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const result = await runSetup(
      baseSetupOptions({
        nonInteractive: true,
        tradeRepublic: true,
        owner: "operator-a",
        lunchMoneyAssetId: 3,
      }),
      defaultRunSetupDeps({ runSync: vi.fn().mockResolvedValue(undefined) }),
    );
    if (result.kind !== "completed") {
      throw new Error("expected completed setup");
    }
    expect(result.config.tradeRepublicProfiles[0]?.owner).toBe("operator-a");
    expect(result.files.envPath.endsWith(".env")).toBe(true);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("runs the interactive Trade Republic flow", async () => {
    const result = await runSetup(
      baseSetupOptions(),
      defaultRunSetupDeps({
        prompter: trInteractivePrompter(),
        runSync: vi.fn().mockResolvedValue(undefined),
      }),
    );
    expect(result.kind).toBe("completed");
  });

  it("supports scalable capital in non-interactive mode", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const result = await runSetup(
      baseSetupOptions({
        nonInteractive: true,
        scalableCapital: true,
        owner: "operator-b",
        lunchMoneyAssetId: 4,
        portfolioId: "portfolio-operator-b",
      }),
      defaultRunSetupDeps(),
    );
    expect(result.kind).toBe("completed");
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("configures scalable capital interactively with portfolio selection", async () => {
    const scRunner = {
      run: vi.fn().mockResolvedValue({
        stdout: JSON.stringify({
          ok: true,
          command: "broker.portfolios",
          data: {
            portfolios: [
              { id: "portfolio-operator-a", name: "A" },
              { id: "portfolio-operator-b", name: "B" },
            ],
          },
        }),
        stderr: "",
        exitCode: 0,
      }),
    };
    const result = await runSetup(
      baseSetupOptions(),
      defaultRunSetupDeps({
        prompter: fakePrompter({
          password: "lm_test_key",
          brokers: ["scalable-capital"],
          inputs: ["operator-b", "[]"],
          selects: ["3", "portfolio-operator-b"],
        }),
        runners: { sc: scRunner },
        runSync: vi.fn().mockResolvedValue(undefined),
      }),
    );
    if (result.kind !== "completed") {
      throw new Error("expected completed setup");
    }
    expect(result.config.scalableCapitalProfiles[0]?.portfolioId).toBe("portfolio-operator-b");
  });

  it("rejects an unknown manual account id", async () => {
    await expect(
      runSetup(
        baseSetupOptions(),
        defaultRunSetupDeps({
          prompter: trInteractivePrompter({ selects: ["999"] }),
        }),
      ),
    ).rejects.toThrow(/was not returned/);
  });

  it("validates sharedCardLast4 JSON", async () => {
    await expect(
      runSetup(
        baseSetupOptions(),
        defaultRunSetupDeps({
          prompter: trInteractivePrompter({ inputs: ["operator-a", '["12"]'] }),
        }),
      ),
    ).rejects.toThrow();
  });

  it("refuses to overwrite an existing .env without confirmation", async () => {
    const fs = fakeFilesystem();
    (fs.exists as ReturnType<typeof vi.fn>).mockImplementation((path) => String(path).endsWith(".env"));
    await expect(
      runSetup(
        baseSetupOptions({ yes: false }),
        defaultRunSetupDeps({
          prompter: trInteractivePrompter({
            confirms: (message) => !message.includes(".env"),
          }),
          filesystem: fs,
          runSync: vi.fn(),
        }),
      ),
    ).rejects.toThrow(/overwrite existing .env/);
  });

  it("creates a Lunch Money manual account when the operator selects new", async () => {
    const lm = fakeLmClient();
    const result = await runSetup(
      baseSetupOptions(),
      defaultRunSetupDeps({
        prompter: trInteractivePrompter({
          selects: ["__new__"],
          confirms: (message) => message.includes("Create Lunch Money manual account"),
        }),
        runSync: vi.fn().mockResolvedValue(undefined),
        createLunchMoneyClient: () => lm,
      }),
    );
    expect(result.kind).toBe("completed");
    expect(lm.manualAccounts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Trade Republic (operator-a)",
        institution_name: "Trade Republic",
      }),
    );
  });
});

describe("manualAccountChoices", () => {
  it("defaults to creating the broker-specific account when none matches", () => {
    const choices = manualAccountChoices(
      [
        { id: 1, name: "Checking" },
        { id: 2, name: "Savings" },
      ],
      "Scalable Capital (operator-a)",
    );
    expect(choices.map((choice) => choice.value)).toEqual(["__new__", "1", "2"]);
    expect(choices[0]?.name).toBe('Create new manual account "Scalable Capital (operator-a)"');
  });

  it("defaults to an existing account that already has the broker-specific name", () => {
    const choices = manualAccountChoices(
      [
        { id: 1, name: "Checking" },
        { id: 7, name: "trade republic (operator-a)" },
      ],
      "Trade Republic (operator-a)",
    );
    expect(choices.map((choice) => choice.value)).toEqual(["7", "__new__", "1"]);
  });
});
